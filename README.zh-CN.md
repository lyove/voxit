# Voxit · 唯声 - AI 有声书制作台

> 基于 AI 大模型语音合成（TTS）的有声书逐段精调制作系统。支持多 AI 供应商切换、按章节段落精细化制作有声书，每段可自定义旁白/角色、发音人、语速、音调、情感等参数，试听满意后合成，最终拼接导出整章音频。

## 核心功能

- **多 AI 供应商**：支持阿里云百炼（CosyVoice/Qwen-TTS）、豆包火山引擎（Seed-TTS），可在系统设置中配置多个大模型实例
- **书籍管理**：书籍列表（Table 展示、搜索、编辑）、书籍详情（章节/角色双 Tab）
- **章节管理**：章节列表（状态追踪：初始化/编辑中/已合成）、章节详情（段落编辑）
- **段落编辑**：左右布局，左侧选角色（旁白/角色）+ 编辑角色发音人，右侧文本编辑 + 语速/音调/情感/指令参数 + 试听/合成
- **角色管理**：书籍级角色配置（角色名→发音人映射），段落选角色时自动套用发音人
- **发音人试听**：AI音色页展示所有发音人，可试听；发音人选择下拉每项带试听按钮，先试听后选择
- **批量合成**：一键合成整章段落，SSE 实时进度推送
- **整章导出**：ffmpeg 拼接各段音频 + 段间静音，导出整章 mp3
- **豆包长文本**：整章文本一次性合成（异步，最多 10 万字）
- **批量导入**：粘贴整章文本自动拆分为段落
- **脏标记**：段落有改动时标记"有改动"，切换章节时提示

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + React Router 7 + zustand |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | node:sqlite（Node 24 内置，零编译依赖） |
| 音频处理 | ffmpeg-static + fluent-ffmpeg |
| TTS | 阿里云百炼 CosyVoice、豆包火山引擎 Seed-TTS |

## 项目结构

```
voxit/
├── apps/
│   ├── web/                 # 前端（React + Vite）
│   │   └── src/
│   │       ├── layouts/     # 侧边栏布局
│   │       ├── pages/       # 路由页面（数据面板/书籍/章节/AI音色/设置）
│   │       ├── components/  # 组件（段落卡片/发音人选择器/模板面板）
│   │       ├── store.ts     # 全局状态
│   │       └── ai-config.ts # AI 大模型配置（localStorage 持久化）
│   └── server/              # 后端（Express + TypeScript）
│       └── src/
│           ├── db/          # SQLite 数据库 + 数据访问层
│           ├── providers/   # TTS Provider 抽象 + 阿里云/豆包实现
│           ├── services/    # 合成服务 + 音频导出
│           └── routes/      # API 路由
└── packages/
    └── core/                # 共享类型 + Provider 接口（前后端共享）
```

## 快速开始

### 环境要求

- Node.js ≥ 24（使用内置 `node:sqlite`）
- ffmpeg（项目内 `ffmpeg-static` 自动安装，或系统 `brew install ffmpeg`）

### 安装与启动

```bash
cd voxit
tnpm install          # 安装依赖

# 终端 1：启动后端
npm run dev:server    # http://localhost:3100

# 终端 2：启动前端
npm run dev:web       # http://localhost:5173
```

浏览器访问 **http://localhost:5173**

### 配置 AI 大模型

1. 进入「系统设置」→ 配置阿里云百炼 / 豆包火山引擎的 API Key 和 Workspace ID
2. 进入「AI音色」→ 自动从大模型拉取发音人列表
3. 创建书籍 → 新增章节 → 编辑段落 → 选角色/发音人 → 试听 → 合成 → 导出

## 生产部署

> 服务端默认单机部署：前端静态文件由 nginx 托管，后端 API 由 nginx 反代到 Node 进程（pm2 守护），数据存 SQLite 单文件。已提供 `deploy/` 下的参考配置。

### 环境要求

- Node.js ≥ 24（使用内置 `node:sqlite`，无需额外装数据库）
- ffmpeg（`brew install ffmpeg` 或系统包管理器安装）
- nginx（可选，如用其它反代/托管方式可跳过）
- pm2（`npm i -g pm2`）

### 1. 构建

```bash
cd voxit
npm install
npm run build        # 构建 packages/core + apps/web + apps/server
```

产物：前端 `apps/web/dist/`，后端 `apps/server/dist/`。

### 2. 配置服务端环境变量

```bash
cd apps/server
cp .env.example .env
```

务必修改（`.env` 里的提示值不安全）：

