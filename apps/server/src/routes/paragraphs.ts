/**
 * 段落路由：创建、更新、合成、试听
 */
import { Router } from 'express';
import {
  VxParagraphStatus,
  VxProvider,
  VxRole,
  type VxParagraph,
} from '@voxit/core';
import {
  createParagraph,
  findTemplate,
  getParagraph,
  getParagraphs,
  listProjects,
  updateParagraph,
} from '../db/repository.js';
import { initProvider } from '../providers/registry.js';
import { getProviderCredentials } from '../config.js';
import { resolveProviderConfig, synthesizeParagraphById } from '../services/synthesize.js';
import { sendError } from './error-utils.js';

export const paragraphRoutes = Router();

/** 列出章节的段落 */
paragraphRoutes.get('/:chapterId', (req, res) => {
  res.json(getParagraphs(req.params.chapterId));
});

/** 创建段落 */
paragraphRoutes.post('/', (req, res) => {
  const { chapterId, text, role, characterName } = req.body as {
    chapterId: string;
    text: string;
    role: VxRole;
    characterName?: string;
  };
  if (!chapterId || !role) {
    res.status(400).json({ error: '需要 chapterId 和 role' });
    return;
  }
  let p = createParagraph(chapterId, text, role, characterName);

  // 角色段落：自动套用项目内同名角色模板（填入 voiceId + voiceParams）
  if (role === 'character' && characterName) {
    const projectId = listProjects().find((proj) => proj.chapters.some((c) => c.id === chapterId))?.id;
    if (projectId) {
      const tpl = findTemplate(projectId, characterName);
      if (tpl) {
        p = updateParagraph(p.id, { voiceId: tpl.voiceId, voiceParams: tpl.voiceParams }) ?? p;
      }
    }
  }
  res.status(201).json(p);
});

/** 更新段落（文本、角色、发音人、参数等） */
paragraphRoutes.patch('/:id', (req, res) => {
  const patch = req.body as Partial<VxParagraph>;
  const updated = updateParagraph(req.params.id, patch);
  if (!updated) {
    res.status(404).json({ error: '段落不存在' });
    return;
  }
  res.json(updated);
});

/**
 * 合成段落语音
 * POST /api/paragraphs/:id/synthesize
 * body 可带 audioUrl：复用前端勾选的试听音频直接作为合成结果，不重新调用 Provider
 */
paragraphRoutes.post('/:id/synthesize', async (req, res) => {
  try {
    const para = getParagraph(req.params.id);
    if (!para) {
      res.status(404).json({ error: '段落不存在' });
      return;
    }
    const audioUrl = req.body?.audioUrl as string | undefined;
    if (audioUrl) {
      updateParagraph(para.id, {
        status: VxParagraphStatus.DONE,
        audioUrl,
        error: undefined,
      });
    } else {
      if (!para.voiceId) {
        res.status(400).json({ error: '段落未选择发音人' });
        return;
      }
      await synthesizeParagraphById(req.params.id);
    }
    res.json(getParagraph(req.params.id));
  } catch (e) {
    sendError(res, e);
  }
});

/**
 * 试听段落（不持久化合成结果）
 * POST /api/paragraphs/:id/preview
 */
paragraphRoutes.post('/:id/preview', async (req, res) => {
  try {
    const para = getParagraph(req.params.id);
    if (!para || !para.voiceId) {
      res.status(400).json({ error: '段落不存在或未选择发音人' });
      return;
    }
    const config = resolveProviderConfig(para.chapterId);
    if (!config) {
      res.status(400).json({ error: '无法定位书籍 Provider 配置' });
      return;
    }
    const { apiKey, workspaceId } = getProviderCredentials(config.provider);
    const provider = initProvider(config.provider, { apiKey, workspaceId });
    const result = await provider.preview({
      text: para.text,
      voiceId: para.voiceId,
      voiceParams: para.voiceParams,
      format: config.audioFormat ?? 'wav',
      sampleRate: config.sampleRate ?? 24000,
    });
    res.json(result);
  } catch (e) {
    sendError(res, e);
  }
});