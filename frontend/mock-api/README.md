# 页面唯一数据源：Mock JSON

默认启动 `npm run dev` 后，Dashboard 直接读取本目录 JSON，不需要 Mock API 服务。所有业务人数、交易量、路径、留存和生命周期分析都从 JSON 事实计算；没有内置用户生成、比例补数或合成交易。修改 JSON 后 Vite 更新页面，生产部署需重新构建。

| JSON 文件 | 展示内容 |
|---|---|
| users.json | 用户、来源、语言、绑定属性 |
| events.json | 分析人数、漏斗、路径、留存、分享、生命周期行为 |
| referrals.json | 正式邀请关系、邀请激活与链接排行 |
| trades.json | 交易贡献、交易人群和分群交易对比 |
| channel-facts.json | 首次获客渠道、访问时间、六个来源字段及支付订单事实，关联行为/交易生成渠道报表 |
| channels.json | 渠道管理的真实配置列表，含 unknown 系统渠道 |
| lifecycle-rules.json | 生命周期场景名称、显示条件、建议动作、启用设置 |
| manifest.json | 数据截止时间、业务时区和主要统计周期 |

## 缺数据的展示规则

- 缺少核心 users/events/manifest：初始化失败，不生成替代数据。
- 未提供 trades：交易贡献模块不展示，不把缺失当作成交额0。
- 未提供 channels：渠道管理入口不展示。
- 未提供 lifecycle-rules：生命周期模块不展示；页面不请求生命周期发送 API。
- 未提供邀请关系且没有分享事件：推荐入口不展示。
- 已提供 channel-facts 时展示渠道概览、漏斗、趋势和效果对比；缺失时隐藏报表。分析成交关联事实未提供，价值闭环仍隐藏。
- 已提供完整数组但其中没有命中事实时，计算结果可以是0；这是事实为零，区别于接口或文件缺失。
- 分析算法、页面文案、用户设置不是业务事实；页面仍使用算法计算指标，但不会制造记录。

## 渠道编辑

JSON 模式直接展示 channels.json，编辑按钮禁用；修改配置文件后生效，不从 localStorage 读取替代渠道。真实接口模式保存仍使用渠道 API。历史用户来源暂沿用六类旧口径，尚未把新渠道规则倒推到历史事件。

## 生成数据与注释

在仓库根目录执行：

```sh
node frontend/mock-api/generate.mjs
node frontend/mock-api/enrich.mjs
python3 frontend/mock-api/annotate.py
```

seed.js 只供显式生成文件使用，不在页面运行。查看 [FIELD_COMMENTS.md](FIELD_COMMENTS.md) 或同名 `.jsonc` 获取中文字段注释；页面只读取标准 `.json`。

## 可选：测试 API 模式

```sh
node frontend/mock-api/server.mjs
```

另开终端：

```sh
cd frontend
VITE_ANALYTICS_DATA_SOURCE=api VITE_ANALYTICS_API_BASE_URL=http://127.0.0.1:5174/api/analytics npm run dev
```

只读服务按现有 GET 路径返回同名 JSON，并按 [start,end) 过滤事件/交易。它不支持保存、发送或生命周期接口；API 模式与默认静态 JSON 模式分开。默认模式以 manifest 的截止时间为准，API 模式以当前时间为准。

## 完整展示样例 v2

当前646用户、8092事件、93邀请关系、470交易、646渠道获客事实。enrich.mjs 在生成阶段写入八类分群、成熟留存、A-B-A-C、策略结果查看/未查看等显式事实，并重新生成渠道 JSON。默认14天展示成熟留存；切换7天时D7尚未成熟仍显示待观察，不能补造。页面运行不调用生成器。逐页核查见 COVERAGE.md。