| 变量 | 说明 |
|---|---|
| `ADMIN_PASS` | 管理员密码（≥ 8 位强密码） |
| `JWT_SECRET` | 用 `openssl rand -hex 32` 生成随机字符串 |
| `DATA_DIR` | **数据目录，部署必填**，如 `/var/lib/voxit`。数据库文件 `voxit.db`、导出音频、临时文件都在此目录下。不设置时 dev（`src/data`）与构建后（`dist/data`）是两份独立数据，部署后可能"看不到"本地数据 |
| `CORS_ORIGINS` | 前端实际访问域名，如 `https://your-domain.com` |
| `ALIYUN_API_KEY` 等 | TTS 供应商凭证 |

### 3. 启动后端（pm2）

```bash
cd voxit
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup   # 开机自启
```

后端监听 `http://127.0.0.1:3100`。启动时会打印安全警告（弱密钥 / 弱密码未改时）。

### 4. 配置 nginx（静态托管 + 反代）

参考 `deploy/nginx.conf`：

- 把 `apps/web/dist` 的内容放到 `/var/www/voxit/web`（或改 root 路径指向）
- `server_name` 改为你的域名
- 前端路由用 `try_files ... /index.html` 支持 history 模式
- `/api/` 反代到 `http://127.0.0.1:3100`，并保持 `proxy_buffering off`（SSE 进度推送需要）

### 5. HTTPS（建议）

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

### 数据库说明

- **存储**：SQLite 单文件 `$DATA_DIR/voxit.db`，表结构首次启动自动创建（`vx_projects` / `vx_chapters` / `vx_paragraphs` / `vx_voice_templates`），无需手动建库。
- **本地数据迁移到服务器**：把本地 `apps/server/src/data/voxit.db`（dev）或 `apps/server/dist/data/voxit.db`（构建产物）拷贝到服务器 `$DATA_DIR/voxit.db` 即可，表结构兼容。
- **备份**：SQLite 是单文件，直接 `cp` 或 `sqlite3 .backup` 即可。定时备份：
  ```bash
  # 每天凌晨 3 点备份，保留 30 天
  0 3 * * * /path/to/voxit/deploy/backup-db.sh >> /var/log/voxit-backup.log 2>&1
  ```
- **登录限流**：内置内存限流，同一 IP 15 分钟内连续 5 次登录失败将锁定 15 分钟（多实例部署请自行替换为 Redis）。

## 命名约定

- 系统名：**Voxit**（Vox + it，"发声去"）
- 代码前缀：`vx-`
- 包名：`@voxit/*`
- 组件前缀：`<Vx... />`
- 数据库表前缀：`vx_`

## API 概览

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/projects` | GET/POST/PATCH/DELETE | 书籍 CRUD |
| `/api/chapters` | GET/POST/PATCH | 章节 CRUD + 重命名 |
| `/api/chapters/:id/export` | POST | 导出整章音频（SSE 进度） |
| `/api/chapters/:id/synthesize-all` | POST | 批量合成（SSE 进度） |
| `/api/chapters/:id/synthesize-long` | POST | 豆包整章长文本合成 |
| `/api/paragraphs` | GET/POST/PATCH | 段落 CRUD + 合成 + 试听 |
| `/api/providers` | GET | 供应商列表 + 能力 + 发音人 + 试听 |
| `/api/templates` | GET/POST/DELETE | 角色发音人模板 CRUD |


## TTS相关文档

### 阿里云相关文档：
- 实时语音合成：[https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)  
- 非实时语音合成：[https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide)  
- 声音复刻：[https://help.aliyun.com/zh/model-studio/voice-cloning-user-guide](https://help.aliyun.com/zh/model-studio/voice-cloning-user-guide)  
- 声音设计：[https://help.aliyun.com/zh/model-studio/voice-design-user-guide](https://help.aliyun.com/zh/model-studio/voice-design-user-guide)  
- SSML 与 LaTeX：[https://help.aliyun.com/zh/model-studio/ssml-latex-user-guide](https://help.aliyun.com/zh/model-studio/ssml-latex-user-guide)  
- 音色列表：
  - Qwen-Audio-TTS音色列表：[https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)  
  - CosyVoice音色列表：[https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)  
  - Qwen-TTS音色列表：[https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list](https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list)  


### 豆包火山引擎相关文档：
- 豆包语音文档指南：[https://docs.volcengine.com/docs/6561](https://docs.volcengine.com/docs/6561)  
  - 模型列表：[https://docs.volcengine.com/docs/6561/2499930](https://docs.volcengine.com/docs/6561/2499930/)  
  - 音色列表：[https://docs.volcengine.com/docs/6561/1257544](https://docs.volcengine.com/docs/6561/1257544)  
- API参考：[https://docs.volcengine.com/docs/6561/1257536](https://docs.volcengine.com/docs/6561/1257536)

## License

MIT
