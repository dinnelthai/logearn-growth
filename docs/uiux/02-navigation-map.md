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
