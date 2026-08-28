/**
 * 音频拼接导出 —— 用 ffmpeg 把章节内段落音频拼接成整章
 * 段间插入可配置静音间隔，统一采样率/格式后合并
 */
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import { writeFile, mkdir, rm, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { VxParagraph } from '@voxit/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 解析 ffmpeg 二进制路径：
 * 1. 优先用 ffmpeg-static 包提供的二进制（需确认文件存在）
 * 2. 回退用系统 ffmpeg 命令（brew install ffmpeg）
 */
async function resolveFfmpegPath(): Promise<string> {
  // 尝试 ffmpeg-static 包
  try {
    const ffmpegStatic = (await import('ffmpeg-static')).default as string | undefined;
    if (ffmpegStatic) {
      await access(ffmpegStatic);
      return ffmpegStatic;
    }
  } catch {
    // ffmpeg-static 二进制不存在（install 脚本下载失败），回退系统 ffmpeg
  }
  // 回退：检查系统 ffmpeg 是否可用
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
    return 'ffmpeg'; // 用 PATH 里的 ffmpeg
  } catch {
    throw new Error(
      '未找到 ffmpeg。请任选一种方式安装：\n' +
      '  1. brew install ffmpeg（推荐）\n' +
      '  2. 或修复 ffmpeg-static 包安装（需能访问 GitHub 下载二进制）',
    );
  }
}

// 启动时解析 ffmpeg 路径（异步，首次导出时若未就绪会等待）
let ffmpegReady: Promise<string> | null = null;
function ensureFfmpeg(): Promise<string> {
  if (!ffmpegReady) {
    ffmpegReady = resolveFfmpegPath().then((p) => {
      ffmpeg.setFfmpegPath(p);
      return p;
    });
  }
  return ffmpegReady;
}

/** 下载音频到本地临时文件（支持 URL 和 data:base64） */
async function downloadAudio(url: string, dest: string): Promise<void> {
  if (url.startsWith('data:')) {
    // data:audio/wav;base64,xxxx
    const match = url.match(/^data:audio\/\w+;base64,(.+)$/);
    if (!match) throw new Error(`无法解析 data URL`);
    await writeFile(dest, Buffer.from(match[1], 'base64'));
    return;
  }
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  await writeFile(dest, Buffer.from(resp.data));
}

export interface ExportOptions {
  /** 段间静音时长（秒），默认 0.5 */
  silenceDuration?: number;
  /** 输出格式，默认 mp3 */
  format?: 'mp3' | 'wav';
  /** 采样率，默认 24000 */
  sampleRate?: number;
}

export interface ExportResult {
  /** 拼接后的音频文件路径 */
  filePath: string;
  /** 段落数 */
  paragraphCount: number;
  /** 总时长（秒，估算） */
  duration?: number;
}

/** 导出进度事件（SSE 推送用） */
export interface ExportProgressEvent {
  stage: 'downloading' | 'silence' | 'concat' | 'done' | 'error';
  index: number;
  total: number;
  message: string;
}

/** 导出进度回调 */
export type ExportProgressCallback = (event: ExportProgressEvent) => void;

/**
 * 把章节内已合成段落拼接成整章音频
 * @returns 拼接结果，含文件路径
 */
export async function exportChapterAudio(
  paragraphs: VxParagraph[],
  chapterId: string,
  opts: ExportOptions = {},
  onProgress?: ExportProgressCallback,
): Promise<ExportResult> {
  const { silenceDuration = 0.5, format = 'mp3', sampleRate = 24000 } = opts;

  // 确保 ffmpeg 就绪（ffmpeg-static 二进制或系统 ffmpeg）
  await ensureFfmpeg();

  // 只拼接已合成且有音频的段落
  const done = paragraphs.filter((p) => p.status === 'done' && p.audioUrl);
  if (done.length === 0) {
    throw new Error('章节内没有已合成的段落，请先合成至少一段');
  }

  const emit = (stage: ExportProgressEvent['stage'], index: number, message: string) => {
    onProgress?.({ stage, index, total: done.length, message });
  };

  // 临时目录
  const tmpDir = join(__dirname, '..', 'data', 'export-tmp', chapterId);
  await mkdir(tmpDir, { recursive: true });

  try {
    // 1. 下载各段音频
    const segFiles: string[] = [];
    for (let i = 0; i < done.length; i++) {
      const p = done[i];
      const segPath = join(tmpDir, `seg_${String(i).padStart(3, '0')}.wav`);
      emit('downloading', i + 1, `下载段落 ${i + 1}/${done.length}`);
      await downloadAudio(p.audioUrl!, segPath);
      segFiles.push(segPath);
    }

    // 2. 生成静音片段文件（用于段间间隔）
    const silenceFiles: string[] = [];
    if (silenceDuration > 0 && segFiles.length > 1) {
      emit('silence', 0, '生成段间静音...');
      for (let i = 0; i < segFiles.length - 1; i++) {
        const silPath = join(tmpDir, `sil_${String(i).padStart(3, '0')}.wav`);
        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input('anullsrc=channel_layout=mono:sample_rate=' + sampleRate)
            .inputFormat('lavfi')
            .duration(silenceDuration)
            .save(silPath)
            .on('end', () => resolve())
            .on('error', reject);
        });
        silenceFiles.push(silPath);
      }
    }

    // 3. 交错排列：seg0, sil0, seg1, sil1, seg2 ...
    const ordered: string[] = [];
    for (let i = 0; i < segFiles.length; i++) {
      ordered.push(segFiles[i]);
      if (i < silenceFiles.length) ordered.push(silenceFiles[i]);
    }

    // 4. 生成 concat 列表文件
    emit('concat', 0, '拼接音频...');
    const listPath = join(tmpDir, 'concat.txt');
    const listContent = ordered.map((f) => `file '${f}'`).join('\n');
    await writeFile(listPath, listContent, 'utf-8');

    // 5. ffmpeg concat 拼接 + 统一格式
    const outPath = join(__dirname, '..', 'data', 'exports', `${chapterId}.${format}`);
    await mkdir(dirname(outPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      // concat demuxer 需要单个 input
      cmd
        .input(listPath)
        .inputFormat('concat')
        .outputOptions([
          '-c:a', format === 'mp3' ? 'libmp3lame' : 'pcm_s16le',
          '-ar', String(sampleRate),
          '-ac', '1',
        ])
        .save(outPath)
        .on('end', () => resolve())
        .on('error', reject);
    });

    emit('done', done.length, `导出完成，共 ${done.length} 段`);
    return { filePath: outPath, paragraphCount: done.length };
  } finally {
    // 清理临时目录
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 列出已导出的章节音频文件名 */
export async function listExports(): Promise<string[]> {
  const dir = join(__dirname, '..', 'data', 'exports');
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}