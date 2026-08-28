/**
 * Voxit 服务端入口
 * 启动 Express，注册路由，初始化数据库
 * 鉴权：除 /api/health 与 /api/auth/* 外，所有 /api/* 需要登录（JWT）
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/database.js';
import { PORT, CORS_ORIGINS, DATA_DIR, securityWarnings } from './config.js';
import { authRoutes, requireAuth } from './auth.js';
import { projectRoutes } from './routes/projects.js';
import { chapterRoutes } from './routes/chapters.js';
import { paragraphRoutes } from './routes/paragraphs.js';
import { providerRoutes } from './routes/providers.js';
import { templateRoutes } from './routes/templates.js';

initDb();

const app = express();
// CORS 白名单（.env: CORS_ORIGINS），默认仅本地开发端口
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json({ limit: '5mb' }));

// 登录接口（无需鉴权）
app.use('/api/auth', authRoutes);

// 业务接口统一鉴权（health / auth 白名单放行）
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth/')) {
    next();
    return;
  }
  requireAuth(req, res, next);
});

// 路由
app.use('/api/projects', projectRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/paragraphs', paragraphRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/templates', templateRoutes);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'voxit-server', ts: Date.now() });
});

// 启动安全警告（弱 JWT_SECRET / 空或弱 ADMIN_PASS），仅提示不阻断
for (const w of securityWarnings()) {
  console.warn(`\n⚠️  [安全警告] ${w}`);
}

app.listen(PORT, () => {
  console.log(`🐯 Voxit server running at http://localhost:${PORT}`);
  console.log(`   数据目录: ${DATA_DIR}（.env 的 DATA_DIR 可配置）`);
});
