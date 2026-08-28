/**
 * 项目路由
 */
import { Router } from 'express';
import { VxProvider, type VxProviderConfig } from '@voxit/core';
import { createProject, deleteProject, getProject, listProjects, updateProject } from '../db/repository.js';
import { cleanupChapterExports } from '../services/audio-export.js';

export const projectRoutes = Router();

/** 列出所有项目 */
projectRoutes.get('/', (_req, res) => {
  res.json(listProjects());
});

/** 获取单个项目（含章节段落） */
projectRoutes.get('/:id', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: '书籍不存在' });
    return;
  }
  res.json(p);
});

/** 创建项目 */
projectRoutes.post('/', (req, res) => {
  const { name, providerConfig, description } = req.body as {
    name: string;
    providerConfig: VxProviderConfig;
    description?: string;
  };
  if (!name || !providerConfig?.provider) {
    res.status(400).json({ error: '需要 name 和 providerConfig.provider' });
    return;
  }
  const p = createProject(name, providerConfig, description);
  res.status(201).json(p);
});

/** 编辑书籍（名称、描述、providerConfig） */
projectRoutes.patch('/:id', (req, res) => {
  const { name, description, providerConfig } = req.body as {
    name?: string;
    description?: string;
    providerConfig?: Partial<VxProviderConfig>;
  };
  if (providerConfig && !providerConfig.provider) {
    res.status(400).json({ error: 'providerConfig.provider 必填' });
    return;
  }
  // providerConfig 合并而非全量替换，避免部分更新丢失 apiKey 等
  const cur = getProject(req.params.id);
  if (!cur) {
    res.status(404).json({ error: '书籍不存在' });
    return;
  }
  const mergedProviderConfig = providerConfig
    ? { ...cur.providerConfig, ...providerConfig }
    : undefined;
  const updated = updateProject(req.params.id, { name, description, providerConfig: mergedProviderConfig });
  if (!updated) {
    res.status(404).json({ error: '书籍不存在' });
    return;
  }
  res.json(updated);
});

/** 删除书籍（级联删除章节、段落、模板，并清理导出的音频文件） */
projectRoutes.delete('/:id', async (req, res) => {
  const p = getProject(req.params.id);
  if (!p) {
    res.status(404).json({ error: '书籍不存在' });
    return;
  }
  // 先收集章节 id，删除后清理对应的导出音频（避免孤儿文件堆积）
  const chapterIds = p.chapters.map((c) => c.id);
  deleteProject(req.params.id);
  await Promise.all(chapterIds.map((cid) => cleanupChapterExports(cid).catch(() => {})));
  res.status(204).send();
});