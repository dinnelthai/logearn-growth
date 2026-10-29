# 内容渠道增长：复用 X 官方账号（只读）

「官方账号关注者」已有的账号即为唯一账号清单：

- `@logearn_cn`（中文账号）
- `@logearn_global`（国际账号）

内容渠道增长的账号下拉选项和关注者数据源共用 `backend/src/analytics/officialXAccounts.js`；无需额外创建账号、不需要 X OAuth、X Developer Console 或 `TWITTER_BEARER_TOKEN`。

## 同步与口径

- 共用现有 `TWITTERAPI_IO_API_KEY`（twitterapi.io 第三方 API）和 X Acquisition 采集预算控制。
- 手动同步指定账号，至少间隔 1 小时。也可为每个账号分别选择每日同步（默认关闭）。
- 每次使用账号资料与最近最多 20 条推文接口；同步结果保留账号、来源、采集时间和独立的粉丝快照。
- 记录可用的浏览（viewCount）、赞、回复和转发。该第三方接口没有可靠提供的引用数、内部曝光或实际站内归因，缺失值保持 `null`，不补零。
- 关注者采集/分类页面与增长监测页面彼此独立存储进度，不会重新爬取或覆盖已审核的粉丝记录。
- Growth Agent 获得分账号的有界内容样本与累计公开数据，不应宣称点击、注册、交易增长由 X 导致。

后端启动时 `schema.sql` 自动创建新监测表。旧实验性 `x_content_*` 表不再作为账号来源，已存在的历史表不会被删除。重启后端后生效。
