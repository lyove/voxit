/**
 * 服务端环境变量配置（.env）
 * 所有密钥只在服务器端读取，绝不传给前端。
 * 凭证方案：全局唯一凭证，统一存服务器 .env（方案 A）。
 */
import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VxProvider } from '@voxit/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3100);

/**
 * 数据目录（.env: DATA_DIR）
 * 数据库文件、导出音频、临时文件都存放在该目录下。
 * 部署时务必指向持久化目录（如 /var/lib/voxit），否则：
 * - dev 模式（src/）与构建后（dist/）会是两份独立数据；
 * - 服务器重启 / 重新部署会丢失数据。
 */
export const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '..', 'data');

/** SQLite 数据库文件路径（.env: DATA_DIR 决定位置，voxit.db） */
export const DB_PATH = join(DATA_DIR, 'voxit.db');

/** 导出音频目录 */
export const EXPORT_DIR = join(DATA_DIR, 'exports');

/** 合成/导出临时目录 */
export const TMP_DIR = join(DATA_DIR, 'export-tmp');

/** 管理员登录账号密码（.env: ADMIN_USER / ADMIN_PASS） */
export const ADMIN_USER = process.env.ADMIN_USER ?? 'admin';
export const ADMIN_PASS = process.env.ADMIN_PASS ?? '';

/** JWT 签发密钥与有效期（.env: JWT_SECRET / JWT_EXPIRES） */
export const JWT_SECRET = process.env.JWT_SECRET ?? 'voxit-dev-secret-change-me';
export const JWT_EXPIRES = process.env.JWT_EXPIRES ?? '7d';

/** 判断是否仍在使用开发默认值 / 弱配置，供启动时打印警告 */
export function securityWarnings(): string[] {
  const warnings: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'voxit-dev-secret-change-me') {
    warnings.push('JWT_SECRET 未设置或仍是开发默认值，token 可被伪造。请设置随机长字符串（openssl rand -hex 32）。');
  }
  if (!process.env.ADMIN_PASS || process.env.ADMIN_PASS.length < 8) {
    warnings.push('ADMIN_PASS 未设置或过短（< 8 位），管理员账号存在被暴力破解风险。');
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    warnings.push('ADMIN_USER / ADMIN_PASS 未完整配置，将无法登录。');
  }
  return warnings;
}

/** CORS 白名单，逗号分隔（.env: CORS_ORIGINS） */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * 读取某 Provider 的全局凭证。
 * 语义映射（复用 TTSProvider 统一字段）：
 * - 阿里云：apiKey=API Key，workspaceId=Workspace ID
 * - 豆包：apiKey=access_token，workspaceId=appid
 */
export function getProviderCredentials(provider: VxProvider): { apiKey: string; workspaceId: string } {
  let apiKey = '';
  let workspaceId = '';
  if (provider === VxProvider.ALIYUN) {
    apiKey = process.env.ALIYUN_API_KEY ?? '';
    workspaceId = process.env.ALIYUN_WORKSPACE_ID ?? '';
  } else if (provider === VxProvider.DOUBAO) {
    apiKey = process.env.DOUBAO_TOKEN ?? '';
    workspaceId = process.env.DOUBAO_APP_ID ?? '';
  } else {
    throw new Error(`Provider ${provider} 暂未实现`);
  }
  if (!apiKey || !workspaceId) {
    const label = provider === VxProvider.ALIYUN ? '阿里云百炼' : provider === VxProvider.DOUBAO ? '火山引擎豆包' : provider;
    throw new Error(`供应商「${label}」未在服务器 .env 中配置凭证，请在 apps/server/.env 中设置后重启`);
  }
  return { apiKey, workspaceId };
}
