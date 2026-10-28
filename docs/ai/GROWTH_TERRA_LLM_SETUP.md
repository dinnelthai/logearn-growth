# LogEarn Growth LLM：Terra + 成本预算（2026-10-28）

## 价格来源、单位与局限

本配置使用用户提供的 DeRouter 网络定价截图，**没有核实实际账单成交价**。

| Model | Input USD/1M tokens | Output USD/1M tokens |
|---|---:|---:|
| gpt-6.1-terra | 0.0665 | 0.3325 |

LogEarn 当前客户端 `config.js` **按美元 / 1,000 Token** 计算费用；因此应写入：

```dotenv
AI_DEFAULT_MODEL=gpt-6.1-terra
AI_RELAY_COST_PER_1K_INPUT=0.0000665
AI_RELAY_COST_PER_1K_OUTPUT=0.0003325
AI_MAX_DAILY_COST=0.10
AI_COST_ALERT_THRESHOLD=0.05
AI_MAX_DAILY_TOKENS=100000
AI_TASK_MAX_CALLS=6
AI_TASK_MAX_TOKENS=50000
AI_TASK_MAX_OUTPUT_TOKENS=4096
```

示例：100,000 输入 + 20,000 输出 = $0.013300（**估算**）。
每日费用阈值 $0.10 和 100,000 Token 是独立的硬检查（需要 LLM 客户端完成 usage 追踪）；按当前截图价格，最多 100,000 全输出 Token 为约 $0.03325。外部直接调用、其它账号、上游收费规则、未上报 usage、或历史费用记录可能不受当前成本限制的完整覆盖。**费用阈值是应用记录的估算保护，不是中转商账户级绝对限额**。

## 在本机配置（不会上传密钥）

本仓库忽略 `backend/.env`；GitHub PR **不能修改本机已有私有密钥文件**。

```bash
cd ~/Documents/work/Logearn-growth
git pull --ff-only origin master
cd backend
node scripts/configureGrowthLlm.js --dry-run
node scripts/configureGrowthLlm.js
```

脚本只编辑固定名单的九个配置字段；保留现有 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、Redis URL 和数据库密钥。备份文件为 `backend/.env.backup-*` 并被 Git 忽略，权限为 0600。不输出密钥，不发起任何模型请求，不启用自动付费调度。

更新完需要重启 **Web 后端** 与 **AI Worker** 才会读取新环境变量；工作站使用前台 `npm run worker:ai` 时先 Ctrl+C 再启动，避免重复进程，PM2 用户应使用现有托管名称重启。

确认设置：

```bash
node -r dotenv/config -e "const x=require('./src/ai/llm');const c=x.getConfig();const m=x.getModelInfo(c.defaultModel); console.log({model:c.defaultModel,inputPer1k:m.costPer1kInput,outputPer1k:m.costPer1kOutput,pricingKnown:m.pricingKnown,dailyUsd:c.maxDailyCost,dailyTokens:c.maxDailyTokens})"
```

真实请求：`npm run test:llm`（**付费、仅人工执行**，脚本强制跳过缓存；失败时退出非零）。如果中转站不支持此模型 ID，测试会失败；请恢复原模型配置，不要为了通过测试伪造 Model ID 或价格。

正式费用追踪：AI 分析页面的「成本统计」和 `GET /api/ai-analysis/growth-agent/cost-audit?days=7`；该审计基于 `ai_usage_logs`，与 relay 实际结算需核对。不得用 `costKnown=false` 的零估算断言模型免费。
