/**
 * 登录鉴权
 * - POST /api/auth/login：管理员账号密码换 JWT（带暴力破解限流）
 * - requireAuth 中间件：校验 Bearer token，保护所有 /api 业务接口
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { ADMIN_USER, ADMIN_PASS, JWT_EXPIRES, JWT_SECRET } from './config.js';

export interface AuthPayload {
  username: string;
  role: 'admin';
}

export const authRoutes = Router();

// ============ 登录限流（内存实现，防暴力破解） ============
// 每个 IP：15 分钟内连续失败 5 次则锁定 15 分钟。
// 单机内存方案，多实例部署时可换 Redis；对小规模自部署足够。
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

const loginFailures = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** 登录前检查：是否已被锁定 */
function isLoginLocked(ip: string): boolean {
  const rec = loginFailures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILURES;
}

/** 记录一次登录失败 */
function recordLoginFailure(ip: string): void {
  const rec = loginFailures.get(ip);
  if (!rec || Date.now() - rec.windowStart > LOGIN_WINDOW_MS) {
    loginFailures.set(ip, { count: 1, windowStart: Date.now() });
    return;
  }
  rec.count += 1;
}

/** 登录成功后清除记录 */
function clearLoginFailures(ip: string): void {
  loginFailures.delete(ip);
}

/** 登录：POST /api/auth/login  body: { username, password } */
authRoutes.post('/login', (req, res) => {
  const ip = getClientIp(req);
  if (isLoginLocked(ip)) {
    res.status(429).json({ error: `尝试次数过多，请 ${LOGIN_WINDOW_MS / 60000} 分钟后再试` });
    return;
  }
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: '需要 username 和 password' });
    return;
  }
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    recordLoginFailure(ip);
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  clearLoginFailures(ip);
  const payload: AuthPayload = { username, role: 'admin' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES as SignOptions['expiresIn'] });
  res.json({ token, username });
});

/** JWT 校验中间件 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录，请先登录' });
    return;
  }
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}
