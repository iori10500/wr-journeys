# WR Travel 行程手册展示站点

在线展示万德旅行 / Wildroad Travel 的奢华定制行程手册，支持搜索过滤和 A4 打印优化。

**域名**: [itinerary.wildroadgroup.com](https://itinerary.wildroadgroup.com)

## 技术栈

- **后端**: Express (Node.js)，端口 3099
- **模板引擎**: EJS
- **部署**: PM2，bare Git repo + post-receive hook 自动部署
- **服务器**: 47.238.43.48

## 本地开发

```bash
npm install
npm start
# 访问 http://localhost:3099
```

## 部署

```bash
git push origin main
# post-receive hook 自动执行 checkout → npm install → pm2 restart
```

## 项目结构

```
├── app.js               # Express 应用入口
├── data/
│   └── itineraries.json # 行程数据（标题、标签、封面图、brochure 路径等）
├── views/
│   ├── index.ejs        # 首页（搜索 + 卡片网格）
│   └── itinerary.ejs    # 行程详情页（内联 brochure HTML）
├── public/
│   ├── brochure/        # 各行程的 HTML 手册
│   ├── images/          # 行程图片
│   └── pdfs/            # 生成的 PDF 文件
├── generate-pdfs.sh     # 批量生成 PDF 脚本
└── 行程手册制作指南.md    # 制作新行程手册的标准流程
```

## 已有行程

| 行程 | 天数 | 目的地 |
|------|------|--------|
| 一城一湖·米兰与科莫湖 | 5天 | 意大利 |
| 苏黎世+卢塞恩 | 4天 | 瑞士 |
| 瑞士经典环线 | 7天 | 瑞士 |
| 坦桑尼亚野奢之旅 | 8天 | 坦桑尼亚 |
| 伦敦巴黎双城记 | 9天 | 英国/法国 |
| CMBI 巴厘岛激励之旅 | 4天 | 印尼 |

## 添加新行程

详见 `行程手册制作指南.md`，标准流程：

1. 制作 HTML brochure（A4 打印 + 网页兼容）
2. 搜索下载真实图片 → 压缩（sips，1400px，85% quality）
3. 复制 HTML 到 `public/brochure/`，图片到 `public/images/<id>/`
4. 注册到 `data/itineraries.json`
5. 生成 PDF（Chrome headless）
6. `git push origin main` 自动部署