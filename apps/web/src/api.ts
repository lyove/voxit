/**
 * 后端 API 客户端
 */
import axios from 'axios';
import { getToken, clearToken } from './auth.js';
import type {
  VxChapter,
  VxParagraph,
  VxProject,
  VxProvider,
  VxProviderCapabilities,
  VxProviderConfig,
  VxVoice,
  VxVoiceParams,
  VxVoiceTemplate,
} from '@voxit/core';

const api = axios.create({ baseURL: '/api' });

/** 共享 axios 实例：自动附带 JWT、统一 401 处理。组件内直接用 http.post 等（URL 不带 /api 前缀） */
export const http = api;

// 请求拦截器：自动附带 JWT
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：401 → 清除 token 并跳登录页（避免在登录页自身重复跳转）
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error?.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/**
 * 从 axios 错误中提取后端返回的 error 字段
 * 后端返回 { error: "..." }，否则用 axios 默认 message
 */
export function extractError(e: unknown): string {
  const err = e as { response?: { data?: { error?: string } }; message?: string };
  return err?.response?.data?.error ?? err?.message ?? '未知错误';
}

/**
 * 试听音频 URL 归一化：
 * 阿里云 OSS 返回的 http:// 地址在 https 前端页面会被浏览器混合内容
 * （Mixed Content）策略直接拦截，导致音频无法加载/播放，统一升级为 https://。
 * base64 data URL 等其余地址原样返回。
 */
export function normalizeAudioUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http://') ? url.replace('http://', 'https://') : url;
}

// ============ Projects ============

export const fetchProjects = () => api.get<VxProject[]>('/projects').then((r) => r.data);
export const fetchProject = (id: string) => api.get<VxProject>(`/projects/${id}`).then((r) => r.data);
export const createProject = (name: string, providerConfig: VxProviderConfig, description?: string) =>
  api.post<VxProject>('/projects', { name, providerConfig, description }).then((r) => r.data);
export const updateProject = (id: string, patch: { name?: string; description?: string; providerConfig?: VxProviderConfig }) =>
  api.patch<VxProject>(`/projects/${id}`, patch).then((r) => r.data);
export const deleteProject = (id: string) =>
  api.delete(`/projects/${id}`);

// ============ Chapters ============

export const fetchChapters = (projectId: string) =>
  api.get<VxChapter[]>(`/chapters/${projectId}`).then((r) => r.data);
export const createChapter = (projectId: string, title: string) =>
  api.post<VxChapter>('/chapters', { projectId, title }).then((r) => r.data);
export const renameChapter = (chapterId: string, title: string) =>
  api.patch<VxChapter>(`/chapters/${chapterId}/rename`, { title }).then((r) => r.data);

/** 导出进度事件 */
export interface ExportProgress {
  stage: 'downloading' | 'silence' | 'concat' | 'done' | 'error';
  index: number;
  total: number;
  message: string;
  fileName?: string;
}

/**
 * 导出整章音频（SSE 流式进度）
 * 完成后返回文件名，调用方用 downloadExport 下载
 */
export async function exportChapterStream(
  chapterId: string,
  onProgress: (e: ExportProgress) => void,
  opts?: { silenceDuration?: number; format?: 'mp3' | 'wav' },
): Promise<string | undefined> {
  const resp = await fetch('/api/chapters/' + chapterId + '/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(opts ?? {}),
  });
  if (!resp.ok || !resp.body) {
    throw new Error('导出请求失败：HTTP ' + resp.status);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fileName: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const lines = evt.split('\n');
      let eventType = 'progress';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr = line.slice(6);
      }
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          if (eventType === 'done' && data.fileName) fileName = data.fileName;
          onProgress({ ...data, stage: eventType });
        } catch { /* ignore */ }
      }
    }
  }
  return fileName;
}

