/**
 * SQLite 数据库初始化与访问层
 * 使用 Node 24 内置 node:sqlite 模块（零原生编译依赖）
 * 表前缀：vx_
 */
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DB_PATH } from '../config.js';

let db: DatabaseSync;

export function initDb(dbPath?: string): DatabaseSync {
  // 默认使用 config 中的 DB_PATH（由 .env DATA_DIR 决定，部署时指向持久化目录）
  const resolvedPath = dbPath ?? DB_PATH;
  const dir = dirname(resolvedPath);
  mkdirSync(dir, { recursive: true });

  // node:sqlite 构造函数直接接收路径
  db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON'); // 启用外键约束，使 ON DELETE CASCADE 生效

  createTables(db);
  migrateSchema(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function columnExists(database: DatabaseSync, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function migrateSchema(database: DatabaseSync): void {
  if (!columnExists(database, 'vx_paragraphs', 'voice_model')) {
    database.exec(`ALTER TABLE vx_paragraphs ADD COLUMN voice_model TEXT`);
  }
  if (!columnExists(database, 'vx_voice_templates', 'voice_model')) {
    database.exec(`ALTER TABLE vx_voice_templates ADD COLUMN voice_model TEXT`);
  }
}

function createTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS vx_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      provider_config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vx_chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      "index" INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES vx_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vx_paragraphs (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      "index" INTEGER NOT NULL,
      text TEXT NOT NULL,
      role TEXT NOT NULL,
      character_name TEXT,
      voice_id TEXT,
      voice_model TEXT,
      voice_params TEXT,
      audio_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES vx_chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON vx_paragraphs(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_chapters_project ON vx_chapters(project_id);

    CREATE TABLE IF NOT EXISTS vx_voice_templates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      voice_id TEXT NOT NULL,
      voice_model TEXT,
      voice_params TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES vx_projects(id) ON DELETE CASCADE,
      UNIQUE (project_id, character_name)
    );

    CREATE INDEX IF NOT EXISTS idx_templates_project ON vx_voice_templates(project_id);
  `);
}