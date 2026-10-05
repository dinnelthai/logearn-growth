# LogEarn 数据分析前端

这是从独立 HTML 原型拆分出的 Vite 前端项目，使用原生 JavaScript 驱动界面。

## 本地运行

```sh
npm install
npm run dev
```

Node.js 18 or newer is required.

## 构建与预览

```sh
npm run build
npm run preview
```

## 项目结构

- `index.html`：应用入口和仪表盘静态结构
- `src/styles.css`：仪表盘样式
- `src/dashboard.js`：指标、模拟数据、图表和交互逻辑
- `src/tooltips.js`：提示浮层交互
- `src/main.js`：依赖初始化及应用启动

仪表盘目前使用内置的合成演示数据。接入真实数据时，可在应用启动前设置 `globalThis.LOGEARN_ANALYTICS_DATA`，数据结构参照 `src/dashboard.js` 中的 `DATA_CONTRACT`。
