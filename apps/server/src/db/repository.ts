/**
 * 项目 / 章节 / 段落 数据访问层
 * 适配 node:sqlite（DatabaseSync）API
 */
import { v4 as uuid } from 'uuid';
import { getDb } from './database.js';
import {
  VxParagraphStatus,
  VxRole,
  type VxChapter,
  type VxParagraph,
  type VxProject,
  type VxProviderConfig,
  type VxVoiceTemplate,
} from '@voxit/core';

const now = () => Date.now();

// ============ Project ============

export function createProject(name: string, providerConfig: VxProviderConfig, description?: string): VxProject {
  const db = getDb();
  const id = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO vx_projects (id, name, description, provider_config, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
  ).run(id, name, description ?? '', JSON.stringify(providerConfig), ts, ts);
  // 默认角色模板：旁白（普通角色，可编辑/删除）
  upsertTemplate(id, '旁白', '', undefined, undefined);
  return { id, name, description, providerConfig, chapters: [], createdAt: ts, updatedAt: ts };
}

export function getProject(id: string): VxProject | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM vx_projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  if (!row) return undefined;
  const chapters = getChapters(id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    providerConfig: JSON.parse(row.provider_config) as VxProviderConfig,
    chapters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(): VxProject[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM vx_projects ORDER BY updated_at DESC`).all() as unknown as ProjectRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    providerConfig: JSON.parse(r.provider_config) as VxProviderConfig,
    chapters: getChapters(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** 更新书籍（名称、描述、providerConfig） */
export function updateProject(id: string, patch: { name?: string; description?: string; providerConfig?: VxProviderConfig }): VxProject | undefined {
  const db = getDb();
  const cur = getProject(id);
  if (!cur) return undefined;
  const merged = {
    name: patch.name ?? cur.name,
    description: patch.description ?? cur.description ?? '',
    providerConfig: patch.providerConfig ?? cur.providerConfig,
  };
  const ts = now();
  db.prepare(`UPDATE vx_projects SET name=?, description=?, provider_config=?, updated_at=? WHERE id=?`).run(
    merged.name, merged.description, JSON.stringify(merged.providerConfig), ts, id,
  );
  return getProject(id);
}

/** 删除书籍（级联删除章节、段落、模板） */
export function deleteProject(id: string): void {
  const db = getDb();
  // 先删章节下的段落
  const chapterIds = db.prepare(`SELECT id FROM vx_chapters WHERE project_id = ?`).all(id) as { id: string }[];
  for (const ch of chapterIds) {
    db.prepare(`DELETE FROM vx_paragraphs WHERE chapter_id = ?`).run(ch.id);
  }
  db.prepare(`DELETE FROM vx_chapters WHERE project_id = ?`).run(id);
  db.prepare(`DELETE FROM vx_voice_templates WHERE project_id = ?`).run(id);
  db.prepare(`DELETE FROM vx_projects WHERE id = ?`).run(id);
}

// ============ Chapter ============

export function createChapter(projectId: string, title: string): VxChapter {
  const db = getDb();
  const id = uuid();
  const ts = now();
  const count = db.prepare(`SELECT COUNT(*) as c FROM vx_chapters WHERE project_id = ?`).get(projectId) as { c: number };
  const index = count.c;
  db.prepare(
    `INSERT INTO vx_chapters (id, project_id, "index", title, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
  ).run(id, projectId, index, title, ts, ts);
  return { id, projectId, index, title, paragraphs: [], createdAt: ts, updatedAt: ts };
}

/** 重命名章节 */
export function renameChapter(id: string, title: string): VxChapter | undefined {
  const db = getDb();
  const ts = now();
  const cur = db.prepare(`SELECT * FROM vx_chapters WHERE id = ?`).get(id) as ChapterRow | undefined;
  if (!cur) return undefined;
  db.prepare(`UPDATE vx_chapters SET title=?, updated_at=? WHERE id=?`).run(title, ts, id);
  return { id, projectId: cur.project_id, index: cur.index, title, paragraphs: getParagraphs(id), createdAt: cur.created_at, updatedAt: ts };
}

export function getChapters(projectId: string): VxChapter[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM vx_chapters WHERE project_id = ? ORDER BY "index"`).all(projectId) as unknown as ChapterRow[];
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    index: r.index,
    title: r.title,
    paragraphs: getParagraphs(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ============ Paragraph ============

export function createParagraph(chapterId: string, text: string, role: VxRole, characterName?: string): VxParagraph {
  const db = getDb();
  const id = uuid();
  const ts = now();
  const count = db.prepare(`SELECT COUNT(*) as c FROM vx_paragraphs WHERE chapter_id = ?`).get(chapterId) as { c: number };
  const index = count.c;
  db.prepare(
    `INSERT INTO vx_paragraphs (id, chapter_id, "index", text, role, character_name, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, chapterId, index, text ?? '', role, characterName ?? null, VxParagraphStatus.DRAFT, ts, ts);
  return {
    id, chapterId, index, text, role, characterName,
    status: VxParagraphStatus.DRAFT,
    createdAt: ts, updatedAt: ts,
  };
}

export function getParagraphs(chapterId: string): VxParagraph[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM vx_paragraphs WHERE chapter_id = ? ORDER BY "index"`).all(chapterId) as unknown as ParagraphRow[];
  return rows.map(rowToParagraph);
}

interface ParagraphRow {
  id: string;
  chapter_id: string;
  index: number;
  text: string;
  role: string;
  character_name: string | null;
  voice_id: string | null;
  voice_model: string | null;
  voice_params: string | null;
  audio_url: string | null;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export function getParagraph(id: string): VxParagraph | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM vx_paragraphs WHERE id = ?`).get(id) as ParagraphRow | undefined;
  return row ? rowToParagraph(row) : undefined;
}

