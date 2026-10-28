# Growth V1 运营网页开关（仅异常扫描）

这个开关**不是** `AI_AUTONOMY_ENABLED`，也不会开启每日付费 AI 调查、自动制定运营计划、Webhook 发布或预算修改。

## 一次性部署准备

1. 部署本 PR 的前后端代码，确认后端连接单独 AI PostgreSQL（`AI_DATABASE_URL`）。
2. 按已有安全流程迁移 AI 数据库（需要 `AI_DATABASE_EXPECTED_NAME` 和临时 `AI_MIGRATION_APPROVED=1`）：`cd backend && npm run migrate:ai`。本 PR 只增加一张 `ai_growth_monitor_settings` 表。迁移后撤回临时批准变量。
3. 在**Web 后端进程**与**增长监控 Worker 进程**配置相同的 `AI_DAILY_OWNER_IDS`（用逗号分隔已授权登录用户的 user_id）。仅这些账号能切换。
4. 为**Worker 进程**设置 `AI_GROWTH_ALERT_MONITOR_ENABLED=1`，并启动单独的 `cd backend && npm run worker:growth-monitor`（可由已有 PM2/部署平台守护）。这只表示 Worker 已可用，**不**自动启用任何账号。
5. 可选：`AI_GROWTH_ALERT_GOALS=activation,retention`、`AI_GROWTH_ALERT_CRON='30 10 * * *'`（默认曼谷时间每天 10:30）、`AI_GROWTH_ALERT_SOURCE=all`。若配置了旧 `AI_DAILY_GOAL`，请显式指定新 GOALS 避免只扫单目标。

## 网页操作

进入 **AI 分析 → 增长异常自动监控**。

- **关闭**：持久化状态，不再启动该账号的后续扫描；当前正在执行的一次扫描可能结束。
- **开启，Worker 在线**：下一次曼谷时间定时扫描生效；不会马上创建付费 AI 分析。
- **开启，Worker 未在线**：仅保存用户意愿，**尚未运行**。检查 Worker 是否启动、配置是否一致和 AI 数据库是否已迁移。
- **账号未授权**：按钮不可用，需服务器先配置允许的 `AI_DAILY_OWNER_IDS`。

扫描只对已有完整的日报做保守跨日比较；若缺历史/采集水位会跳过，并不代表业务健康。

运行记录：`[growth-monitor]` 控制台/PM2 日志；网页显示后台心跳与最近扫描状态。

## 故障回滚

直接在网页关闭对应账号即可停止后续自动扫描；若需要全局停止则关闭 Worker 服务或撤销其 `AI_GROWTH_ALERT_MONITOR_ENABLED` 环境变量并重启 Worker。开关状态保存在 AI 数据库，与 Web/Worker 进程重启无关。

自动监控开关不会改变原有人工手动扫描 API 的权限，也不会开启 `AI_AUTONOMY_PAID_DAILY_ENABLED`。
