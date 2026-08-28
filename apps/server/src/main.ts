/**
 * Voxit 服务端入口
 * 启动 Express，注册路由，初始化数据库
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/database.js';
import { projectRoutes } from './routes/projects.js';
import { chapterRoutes } from './routes/chapters.js';
import { paragraphRoutes } from './routes/paragraphs.js';
import { providerRoutes } from './routes/providers.js';
import { templateRoutes } from './routes/templates.js';

const PORT = Number(process.env.PORT ?? 3100);

initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

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

app.listen(PORT, () => {
  console.log(`🐯 Voxit server running at http://localhost:${PORT}`);
});