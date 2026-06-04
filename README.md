# WR Travel · 行程手册

精選全球奢華定制行程的在線展示平台，為高端旅行品牌提供精美的 HTML 行程手冊瀏覽與 PDF 下載。

## 技術棧

- **後端**: Express (Node.js)
- **模板引擎**: EJS
- **部署**: PM2 + Git post-receive hook 自動部署

## 行程列表

| 行程 | 天數 | 品牌 |
|------|------|------|
| 一城一湖·米蘭與科莫湖 | 5天 | 萬德旅行 WanderWay |
| 蘇黎世+盧塞恩 | 4天 | 萬德旅行 WanderWay |
| 瑞士經典環線 | 7天 | 萬德旅行 WanderWay |
| 坦桑尼亞野奢之旅 | 8天 | Wildroad Travel · 野路逸行 |
| 倫敦巴黎雙城記 | 9天 | Wildroad Travel · 野路逸行 |
| CMBI 2026 巴厘島激勵之旅 | 4天 | Wildroad Travel · 野路逸行 |

## 本地運行

```bash
npm install
npm start
```

訪問 http://localhost:3099

## 項目結構

```
├── app.js                  # Express 服務入口
├── data/
│   └── itineraries.json    # 行程數據
├── views/
│   ├── index.ejs           # 首頁模板
│   └── itinerary.ejs       # 行程詳情頁模板
├── public/
│   ├── images/             # 行程圖片
│   ├── brochure/           # HTML 行程手冊
│   └── pdfs/               # PDF 行程手冊
└── package.json
```

## 許可證

MIT License