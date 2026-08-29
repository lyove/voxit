/**
 * Provider 路由：发音人列表、能力声明、试听
 * 凭证统一从服务器 .env 读取（不再接收前端传入的 apiKey/workspaceId）
 */
import { Router } from 'express';
import { VxProvider, type VxSynthesizeInput } from '@voxit/core';
import { initProvider, getCapabilities } from '../providers/registry.js';
import { getProviderCredentials } from '../config.js';
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
 * GET /api/providers/:provider/voices
 * 凭证来自服务器 .env，无需前端传参
 */
providerRoutes.get('/:provider/voices', async (req, res) => {
  try {
    const provider = req.params.provider as VxProvider;
    const { apiKey, workspaceId, resourceId, defaultModel } = getProviderCredentials(provider);
    const p = initProvider(provider, { apiKey, workspaceId, resourceId, defaultModel });
    const voices = await p.listVoices();
    res.json(voices);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * 试听发音人 / 试听段落
 * POST /api/providers/:provider/preview
 * body: { text, voiceId, voiceParams?, format?, sampleRate? }（不含任何凭证）
 */
providerRoutes.post('/:provider/preview', async (req, res) => {
  try {
    const provider = req.params.provider as VxProvider;
    const { apiKey, workspaceId, resourceId, defaultModel } = getProviderCredentials(provider);
    const p = initProvider(provider, { apiKey, workspaceId, resourceId, defaultModel });
    const result = await p.preview(req.body as VxSynthesizeInput);
    res.json(result);
  } catch (e) {
    res.status(inferStatus((e as Error).message)).json({ error: (e as Error).message });
  }
});

/** 列出已支持的 Provider 标识 */
providerRoutes.get('/', (_req, res) => {
  res.json(Object.values(VxProvider));
});
