/**
 * pm2 进程守护配置（生产环境）
 * 用法：
 *   npm run build              # 构建（web 与 server）
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup    # 开机自启
 *
 * 环境变量从 apps/server/.env 读取（dotenv 已内置），无需在此重复配置。
 * 数据目录请在 apps/server/.env 中设置 DATA_DIR（如 /var/lib/voxit）。
 */
module.exports = {
  apps: [
    {
      name: 'voxit-server',
      cwd: './apps/server',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1, // SQLite 单文件，勿开 cluster 多实例（可开 N 个但共享同一 DB 文件，建议保持 1）
      exec_mode: 'fork',
      max_memory_restart: '512M',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
      // 崩溃后 3s 自动重启，最多 10 次
      max_restarts: 10,
      min_uptime: '5s',
      time: true,
    },
  ],
};
