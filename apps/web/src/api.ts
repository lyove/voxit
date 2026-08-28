/**
 * 后端 API 客户端
 */
import axios from 'axios';
import type {
  VxChapter,
  VxParagraph,
  VxProject,
  VxProvider,
  VxProviderCapabilities,
  VxProviderConfig,
  VxRole,
  VxVoice,
  VxVoiceParams,
  VxVoiceTemplate,
} from '@voxit/core';

const api = axios.create({ baseURL: '/api' });

/**
 * 从 axios 错误中提取后端返回的 error 字段
 * 后端返回 { error: "..." }，否则用 axios 默认 message
 */
export function extractError(e: unknown): string {
  const err = e as { response?: { data?: { error?: string } }; message?: string };
  return err?.response?.data?.error ?? err?.message ?? '未知错误';
}

// ============ Projects ============

export const fetchProjects = () => api.get<VxProject[]>('/projects').then((r) => r.data);
export const fetchProject = (id: string) => api.get<VxProject>(`/projects/${id}`).then((r) => r.data);
export const createProject = (name: string, providerConfig: VxProviderConfig) =>
  api.post<VxProject>('/projects', { name, providerConfig }).then((r) => r.data);
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
    headers: { 'Content-Type': 'application/json' },
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

/** 下载已导出的整章音频 */
export function downloadExport(fileName: string, displayName?: string): void {
  const a = document.createElement('a');
  a.href = `/api/chapters/download/${fileName}`;
  a.download = displayName ?? fileName;
  a.click();
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
    headers: { 'Content-Type': 'application/json' },
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
export const createParagraph = (chapterId: string, text: string, role: VxRole, characterName?: string) =>
  api.post<VxParagraph>('/paragraphs', { chapterId, text, role, characterName }).then((r) => r.data);
export const updateParagraph = (id: string, patch: Partial<VxParagraph>) =>
  api.patch<VxParagraph>(`/paragraphs/${id}`, patch).then((r) => r.data);
export const synthesizeParagraph = (id: string) =>
  api.post<VxParagraph>(`/paragraphs/${id}/synthesize`).then((r) => r.data);
export const previewParagraph = (id: string) =>
  api.post<{ audioUrl?: string; audioData?: string }>(`/paragraphs/${id}/preview`).then((r) => r.data);

// ============ Providers ============

export const fetchCapabilities = (provider: VxProvider) =>
  api.get<VxProviderCapabilities>(`/providers/${provider}/capabilities`).then((r) => r.data);
export const fetchVoices = (provider: VxProvider, apiKey: string, workspaceId: string) =>
  api
    .get<VxVoice[]>(`/providers/${provider}/voices`, { params: { apiKey, workspaceId } })
    .then((r) => r.data);

// ============ Voice Templates ============

export const fetchTemplates = (projectId: string) =>
  api.get<VxVoiceTemplate[]>(`/templates/${projectId}`).then((r) => r.data);
export const saveTemplate = (projectId: string, characterName: string, voiceId: string, voiceParams?: VxVoiceParams) =>
  api.post<VxVoiceTemplate>('/templates', { projectId, characterName, voiceId, voiceParams }).then((r) => r.data);
export const deleteTemplate = (id: string) =>
  api.delete(`/templates/${id}`);

// ============ 长文本合成（豆包整章一次性） ============

/** 整章长文本合成（SSE 流式进度），返回合成音频 URL */
export async function synthesizeLongStream(
  chapterId: string,
  voiceId: string,
  onProgress: (stage: string) => void,
  voiceParams?: VxVoiceParams,
): Promise<string | undefined> {
  const resp = await fetch('/api/chapters/' + chapterId + '/synthesize-long', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceId, voiceParams }),
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