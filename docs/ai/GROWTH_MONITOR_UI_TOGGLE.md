# LogEarn · 增长异常监控开关（简化版）

**一套后端，一个页面开关，不再单独部署 Worker。**

部署最新 `master` 前后端后，使用原有 AI 数据库（`AI_DATABASE_URL`），在首次上线时按项目原有安全流程执行一次 `npm run migrate:ai`（`AI_DATABASE_EXPECTED_NAME` 和短暂设置 `AI_MIGRATION_APPROVED=1`；执行完撤回）。**不**需要新监控服务、`AI_DAILY_OWNER_IDS`、`AI_GROWTH_ALERT_MONITOR_ENABLED`、新的 Redis 队列、额外 PM2 进程。

## 操作

进入 **AI 分析 → 增长异常自动监控**，点击「开启自动监控」。

- 后端启动时自动注册轻量 `node-cron` 定时器，每天曼谷时间 **10:30** 扫描已开启账号。
- 开关状态保存在现有 AI PostgreSQL，后端重启后保留；只影响当前登录账号。
- 一次扫描分别检查 `activation` 和 `retention` 已保存日报中的可比指标；没有完整的两个业务日时标记为数据不足，**不会**生成虚构异常。
- 使用现有 `ai_growth_agent_scheduler_health` 的租约防止多实例同一时间重复执行；复用已有 `alertStore` / `investigationStore` 进行告警与提案去重。
- 在页面显示定时器是否加载、最近一次扫描状态。没有扫描记录不等于运行故障，可能是尚未到每天的时间。
- 点击关闭：后续扫描跳过这个账号；已经开始的当前查询可能正常结束。
- 不自动付费分析、不生成周计划、不调用外部运营动作。

## 运维

后端进程日志中检索 `[growth-monitor]`。Web 服务启动后会出现 `in-process daily schedule enabled`；每天扫描会输出仅含状态计数的摘要。
只需要维护**现有后端进程与 AI 数据库**。旧的 `worker:growth-monitor` 已移除；如服务器曾启动过独立的旧监控进程，请停掉它避免并行扫描。

首次迁移、真正部署与验证真实数据质量仍需运营环境执行；GitHub CI 仅验证代码。