export function updateParagraph(id: string, patch: Partial<VxParagraph>): VxParagraph | undefined {
  const db = getDb();
  const cur = getParagraph(id);
  if (!cur) return undefined;
  const merged = { ...cur, ...patch, updatedAt: now() };
  db.prepare(
    `UPDATE vx_paragraphs SET text=?, role=?, character_name=?, voice_id=?, voice_model=?, voice_params=?, audio_url=?, status=?, error=?, updated_at=? WHERE id=?`,
  ).run(
    merged.text,
    merged.role,
    merged.characterName ?? null,
    merged.voiceId ?? null,
    merged.voiceModel ?? null,
    merged.voiceParams ? JSON.stringify(merged.voiceParams) : null,
    merged.audioUrl ?? null,
    merged.status,
    merged.error ?? null,
    merged.updatedAt,
    id,
  );
  return merged;
}

function rowToParagraph(r: ParagraphRow): VxParagraph {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    index: r.index,
    text: r.text,
    role: r.role as VxRole,
    characterName: r.character_name ?? undefined,
    voiceId: r.voice_id ?? undefined,
    voiceModel: r.voice_model ?? undefined,
    voiceParams: r.voice_params ? JSON.parse(r.voice_params) : undefined,
    audioUrl: r.audio_url ?? undefined,
    status: r.status as VxParagraphStatus,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface ProjectRow { id: string; name: string; description: string; provider_config: string; created_at: number; updated_at: number; }
interface ChapterRow { id: string; project_id: string; index: number; title: string; created_at: number; updated_at: number; }
// ============ Voice Template ============

export function listTemplates(projectId: string): VxVoiceTemplate[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM vx_voice_templates WHERE project_id = ? ORDER BY character_name`).all(projectId) as unknown as TemplateRow[];
  return rows.map(rowToTemplate);
}

export function upsertTemplate(
  projectId: string,
  characterName: string,
  voiceId: string,
  voiceModel?: string,
  voiceParams?: import('@voxit/core').VxVoiceParams,
): VxVoiceTemplate {
  const db = getDb();
  const ts = now();
  const existing = db.prepare(`SELECT id, created_at FROM vx_voice_templates WHERE project_id = ? AND character_name = ?`).get(projectId, characterName) as { id: string; created_at: number } | undefined;
  if (existing) {
    db.prepare(`UPDATE vx_voice_templates SET voice_id=?, voice_model=?, voice_params=?, updated_at=? WHERE id=?`).run(
      voiceId, voiceModel ?? null, voiceParams ? JSON.stringify(voiceParams) : null, ts, existing.id,
    );
    return { id: existing.id, projectId, characterName, voiceId, voiceModel, voiceParams, createdAt: existing.created_at, updatedAt: ts };
  }
  const id = uuid();
  db.prepare(`INSERT INTO vx_voice_templates (id, project_id, character_name, voice_id, voice_model, voice_params, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`).run(
    id, projectId, characterName, voiceId, voiceModel ?? null, voiceParams ? JSON.stringify(voiceParams) : null, ts, ts,
  );
  return { id, projectId, characterName, voiceId, voiceModel, voiceParams, createdAt: ts, updatedAt: ts };
}

export function deleteTemplate(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM vx_voice_templates WHERE id = ?`).run(id);
}

/** 按 id 查找模板（供删除保护等） */
export function getTemplateById(id: string): VxVoiceTemplate | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM vx_voice_templates WHERE id = ?`).get(id) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : undefined;
}

/** 按角色名查找模板（供段落套用） */
export function findTemplate(projectId: string, characterName: string): VxVoiceTemplate | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM vx_voice_templates WHERE project_id = ? AND character_name = ?`).get(projectId, characterName) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : undefined;
}

function rowToTemplate(r: TemplateRow): VxVoiceTemplate {
  return {
    id: r.id,
    projectId: r.project_id,
    characterName: r.character_name,
    voiceId: r.voice_id,
    voiceModel: r.voice_model ?? undefined,
    voiceParams: r.voice_params ? JSON.parse(r.voice_params) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface TemplateRow { id: string; project_id: string; character_name: string; voice_id: string; voice_model: string | null; voice_params: string | null; created_at: number; updated_at: number; }