/** 下载已导出的整章音频（走鉴权 header，用 blob 下载） */
export async function downloadExport(fileName: string, displayName?: string): Promise<void> {
  const resp = await fetch(`/api/chapters/download/${fileName}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!resp.ok) throw new Error('下载失败：HTTP ' + resp.status);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = displayName ?? fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** 批量合成进度事件 */
export interface SynthesizeProgress {
  type: 'progress' | 'done' | 'error';
  index: number;
  total: number;
  paragraphId: string;
  status: 'synthesizing' | 'done' | 'failed' | 'skipped';
  error?: string;
  success: number;
  failed: number;
  skipped: number;
  result?: { total: number; success: number; failed: number; skipped: number };
}

/**
 * 批量合成（SSE 流式进度）
 * 用 fetch + ReadableStream 读取 text/event-stream，逐条回调进度
 */
export async function synthesizeAllStream(
  chapterId: string,
  onProgress: (e: SynthesizeProgress) => void,
  paragraphIds?: string[],
): Promise<void> {
  const resp = await fetch('/api/chapters/' + chapterId + '/synthesize-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ paragraphIds }),
  });
  if (!resp.ok || !resp.body) {
    throw new Error('批量合成请求失败：HTTP ' + resp.status);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 事件以空行分隔
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const lines = evt.split('\n');
      let eventType = 'progress';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr = line.slice(6);
      }
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          onProgress({ ...data, type: eventType });
        } catch {
          // 忽略解析失败的事件
        }
      }
    }
  }
}

// ============ Paragraphs ============

export const fetchParagraphs = (chapterId: string) =>
  api.get<VxParagraph[]>(`/paragraphs/${chapterId}`).then((r) => r.data);
export const createParagraph = (chapterId: string, text: string, characterName?: string) =>
  api.post<VxParagraph>('/paragraphs', { chapterId, text, characterName }).then((r) => r.data);
export const updateParagraph = (id: string, patch: Partial<VxParagraph>) =>
  api.patch<VxParagraph>(`/paragraphs/${id}`, patch).then((r) => r.data);
/** 合成段落；body.audioUrl 存在时直接复用该试听音频作为合成结果 */
export const synthesizeParagraph = (id: string, body?: { audioUrl?: string }) =>
  api.post<VxParagraph>(`/paragraphs/${id}/synthesize`, body).then((r) => r.data);
export const previewParagraph = (id: string) =>
  api.post<{ audioUrl?: string; audioData?: string }>(`/paragraphs/${id}/preview`).then((r) => r.data);

// ============ Providers ============

export const fetchCapabilities = (provider: VxProvider) =>
  api.get<VxProviderCapabilities>(`/providers/${provider}/capabilities`).then((r) => r.data);
export const fetchVoices = (provider: VxProvider) =>
  api.get<VxVoice[]>(`/providers/${provider}/voices`).then((r) => r.data);

// ============ Voice Templates ============

export const fetchVoiceTemplates = (projectId: string) =>
  api.get<VxVoiceTemplate[]>(`/templates/${projectId}`).then((r) => r.data);
export const saveTemplate = (projectId: string, characterName: string, voiceId: string, voiceModel?: string, voiceParams?: VxVoiceParams) =>
  api.post<VxVoiceTemplate>('/templates', { projectId, characterName, voiceId, voiceModel, voiceParams }).then((r) => r.data);
export const deleteTemplate = (id: string) =>
  api.delete(`/templates/${id}`);

// ============ 长文本合成（豆包整章一次性） ============

/** 整章长文本合成（SSE 流式进度），返回合成音频 URL */
export async function synthesizeLongStream(
  chapterId: string,
  voiceId: string,
  voiceModel: string | undefined,
  onProgress: (stage: string) => void,
  voiceParams?: VxVoiceParams,
): Promise<string | undefined> {
  const resp = await fetch('/api/chapters/' + chapterId + '/synthesize-long', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ voiceId, voiceModel, voiceParams }),
  });
  if (!resp.ok || !resp.body) {
    throw new Error('长文本合成请求失败：HTTP ' + resp.status);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let audioUrl: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const lines = evt.split('\n');
      let eventType = 'progress';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr = line.slice(6);
      }
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          if (eventType === 'done' && data.audioUrl) audioUrl = data.audioUrl;
          if (eventType === 'error') throw new Error(data.error);
          if (data.stage) onProgress(data.stage);
        } catch (e) {
          // 只吞 JSON 解析错误（SyntaxError），业务错误必须抛出
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }
  return audioUrl;
}