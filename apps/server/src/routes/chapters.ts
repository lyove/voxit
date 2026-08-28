/**
 * 章节路由
 */
import { Router } from 'express';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChapter, getChapters, getParagraphs, renameChapter } from '../db/repository.js';
import { exportChapterAudio } from '../services/audio-export.js';
import { batchSynthesize, resolveProviderConfig } from '../services/synthesize.js';
import { initProvider } from '../providers/registry.js';
import { getProviderCredentials } from '../config.js';
import { DoubaoProvider } from '../providers/doubao.provider.js';
import { VxProvider } from '@voxit/core';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const chapterRoutes = Router();

/**
 * 下载已导出的整章音频
 * GET /api/chapters/download/:fileName
 * 注意：必须注册在 /:projectId 之前，否则会被动态参数吞掉
 */
chapterRoutes.get('/download/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  // 防路径穿越：过滤 .. / \ 和空字节
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    res.status(400).json({ error: '非法文件名' });
    return;
  }
  const exportsDir = resolve(join(__dirname, '..', 'data', 'exports'));
  const filePath = resolve(exportsDir, fileName);
  // 校验解析后路径仍在 exports 目录内
  if (!filePath.startsWith(exportsDir)) {
    res.status(400).json({ error: '非法文件名' });
    return;
  }
  res.download(filePath, fileName);
});

/** 列出项目的章节 */
chapterRoutes.get('/:projectId', (req, res) => {
  res.json(getChapters(req.params.projectId));
});

/** 创建章节 */
chapterRoutes.post('/', (req, res) => {
  const { projectId, title } = req.body as { projectId: string; title: string };
  if (!projectId || !title) {
    res.status(400).json({ error: '需要 projectId 和 title' });
    return;
  }
  const ch = createChapter(projectId, title);
  res.status(201).json(ch);
});

/** 重命名章节 */
chapterRoutes.patch('/:chapterId/rename', (req, res) => {
  const { title } = req.body as { title: string };
  if (!title) {
    res.status(400).json({ error: '需要 title' });
    return;
  }
  const ch = renameChapter(req.params.chapterId, title);
  if (!ch) {
    res.status(404).json({ error: '章节不存在' });
    return;
  }
  res.json(ch);
});

/**
 * 导出整章音频（SSE 流式进度推送）
 * POST /api/chapters/:chapterId/export
 * 响应：text/event-stream，推送 downloading/silence/concat/done 进度
 * done 事件携带 fileName，前端用 GET /api/chapters/download/:fileName 下载
 */
chapterRoutes.post('/:chapterId/export', async (req, res) => {
  const chapterId = req.params.chapterId;
  const { silenceDuration, format, sampleRate } = req.body as {
    silenceDuration?: number;
    format?: 'mp3' | 'wav';
    sampleRate?: number;
  };
  const fmt = format ?? 'mp3';

  // SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const paragraphs = getParagraphs(chapterId);
    if (paragraphs.length === 0) {
      send('error', { error: '章节内没有段落' });
      res.end();
      return;
    }
    const result = await exportChapterAudio(
      paragraphs,
      chapterId,
      { silenceDuration, format: fmt, sampleRate },
      (e) => send(e.stage, e),
    );
    const fileName = `chapter-${chapterId}.${fmt}`;
    send('done', { fileName, paragraphCount: result.paragraphCount });
  } catch (e) {
    send('error', { error: (e as Error).message });
  } finally {
    res.end();
  }
});

/**
 * 下载已导出的整章音频
 * GET /api/chapters/download/:fileName
 * （已移到 /:projectId 之前注册，见文件上方）
 */

/**
 * 批量合成章节内所有未完成段落（SSE 流式进度推送）
 * POST /api/chapters/:chapterId/synthesize-all
 * body: { paragraphIds?, concurrency? }
 * 响应：text/event-stream，逐条推送 progress / done 事件
 */
chapterRoutes.post('/:chapterId/synthesize-all', async (req, res) => {
  const { paragraphIds, concurrency } = req.body as {
    paragraphIds?: string[];
    concurrency?: number;
  };

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await batchSynthesize(
      req.params.chapterId,
      paragraphIds,
      concurrency ?? 1,
      (e) => send(e.type, e),
    );
  } catch (e) {
    send('error', { error: (e as Error).message });
  } finally {
    res.end();
  }
});

/**
 * 整章长文本合成（仅豆包支持，整章文本一次性合成）
 * POST /api/chapters/:chapterId/synthesize-long
 * body: { voiceId, voiceParams? }
 * 响应：SSE，推送 progress/done/error
 */
chapterRoutes.post('/:chapterId/synthesize-long', async (req, res) => {
  const { voiceId, voiceParams } = req.body as { voiceId: string; voiceParams?: import('@voxit/core').VxVoiceParams };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (!voiceId) {
    send('error', { error: '需要 voiceId' });
    res.end();
    return;
  }

  try {
    const paragraphs = getParagraphs(req.params.chapterId);
    if (paragraphs.length === 0) {
      send('error', { error: '章节内没有段落' });
      res.end();
      return;
    }
    // 拼接整章文本
    const fullText = paragraphs.map((p) => p.text).join('\n');

    // 查 Provider 配置
    const config = resolveProviderConfig(req.params.chapterId);
    if (!config) {
      send('error', { error: '无法定位书籍 Provider 配置' });
      res.end();
      return;
    }
    if (config.provider !== VxProvider.DOUBAO) {
      send('error', { error: '整章长文本合成仅支持豆包，阿里云请用「一键合成」逐段合成' });
      res.end();
      return;
    }

    const { apiKey, workspaceId } = getProviderCredentials(config.provider);
    const provider = initProvider(config.provider, { apiKey, workspaceId }) as DoubaoProvider;
    const result = await provider.synthesizeLongText(
      { text: fullText, voiceId, voiceParams, format: config.audioFormat ?? 'mp3', sampleRate: config.sampleRate ?? 24000 },
      (stage) => send('progress', { stage }),
    );
    send('done', { audioUrl: result.audioUrl });
  } catch (e) {
    send('error', { error: (e as Error).message });
  } finally {
    res.end();
  }
});