# 内容渠道增长：X 官方账号只读监测与行为比率

## 不增加授权与采集平台

官方账号来自 `backend/src/analytics/officialXAccounts.js`（与「官方账号关注者」复用）：
`@logearn_cn` 与 `@logearn_global`。既有 `twitterAccounts.js` 采集器使用
`TWITTERAPI_IO_API_KEY` 的 twitterapi.io 第三方公开数据接口，复用 X Acquisition 的预算保护。
不需要新的 X OAuth、X Developer Console 应用或发帖权限。

## 指标、公式与不可用状态

每次只读同步最多读取最近 20 条原创帖子（排除回复和转发）并记录：

- `viewCount` → `impressions` 存储字段，**UI 显示「公开浏览」**，不承诺等于官方后台曝光。
- `replyCount` → 回复、`retweetCount` → 转发、`likeCount` → 点赞。
- 回复率 / 转发率 / 点赞率 = 该行为的公开累计数 / 同次观测的公开浏览 × 100%；不是 X 排名分。
- 任何必要指标缺失，或浏览量为 0，均显示「不可计算」，不可用不写成 0。
- 引用/分享、推文展开、主页访问、链接点击、关注、停留及负反馈暂不伪造，须先验证真实数据源和权限。

X 开源的 For You 排名使用每个**读者**对不同行为的预测概率（和注意力、负面反馈等），
不能按公开帖子的实际互动倒推出平台算法分数。
一手资料：https://github.com/xai-org/x-algorithm#scoring-and-ranking

## 观测快照及 24h / 48h 比较

`x_official_posts` 仍存最新累计结果；每次成功同步追加
`x_official_post_snapshots(owner_id, account, post_id, observed_at, impressions, likes, replies, reposts, source)`。
仅保存采集时间真实发生过的数据，按账号+用户隔离；保留最近 90 天。
旧数据不倒填历史快照。

- 「24h」「48h」采用**发布后目标时刻 ±6 小时**内距离最近的一次观测，并显示其真实发布年龄。
- 如首次采集已超过窗口，则该阶段永远显示「未记录」，不能用当前累计数据补算。
- 同发布时间年龄对比只针对**同账号**且至少 4 篇具有 24h（或 48h）观测的帖子，
  以该批样本浏览中位数作参考；尚无内容主题标签时**不能称为同类话题比较**。
- 每个账号默认关闭自动同步；开启后最多每日一次（运行中的后端每小时检查到期任务），
  手动采集至少隔 1 小时。日频采集不保证每篇推文刚好具有 24h/48h 快照。
- 通过 Agent 工具可读取有界样本的来源、采集时刻、行为率和真实阶段快照。
  不把点赞等行为认作注册或交易归因证据。

## 部署/验收

拉取 `master`，**重启后端**以执行 `backend/src/db/schema.sql` 建表。
若快照表不存在，旧页面仍可读历史最新值，新同步会在请求第三方付费接口**之前**失败并提示重启。
更新前端后「内容渠道增长」会显示行为率、阶段记录缺失状态和采集时间。

测试文件：`backend/test/xContentMetrics.test.js`、
`backend/test/xContentMonitor.test.js`、
`frontend/src/analytics/__tests__/contentGrowthView.test.js`。
未接入真实发布权限，且没有人工模拟官方推荐分。
