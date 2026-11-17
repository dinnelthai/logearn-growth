# UI/UX 基线清点（进行中）

记录时间：2026-10-28（UTC+7）。基线提交 `ab2d395cb8085840e09a81cf158f5f7bffc5a3e1`；原分支 master，开始时工作树干净。开发分支 `codex/uiux-rebuild` 从该提交创建。未获取远程最新状态；本地 `feat/ai-growth-agent` 与基线的共同祖先比较为 0 / 185 个提交，前端差异 20 文件。不得将本地远程跟踪引用当成实时远程状态。

## 运行与测试

- 本机 5173、3001 的进程工作目录分别为本仓库 frontend、backend；登录后页面显示 Hologres 聚合模式。首页、侧栏收起、漏斗加载前后、AI 历史失败态已截图，截图含真实业务数据，应按敏感内部资料处理。
- `cd frontend && npm run build`：通过，Vite 6.4.3，766 模块；主 CSS 133.40 kB，ECharts 包 1093.78 kB（未压缩）。空 ECharts chunks 为构建警告。
- `cd frontend && npm test`：失败；73 suites 通过，1 跳过，1 失败；298 tests 通过，4 跳过。`sidebarStructure.test.js:22` 正则含多余转义，Vite 无法解析。此为改动前既有故障。
- `frontend/package.json` 无 lint 脚本。

## 页面与能力

菜单和 mode 见 [导航映射](02-navigation-map.md)。`dashboard.js` 按 mode 调度，`pages/` 同时包含聚合和本地实现及详情模块；详见该目录，不能以文件名推断入口可用。页面层的主要用户任务包括增长分析、筛选与服务端名单下钻、运营待办与活动、用户/KOL 操作、AI 分析及治理。隐藏的价值闭环不应视为可用入口。

主要 API 按 `frontend/src/api/` 分类：`metrics` 聚合指标，`drill` 用户与时间线，`backendAnalytics` 快照元数据，`activities`、`operationTasks`、`userOperations` 运营，`crm`、`userCrm`、`userTags` 客户和标签，`aiAnalysis`、`growthReports`、`businessAnalysis` 决策，`xAcquisition` 渠道研究，`ops` 高风险操作。具体方法和权限以各模块及后端为准。

已有公共设施：`navigation.js`、`drawer.js`、`tooltips.js`、`pages/loadingState.js`、`pages/lazyPage.js`、`analytics/reportPeriod.js`、`analytics/audienceSelection.js`。`dashboard.js` 已有未应用状态、筛选期、人群与 generation 检查；不能假设所有页面都使用同一机制。

## 尚缺证据

其余页面截图、系统性空/失败/加载状态、AI 人工中断态、断点、键盘、实时远程差异和性能交互基线均未完成。浏览器实际观察到侧栏收起后导航整体消失；AI 历史显示失败与 Token 预算不足，但未触发重试。未触发付费分析或恢复任务。Phase 0 尚未验收，后续阶段不能标记完成。

## 2026-10-28 补充证据

- `git ls-remote origin`：master 为 `ab2d395cb8085840e09a81cf158f5f7bffc5a3e1`，`feat/ai-growth-agent` 为 `801ef9681ada1a0ac563f817cd070650a5b31209`，与本地对应引用一致。
- 已保存真实 AI 中断态、漏斗错误态及分页下钻加载/成功态截图。中断态同时出现“分析中”和“需要人工处理”；漏斗成功下钻为服务端分页，详情显示 129 人，第 1 / 11 页。截图含用户标识及业务数据，不应纳入提交。
- 修复基线测试的正则转义后，完整测试为 74 文件通过、1 跳过；303 测试通过、4 跳过。构建通过。修复后数据为后续基线，不改变上面的原始基线记录。
- 当前真实任务列表未重现可打开的中断任务；变更后的中断态仅经自动化模拟验证，仍需真实环境验证。Phase 0 尚欠全页面、各状态和断点清点。
