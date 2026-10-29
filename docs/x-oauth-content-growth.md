# 内容渠道增长：连接 X 官方账号

「渠道与 SEO → 内容渠道增长」提供 X OAuth 2.0 + PKCE 账号连接。按后台用户隔离，一个用户保存一个 X 账号授权，支持重新授权和断开连接。**不包含自动发帖、数据同步或产品归因。**

1. 在 [X Developer Console](https://developer.x.com/) 创建 Web App，启用 OAuth 2.0。
2. 登记 Callback URL，例如 http://localhost:3001/api/x/oauth/callback，线上使用 HTTPS 后端域名。
3. 在 backend/.env 填写 X_CLIENT_ID、X_CLIENT_SECRET、X_REDIRECT_URI、X_FRONTEND_ORIGIN（如 http://localhost:5173）和 X_OAUTH_ENCRYPTION_KEY。
4. 加密密钥为 32 字节随机数的 64 位十六进制：运行 node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"。
5. 重启后端，SQLite schema.sql 自动创建 x_oauth_states 与 x_oauth_connections，无需迁移 AI PostgreSQL。
6. 在页面点击连接 X，完成授权后检查 @username，再验证断开/重连。

使用权限 tweet.read users.read offline.access。令牌在后端以 AES-256-GCM 加密；回调使用一次性 state 与 PKCE 绑定后台用户。
断开会删除本系统保存的凭据，但不等同于 X 平台撤销应用授权。
X API 可能需要付费额度；连接时会请求 GET /2/users/me 验证身份，若无权限或额度将报告失败。

官方协议：https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
