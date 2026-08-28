/**
 * Provider 路由：发音人列表、能力声明、试听
 */
import { Router } from 'express';
import { VxProvider, type VxSynthesizeInput } from '@voxit/core';
import { initProvider, getCapabilities } from '../providers/registry.js';
import { inferStatus } from './error-utils.js';

export const providerRoutes = Router();

/**
 * 获取 Provider 能力（前端据此动态渲染表单）
 * GET /api/providers/:provider/capabilities
 */
providerRoutes.get('/:provider/capabilities', (req, res) => {
  try {
    const provider = req.params.provider as VxProvider;
    res.json(getCapabilities(provider));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/**
 * 获取发音人列表
 * GET /api/providers/:provider/voices?apiKey=&workspaceId=
 */
providerRoutes.get('/:provider/voices', async (req, res) => {
  try {
    const provider = req.params.provider as VxProvider;
    const { apiKey, workspaceId } = req.query as { apiKey?: string; workspaceId?: string };
    if (!apiKey || !workspaceId) {
      res.status(400).json({ error: '需要 apiKey 和 workspaceId' });
      return;
    }
    const p = initProvider(provider, { apiKey, workspaceId });
    const voices = await p.listVoices();
    res.json(voices);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * 试听发音人 / 试听段落
 * POST /api/providers/:provider/preview
 * body: { text, voiceId, voiceParams?, format?, sampleRate? }
 */
providerRoutes.post('/:provider/preview', async (req, res) => {
  try {
    const provider = req.params.provider as VxProvider;
    const { apiKey, workspaceId, ...input } = req.body as VxSynthesizeInput & { apiKey: string; workspaceId: string };
    if (!apiKey || !workspaceId) {
      res.status(400).json({ error: '需要 apiKey 和 workspaceId' });
      return;
    }
    const p = initProvider(provider, { apiKey, workspaceId });
    const result = await p.preview(input);
    res.json(result);
  } catch (e) {
    res.status(inferStatus((e as Error).message)).json({ error: (e as Error).message });
  }
});

/** 列出已支持的 Provider 标识 */
providerRoutes.get('/', (_req, res) => {
  res.json(Object.values(VxProvider));
});