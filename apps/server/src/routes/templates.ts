/**
 * 角色发音人模板路由
 */
import { Router } from 'express';
import type { VxVoiceParams } from '@voxit/core';
import { listTemplates, upsertTemplate, deleteTemplate } from '../db/repository.js';

export const templateRoutes = Router();

/** 列出项目的角色模板 */
templateRoutes.get('/:projectId', (req, res) => {
  res.json(listTemplates(req.params.projectId));
});

/** 新增/更新角色模板（按 project+characterName 唯一） */
templateRoutes.post('/', (req, res) => {
  const { projectId, characterName, voiceId, voiceParams } = req.body as {
    projectId: string;
    characterName: string;
    voiceId: string;
    voiceParams?: VxVoiceParams;
  };
  if (!projectId || !characterName || !voiceId) {
    res.status(400).json({ error: '需要 projectId, characterName, voiceId' });
    return;
  }
  const t = upsertTemplate(projectId, characterName, voiceId, voiceParams);
  res.status(201).json(t);
});

/** 删除角色模板 */
templateRoutes.delete('/:id', (req, res) => {
  deleteTemplate(req.params.id);
  res.status(204).send();
});