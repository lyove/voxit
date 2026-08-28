# Voxit

> 唯声 - AI有声书制作台

## 命名约定

- 系统名：**Voxit**（Vox + it，"发声去"）
- 代码前缀：`vx-`
- 包名：`@voxit/*`
- 组件前缀：`<Vx... />`
- 数据库表前缀：`vx_`

## 目录结构

```
voxit/
├── apps/
│   ├── web/        # 前端 React + Vite + Ant Design
│   └── server/     # 后端 NestJS
├── packages/
│   └── core/       # Provider 抽象 + 共享类型（前后端共享）
└── package.json    # monorepo workspace 根
```

## 开发

```bash
npm install
npm run dev:server   # 启动后端
npm run dev:web      # 启动前端
```

## 开发阶段

- [x] Phase 1: 单 Provider（阿里云）跑通核心流程
- [ ] Phase 2: Provider 抽象 + 接入豆包
- [ ] Phase 3: 体验增强（试听台、批量、波形）
- [ ] Phase 4: 进阶（声音复刻、SSML、多章批量）