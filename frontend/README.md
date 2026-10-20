# LogEarn 数据分析前端

这是从独立 HTML 原型拆分出的 Vite 前端项目,使用原生 JavaScript 驱动界面。

**重要变更**: 本项目已移除 mock 数据模式,必须配置真实数据源才能运行。

## 数据源配置

前端需要配置后端 API 地址才能正常工作。创建 `.env.local` 文件:

```env
# 方式1: 使用后端聚合 API (推荐)
VITE_BACKEND_BASE_URL=http://localhost:3001

# 方式2: 直接连接分析 API (仅开发测试)
VITE_ANALYTICS_DATA_SOURCE=api
VITE_ANALYTICS_API_BASE_URL=/api/analytics
```

后端需要配置 Hologres 连接才能提供真实数据:

```env
# backend/.env
ANALYTICS_STORAGE=hologres
HOLOGRES_HOST=your-hologres-host
HOLOGRES_PORT=80
HOLOGRES_USER=your-user
HOLOGRES_PASSWORD=your-password
HOLOGRES_DATABASE=your-database
```

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
- `src/main.js`：数据源初始化及应用启动
- `src/dashboard.js`：指标、图表和交互逻辑
- `src/analytics/`：数据处理和分析逻辑
- `src/pages/`：各功能页面模块

## 配置保存

"保存配置"将日期长度、漏斗步骤、筛选和留存行为保存到浏览器本地。刷新后点击"载入保存"恢复;日期范围以最新观测截至时间重新计算。浏览器禁止存储时会明确提示保存失败。

数据请求失败时会显示重试入口,不会回退到假数据。推荐、交易接口缺失时,对应指标显示待获取。

## 分析交互

- 漏斗支持 AI 四步、整体三步和自定义步骤；选择预设后点击“应用修改”更新结果。整体三步包含所有符合路径的用户，不等于非AI用户。
- 留存表用颜色深浅表示完整日留存率，虚线表示进行中，灰色表示未到观察期；点击单元格查看对应用户。
- 人数下钻统一在侧边抽屉打开，支持按用户ID或显示来源搜索、每页12人分页、事件时间线；Esc、关闭按钮或抽屉外点击均可关闭。

## 行为路径分析

“行为路径”展示实际发生的事件顺序，支持选择起点、3/5/7步展示上限、日期及用户来源筛选。桑基图线宽与常见路径占比按会话数计算，点击连线或路径用户数打开去重用户列表。

事件优先按 `session_id` 关联；缺失时用同一用户30分钟无操作拆分会话，并在页面说明推断会话数。连续重复事件合并，返回之前的行为保留为后续步骤。“观测结束”不等于流失；超出展示上限、跨统计期和最近观察分别显示折叠、窗口截止与仍在观察。

支持四个站内模块（喊单、信号榜单、热门、FOMO热门）、点击Token及已有业务事件，API适配层保留会话和跳转上下文。


### 产品端埋点接入

本仓库是分析后台，产品页面和事件接收服务不在仓库内。`src/tracking/client.js` 提供采集 SDK，由产品端传入实际 `send(event)` 传输函数。发送失败会抛错，调用方应使用现有可靠队列重试并保留原始 event_id；SDK 本身不提供离线队列。

模块浏览统一发 `module_viewed`，`properties.module` 为 `callouts`（喊单）、`signals`（信号榜单）、`popular`（热门）、`fomo`（FOMO热门）。页面/标签内容真实呈现时发送一次，轮询刷新不重复发。点击卡片发 `token_opened`；详情成功呈现再发 `token_detail_viewed`，点击不代表详情成功或有效分析。

```js
import { createTracker } from './src/tracking/client.js'
const tracker = createTracker({ send: event => analyticsQueue.enqueue(event) }) // 替换为产品现有采集队列
tracker.identify(currentUser?.id) // 登录时更新，退出时 identify(null)
await tracker.track('module_viewed', { module: 'signals' })
const context = {
  entry_module: 'signals', token_address: token.address, chain: token.chain,
  token_visit_id: crypto.randomUUID(), item_id: signal.id, position: index + 1,
}
await tracker.track('token_opened', context)
// 将 context 随路由 state 或页面上下文传到详情，详情成功显示后：
await tracker.track('token_detail_viewed', context)
// 策略实际开启、筹码峰成功显示时分别发 strategy_started / chip_analysis_viewed，同样携带 context。
```

