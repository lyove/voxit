/**
 * 合成服务 —— 段落合成的核心逻辑，供单段和批量复用
 */
import {
  VxParagraphStatus,
  type VxProviderConfig,
} from '@voxit/core';
import { getParagraph, listProjects, updateParagraph } from '../db/repository.js';
import { initProvider } from '../providers/registry.js';
import { getProviderCredentials } from '../config.js';

/** 通过段落 → 章节 → 项目，找到 ProviderConfig */
export function resolveProviderConfig(chapterId: string): VxProviderConfig | undefined {
  for (const proj of listProjects()) {
    if (proj.chapters.some((c) => c.id === chapterId)) {
      return proj.providerConfig;
    }
  }
  return undefined;
}

/** 合成单个段落（已确认有 voiceId） */
export async function synthesizeParagraphById(id: string): Promise<void> {
  const para = getParagraph(id);
  if (!para) throw new Error(`段落 ${id} 不存在`);
  if (!para.voiceId) throw new Error(`段落 ${id} 未选择发音人`);

  const config = resolveProviderConfig(para.chapterId);
  if (!config) throw new Error('无法定位书籍 Provider 配置');

  updateParagraph(para.id, { status: VxParagraphStatus.SYNTHESIZING, error: undefined });

  try {
    const { apiKey, workspaceId } = getProviderCredentials(config.provider);
    const provider = initProvider(config.provider, { apiKey, workspaceId });

    const result = await provider.synthesize({
      text: para.text,
      voiceId: para.voiceId,
      voiceParams: para.voiceParams,
      format: config.audioFormat ?? 'wav',
      sampleRate: config.sampleRate ?? 24000,
    });

    updateParagraph(para.id, {
      status: VxParagraphStatus.DONE,
      audioUrl: result.audioUrl,
      error: undefined,
    });
  } catch (e) {
    updateParagraph(para.id, {
      status: VxParagraphStatus.FAILED,
      error: (e as Error).message,
    });
    throw e;
  }
}

/** 批量合成结果 */
export interface BatchSynthesizeResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  details: { id: string; status: 'done' | 'failed' | 'skipped'; error?: string }[];
}

/** 进度事件（SSE 推送用） */
export interface BatchProgressEvent {
  type: 'progress' | 'done';
  index: number; // 当前段落序号（1-based）
  total: number;
  paragraphId: string;
  status: 'synthesizing' | 'done' | 'failed' | 'skipped';
  error?: string;
  success: number;
  failed: number;
  skipped: number;
  result?: BatchSynthesizeResult; // type=done 时携带最终结果
}

/** 进度回调类型 */
export type ProgressCallback = (event: BatchProgressEvent) => void;

/**
 * 批量合成章节内段落
 * @param chapterId 章节ID
 * @param paragraphIds 段落ID列表（按顺序）；未传则合成章节全部未完成段落
 * @param concurrency 并发数，默认 1（顺序合成，避免触发 Provider 限流）
 * @param onProgress 进度回调（可选，SSE 推送用）
 */
export async function batchSynthesize(
  chapterId: string,
  paragraphIds?: string[],
  concurrency = 1,
  onProgress?: ProgressCallback,
): Promise<BatchSynthesizeResult> {
  const { getParagraphs } = await import('../db/repository.js');
  const all = getParagraphs(chapterId);
  const targets = paragraphIds
    ? all.filter((p) => paragraphIds.includes(p.id))
    : all.filter((p) => p.status !== 'done');

  const result: BatchSynthesizeResult = {
    total: targets.length,
    success: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  const emit = (index: number, paragraphId: string, status: 'done' | 'failed' | 'skipped', error?: string) => {
    if (onProgress) {
      onProgress({
        type: 'progress',
        index,
        total: targets.length,
        paragraphId,
        status,
        error,
        success: result.success,
        failed: result.failed,
        skipped: result.skipped,
      });
    }
  };

  // 顺序处理（concurrency=1），避免限流；后续可扩展并发池
  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const idx = i + 1;
    if (!p.voiceId) {
      result.skipped++;
      result.details.push({ id: p.id, status: 'skipped', error: '未选择发音人' });
      emit(idx, p.id, 'skipped', '未选择发音人');
      continue;
    }
    // 推送"合成中"状态
    if (onProgress) {
      onProgress({ type: 'progress', index: idx, total: targets.length, paragraphId: p.id, status: 'synthesizing', success: result.success, failed: result.failed, skipped: result.skipped });
    }
    try {
      await synthesizeParagraphById(p.id);
      result.success++;
      result.details.push({ id: p.id, status: 'done' });
      emit(idx, p.id, 'done');
    } catch (e) {
      result.failed++;
      result.details.push({ id: p.id, status: 'failed', error: (e as Error).message });
      emit(idx, p.id, 'failed', (e as Error).message);
    }
  }

  // 推送完成事件
  if (onProgress) {
    onProgress({ type: 'done', index: targets.length, total: targets.length, paragraphId: '', status: 'done', success: result.success, failed: result.failed, skipped: result.skipped, result });
  }

  return result;
}