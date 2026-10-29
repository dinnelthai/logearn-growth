# X 官方内容监测（只读）

入口：渠道与 SEO → 内容渠道增长 → X 官方账号监测。

## 功能

- 填写公开账号 `@username`，无需用户 OAuth、Client ID、Client Secret 或发帖权限。
- 点击「立即同步」后调用官方 X API v2：`GET /2/users/by/username/:username` 和 `GET /2/users/:id/tweets`。最多读取最近 10 条原创帖（不包括转发和回复）。
- 保存每条已返回的累计公开曝光、点赞、回复、转发、引用和当前粉丝数；缺失数值记为未知。
- 显示样本互动率、粉丝快照和最近帖子。支持自愿开启「每日自动采集一次」。未开启则不自动调用付费 API。
- Growth Agent `get_content_growth` 工具收到带来源、时间与样本范围的结构化只读证据；不把曝光视为站内转化。

## 配置和费用

后端仍使用已有的 `TWITTER_BEARER_TOKEN`。需要从 X 开发者平台取得可用的 App Bearer Token；无需 LogEarn 官方 X 账号授权。**没有 Bearer Token 的情况下，只能保存账号，不能自动抓取数据。**

API 当前按返回资源计费：账号读取约 $0.01/次、每条帖子读取约 $0.005/条；读取 1 账号 + 10 帖的上限示例约 $0.06/次（实际以开发者控制台为准）。
后端限制至少 1 小时调用间隔，自动模式最多每天每账号调用一次；同步失败不伪造为成功。不要在没有配置费用上限的 X Developer Console 上盲目启用高频调用。

重启后端后 SQLite 自动建表，无需部署额外 Worker。首次抓取之前没有历史粉丝增长数据；公众曝光数据不等于站内注册或交易归因。

资料：https://docs.x.com/x-api/fundamentals/metrics 和 https://docs.x.com/x-api/getting-started/pricing