事件包含唯一 `event_id`、`occurred_at`、`anonymous_id`、登录后的 `user_id` 和 `session_id`。同一标签页无操作达到30分钟换会话；同一次Token跳转的点击、详情和后续行为共用 `token_visit_id`。匿名ID保存在 sessionStorage，跨标签页/跨浏览器身份应由产品已有身份系统统一处理。站内 `entry_module` 与外部获客 `first_entry_source` 分开，不能将“热门”写成用户首次获客渠道。

验收时在真实产品完成“任一模块 → 点击Token → 详情 → AI/筹码峰”，确认接口原始事件与后台同一会话路径一致。当前演示数据已包含四种入口，但不表示产品埋点已经上线。

## API 对接清单

后端实施入口：[后端 API 交付清单](docs/GROWTH_TRACKING_AND_INTEGRATION.md#16-后端-api-交付清单)。前端必须打点的事件见该文档第15.1节。

逐页数据依赖、现有四个接口的 JSON 样例、渠道与价值闭环的待实现契约，以及首次历史、身份、分页和数据水位缺口，见 [API_DATA_CONTRACT.md](docs/API_DATA_CONTRACT.md)。

## 推广与增长

推荐页支持主动邀请按钮、信号分享、倍数分享的点击/完成操作、访问UV、绑定和7天激活,以及按绑定/激活/访问人数排序的链接排行。真实产品需要接入 share_button_clicked、share_completed、invite_link_visited,并在推荐关系返回 referral_link_id 和 share_type;详细格式见对接文档第7节。

用户分群附加标签包括”已绑定 Telegram””已绑定邮箱”,支持来源筛选及用户下钻。真实users接口分别提供telegram_bound/email_bound布尔值;缺失标为未知。邮箱状态为当前验证绑定状态,解绑后为false;无需返回实际联系方式。无行为注册用户也会并入用户池。

## 生命周期触达

用户分群页面下方新增六类生命周期规则、渠道选择、候选用户下钻、模拟执行和发送记录。明确订阅且账号已绑定才可触达;每天一次、同场景7天冷却,多场景按优先级选一条。策略提醒要求同一次运行的结果已生成但未查看。

真实模式读取 `/api/analytics/lifecycle`,保存规则及提交服务端预览批次;接口缺失不会发送。服务端适配器见 `src/lifecycle/worker.js`,需接数据库原子预约、实际消息模板、Telegram/邮件供应商及定时调度。详细字段与约束见对接文档第9节;本仓库不包含已上线的发送服务。

## 通用人群对比

用户分群顶部支持多条件筛选、单维度分组，对比语言、来源、绑定状态、首次入口与主要分群。周期表现包括人数/组内占比；留存使用同日首次有效分析批次，支持D1–D7曲线、成熟分母和人数下钻。绑定/主要分群缺少历史状态时不开放留存比较。人群对比日期、筛选与配置保存独立于原有分群和触达规则，详见对接文档第11节。

人群对比现提供“概览 / 漏斗 / 留存 / 趋势”视图。漏斗支持分析与AI预设、1/24/72小时窗口、逐步转化和待观察；趋势支持每日有效分析人数及组内比例。各视图复用筛选并支持人数下钻，视图选项可随对比配置保存。

## 统一设计评估与埋点交付文档

产品与后端联调请优先阅读 [GROWTH_TRACKING_AND_INTEGRATION.md](docs/GROWTH_TRACKING_AND_INTEGRATION.md)：包含整体设计评估、11个当前支持事件、业务事实、接口JSON、历史/身份/水位缺口、真实触达条件及验收步骤。较早API_DATA_CONTRACT.md保留详细迭代记录。
