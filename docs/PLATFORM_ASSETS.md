# 平台资产余额与走势

首页「平台概况」展示四链资产卡、每币种余额和24小时/7天/30天走势。四链均已配置：BSC/Solana采用用户提供的ZAN节点，Arc采用 https://rpc.blockdaemon.mainnet.arc.io ，Robinhood采用 https://rpc.mainnet.chain.robinhood.com 。后两者沿用聊天「统计一批地址余额」中已验证的公共节点，并重新验证链ID为5042/4663。当前不提供美元估值、平台锁定/可用额度或未配置币种余额。

## 数据与采集

- 从 Hologres wallet_v2 联接 account_v2 取得注册用户关联钱包，含 active/archived 钱包，避免归档造成资产虚减。同链同地址只计一次；EVM地址小写去重，Solana保留大小写。各EVM链查询同一EVM钱包地址集合。
- BSC：BNB、USDT、USDC。Solana：SOL、USDT、USDC。Arc采集本币USDC（18位，仅计一次）；Robinhood采集ETH、USDG；其他币种不虚报为零。
- 原始余额BigInt计算、SQLite文本存储，按币种精度格式化，图表仅为近似数字显示；无浮点求和。稳定币合约/精度取项目logearn-web的trade_currency配置。
- BSC先验证chain ID，再固定eth_blockNumber，eth_getBalance和ERC20 balanceOf均读同一区块。Solana验证完整主网genesis hash，使用finalized与minContextSlot，账户读取存在时间差；同钱包同mint多个token account相加。
- RPC不发送签名、转账或私钥，仅查询余额。地址和密钥均不返回前端。错误不保存RPC完整响应或凭证。

## 每小时任务

backend/src/services/platformAssets.js随后端启动，首次立即采集，每分钟检查当前小时是否需要新快照。同链每小时最多一份完成记录；失败10分钟后可重试。进行中的任务在2小时后可重新认领。后台进程需要持续运行；停机不补造历史余额。

SQLite表platform_asset_runs记录批次、进度、区块及错误；platform_asset_balances保存地址/币种的原始余额。只有全量完成的批次进入余额汇总；失败和遗漏小时在图表中断开，不使用部分余额冒充总资产。首次快照完成前显示进度，无历史时不画假曲线。

后端环境变量（保存在忽略提交的backend/.env）：

```
ASSET_RPC_BSC=
ASSET_RPC_SOLANA=
ASSET_RPC_ARC=
ASSET_RPC_ROBINHOOD=
```

GET /api/platform-assets?days=1|7|30 需要登录，返回聚合数据和状态，不返回RPC配置及钱包明细。刷新采集状态只读取快照，不触发新的全量RPC采集。

参考：[Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/)、[Solana getTokenAccountsByOwner](https://solana.com/docs/rpc/http/gettokenaccountsbyowner)、[Solana主网完整genesis hash说明](https://solana.com/docs/payments/agentic-payments/x402)。
