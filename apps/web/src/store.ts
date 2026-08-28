/**
 * 全局状态管理（zustand）
 */
import { create } from 'zustand';
import type { VxParagraph, VxProject, VxVoice } from '@voxit/core';
import * as api from './api.js';

interface VxStore {
  projects: VxProject[];
  currentProject: VxProject | null;
  voices: VxVoice[];
  loading: boolean;
  /** 有未保存改动的章节ID集合 */
  dirtyChapters: Set<string>;

  loadProjects: () => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  addProject: (name: string, provider: VxProject['providerConfig']) => Promise<void>;
  editProject: (id: string, patch: { name?: string; description?: string; providerConfig?: VxProject['providerConfig'] }) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  loadVoices: (provider: string) => Promise<void>;

  // 段落操作（直接更新本地 currentProject 中的段落，乐观更新）
  updateParagraphLocal: (id: string, patch: Partial<VxParagraph>) => void;
  addParagraph: (chapterId: string, text: string, role: 'narration' | 'character', characterName?: string) => Promise<void>;
  /** 标记章节为脏（有未保存改动） */
  markChapterDirty: (chapterId: string) => void;
  /** 清除章节脏标记（保存后） */
  clearChapterDirty: (chapterId: string) => void;
}

export const useStore = create<VxStore>((set, get) => ({
  projects: [],
  currentProject: null,
  voices: [],
  loading: false,
  dirtyChapters: new Set(),

  loadProjects: async () => {
    set({ loading: true });
    const projects = await api.fetchProjects();
    set({ projects, loading: false });
  },

  selectProject: async (id) => {
    const project = await api.fetchProject(id);
    set({ currentProject: project });
  },

  addProject: async (name, providerConfig) => {
    const p = await api.createProject(name, providerConfig);
    set({ currentProject: p, projects: [p, ...get().projects] });
  },

  editProject: async (id, patch) => {
    const updated = await api.updateProject(id, patch);
    set({
      projects: get().projects.map((p) => (p.id === id ? updated : p)),
      currentProject: get().currentProject?.id === id ? updated : get().currentProject,
    });
  },

  removeProject: async (id) => {
    await api.deleteProject(id);
    const projects = get().projects.filter((p) => p.id !== id);
    set({
      projects,
      currentProject: get().currentProject?.id === id ? null : get().currentProject,
    });
  },

  loadVoices: async (provider) => {
    const voices = await api.fetchVoices(provider as any);
    set({ voices });
  },

  updateParagraphLocal: (id, patch) => {
    const proj = get().currentProject;
    if (!proj) return;
    // 找到段落所属章节，标记脏
    let dirtyChapterId: string | undefined;
    set({
      currentProject: {
        ...proj,
        chapters: proj.chapters.map((ch) => {
          const has = ch.paragraphs.some((p) => p.id === id);
          if (has) dirtyChapterId = ch.id;
          return {
            ...ch,
            paragraphs: ch.paragraphs.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          };
        }),
      },
    });
    if (dirtyChapterId) get().markChapterDirty(dirtyChapterId);
  },

  addParagraph: async (chapterId, text, role, characterName) => {
    const p = await api.createParagraph(chapterId, text, role as any, characterName);
    const proj = get().currentProject;
    if (!proj) return;
    set({
      currentProject: {
        ...proj,
        chapters: proj.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, paragraphs: [...ch.paragraphs, p] } : ch,
        ),
      },
    });
    get().markChapterDirty(chapterId);
  },

  markChapterDirty: (chapterId) => {
    const cur = get().dirtyChapters;
    if (cur.has(chapterId)) return;
    const next = new Set(cur);
    next.add(chapterId);
    set({ dirtyChapters: next });
  },

  clearChapterDirty: (chapterId) => {
    const cur = get().dirtyChapters;
    if (!cur.has(chapterId)) return;
    const next = new Set(cur);
    next.delete(chapterId);
    set({ dirtyChapters: next });
  },
}));