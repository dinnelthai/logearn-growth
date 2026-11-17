# 导航映射（代码基线）

| 分组 | 可见入口与 mode |
| --- | --- |
| 总览 | 平台概况 `home`；增长诊断 `growth-insights`；北极星 `north` |
| 增长分析 | 业务优先级 `business-analysis`；漏斗 `funnel`；路径 `paths`；留存 `retention`；交易 `trade-monitor`；`value` 在 HTML 中隐藏 |
| AI Growth Agent | `ai-analysis`（单入口） |
| 运营工作台 | `workbench`、`activities`、`operations-compare`、`ops` |
| 用户与分群 | `segments`（单入口） |
| 渠道与 SEO | `channels`、`crm`、`content-growth`、`follower-audit`、`x-acquisition` |
| 系统设置 | `growth-agent-control`（单入口） |

`navigation.js` 将 `referral` 映射到 channels、`my-monitor` 到 home、`login-conversion` 和 `invite-conversion` 到 funnel 的导航高亮；这些内部 mode 由页面内入口使用。分组选择状态目前保存在内存，折叠状态初始化依据媒体宽度，未发现持久化。`dashboard.js` 的 `navigate` 更新内存 mode；URL 历史和刷新恢复须在浏览器验证，不能预先宣称支持。

真实页面可见性、权限、二级入口及跨页跳转待登录后核实。

## 2026-10-28 桌面端导航实现更新

- 顶栏增加“跳转页面”，使用 **Command+K / Ctrl+K** 打开搜索对话框；仅从真实侧栏索引可用目的地，不动态推测或构造路由。
- 快速跳转输入页面名或所属导航分组即可检索；支持方向键、Enter 和 Esc。用户点击/确认后通过现有 `navigate(mode)`，仍由原有页面和路由执行实际业务逻辑。
- `dashboard.js` 通过 `collectWorkspaceViews(root)` 获取真实导航 mode；同一数据源供快捷跳转和 `createViewHistory` 的白名单，防止错误地将 `querySelector` 单个元素当列表遍历。
- 普通页面地址可使用 `?view=home`、`?view=funnel`、`?view=ai-analysis` 等允许的 mode。未知 mode 回退到 `home`，保留无关 URL 参数与锚点；不在 URL 中存用户列表、筛选结果或 Token。
- 快捷跳转只面向桌面；不包含手机端改版。真实浏览器的导航前进/后退、焦点与视觉验收仍须现场检查。
