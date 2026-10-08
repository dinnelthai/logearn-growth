# LogEarn 分析框架实施 TODO

更新日期：2026-10-06。此文件是后续工作的主清单；`todo.mkdown` 保留渠道专项清单。

## 接续说明

- 项目：`frontend/`，Vite + 原生 JavaScript + ECharts；仓库没有实际产品网站、采集服务或业务后端。
- 最近已提交版本：`6cbc458`。其后的准确性修复、人群分析和页面拆分尚未提交，请保留工作区改动。
- 状态：待做 / 部分完成 / 完成 / 外部依赖。只有代码、验收和文档都完成才能勾选，接口客户端存在不等于后端已接通。
- 顺序：先完成 P0 中仓库可实施的部分，再做 P1；依赖后端的任务保留待联调状态，继续独立任务。
- 验证：在 `frontend` 执行 `npm test`、`npm run build`；界面改动增加浏览器验证；运行 `git diff --check`。完成后更新本文件，记录证据和剩余限制。
- 数据原则：展示数据全部来自已加载 JSON/API 事实；缺失不能当作 0，不运行生成器补造指标。Mock 可以显式添加独立示例，必须标注为模拟数据，不根据时间邻近猜测真实关联。
- 范围：北极星只有时间维度；生命周期由 Dashboard 计算，仅分析；不恢复通知订阅字段、发送按钮、发送 API 或频控执行。激活与价值时刻暂不做。UTM/KOL 精细归因留到第二版。

## 已完成基线

- [x] 统一事件注册和别名校验；策略心跳排除路径；无效/未来事件排除。
- [x] 交易事件与交易事实去重；按提交批次和关联 ID 计算结果，缺 ID 时不推算成功率。
- [x] referrer 精确 hostname 匹配；首次访问无渠道 ID 也可进入报表；未知渠道兜底；既有快照优先。
- [x] 推荐关系保留 referral_link_id/share_type，缺失不猜测。
- [x] 历史 first_analysis_at 参与首次/回访分类，不生成活动事件。
- [x] 同一固定人群可连续查看漏斗、路径、留存；保存原统计期，支持搜索筛选、清除。
- [x] 路径、留存、交易监控拆成页面模块；图表生命周期统一；用户查询 Map 索引。
- [x] 上一轮 19 个测试文件、91 个测试通过，构建通过。此记录不是后续变更的免检依据。

## P0：真实接入与可信数据

### P0-01 统一实施文档和旧 TODO（完成）

- [x] 清理当前 API 路径、响应键名、来源口径、数据文件位置的旧说明。
- [x] 删除当前范围外的生命周期发送交付要求；保留六条分析规则说明。
- [x] 渠道专项 TODO 区分已实现的解析/配置和未实现的产品采集/后端落库。
- 验收：当前契约与 `api/analytics.js`、`jsonDataset.js`、`normalize.js` 一致，旧建议标明历史/可选，后端不会误按旧路由开发。

### P0-02 首次入口采集 SDK（仓库部分完成；产品接入不属于 Dashboard 范围）

- [x] 设计持久化首次入口状态，与 30 分钟会话状态分离；记录 first_referrer_url、first_landing_url、first_visit_at。
- [x] 支持 ownHosts 精确域名和 subdomainRoots 显式子域配置；站内跳转排除，首次未知不覆盖。部署域名仍须实际产品配置。
- [x] 清理 URL 查询参数/fragment，约定允许保留字段；来源为空或 origin-only 均正常处理。
- [x] 增加显式采集方法，传入实际 send transport；失败重试保持原 event_id，不在分析后台自动生成产品事件。
- [x] 验证刷新、重复进入、多个会话、存储不可用和登录关联。
- 验收：可测试 SDK 保留首次事实。真实产品页面埋点接入由产品侧另行推进，不列入 Dashboard 待办。
- 代码：tracking/client.js 的 captureFirstVisit、tracking/firstVisit.js；用法见实施文档第4节。
- 限制：localStorage 不可用仅当前实例去重；跨标签同时首次捕获非原子，服务端需冻结最早事实；一般 track 的队列重试仍归产品端实现。

### P0-03 后端原始事实接口（外部依赖，仓库先提供契约/校验）

- [ ] 必需 GET /logearn_events?start=MS&end=MS → logearn_events；GET /users → users。
- [ ] 可选 GET /logearn_user → logearn_users；GET /logearn_user_referral → logearn_user_referrals；GET /trades?start=ISO&end=ISO → trades。
- [ ] 服务端提供稳定身份、首次访问快照、历史 first_analysis_at、覆盖范围及 events_complete_through。
- [ ] 匿名与登录身份合并、幂等采集、权限隔离由后端实施；提供冲突处理规则。
- [ ] 前端响应校验及错误/缺失状态验收，失败不能回退 Mock。
- [ ] 使用真实行为完成端到端联调【外部依赖】。
- 验收：登录→分析→交易/推荐链路与服务端事实一致；缺可选接口仅影响对应模块。

### P0-04 交易关联示例与数据质量（完成）

- [x] 在现有 Mock JSON 增加明确同 attempt/trade ID 的提交、成功、失败、待确认、跨日结果场景；保留缺 ID 例子用于质量展示。
- [x] 不给无法确定对应关系的现有记录猜填 ID；新增示例有固定模拟身份和唯一 ID。
- [x] 对交易事实缺 ID、非法时间/金额、重复事实给出可核对的质量统计，明确排除规则。
- [x] 验证结果跨统计期、重复提交、事件+事实重复、缺 ID 成功率及交易量一致性。
- 验收：完整示例成功率可展示，缺 ID 批次仍显示未确定；页面交易量只来自有效事实，不重复增加。

## P1：统计边界与工程维护

### P1-01 历史覆盖与完整周期（完成）

- [x] 统一事件/交易覆盖 metadata、watermark、当前业务日边界，不能以最早一笔交易证明此前完整。
- [x] 同期对比、首次/回访、留存、生命周期分别提示所需历史不足；缺覆盖声明保持未知。
- [x] 验证零交易完整周期和无数据不完整周期的差别，以及不同接口截止不一致。
- [x] 7 日移动平均说明不足 7 日的计算方式，避免短窗口误读。
- 验收：未成熟、缺历史、完整零值三种状态可区分；所有模块共享统一时间口径。

### P1-02 漏斗业务关联（完成）

- [x] 保留现有用户顺序漏斗；增加明确标注的同 token_visit_id / strategy_run_id 关联模式。
- [x] 缺关联字段显示不支持，不悄悄退回顺序匹配；跨 Token/运行事件不能串成同一次转化。
- [x] 测试同币不同访问、跨币、同毫秒顺序和跨周期窗口。
- 验收：用户行为漏斗和单次业务漏斗名称、分母和关联条件清晰。

### P1-03 继续页面拆分（完成）

- [x] 拆出北极星、漏斗、推荐、分群渲染；dashboard 保留导航、共享状态和人群协调。
- [x] 统一图表清理和事件订阅；切页、主题、resize 不泄漏。
- [x] 保持现有页面顺序、JSON 唯一数据源、下钻和人群日期锁定。
- 验收：浏览器逐页/人群切换通过，测试和构建通过；不为拆分改统计口径。

### P1-04 身份冲突与输入验证（完成）

- [x] 无效/未来事件不参与身份映射；一个 anonymous_id 关联多个 user_id 时明确处理和质量提示。
- [x] 统一输入日期、字段类型和重复记录验证，避免不同页面各自猜测。
- 验收：冲突不静默归给第一个用户；可靠关联保持既有去重结果。

## P2：第二版能力

- [ ] P2-01 渠道精细归因：UTM 发布规范、平台与推广方式分离、KOL/社群/账号稳定 ID、币安广场专属证据、Bot/邀请链接验证。详见 todo.mkdown。
- [ ] P2-02 渠道管理后端持久化：版本冲突、历史快照、权限和审计；JSON 模式继续只读；历史重算独立设计。
- [ ] P2-03 渠道多维下钻：活动/素材/推广方式、未知来源排查、成熟留存对比。
- [x] P2-04 大数据量（Phase 0/A/B 仓库部分完成）：`user_facts` + `user_features` + `daily_*` rollup；`GET /api/analytics/meta`；全量事件 >100k 返回 413；`/api/metrics/{north-star,channels,trades,funnel,retention,segments,referral}` + `/api/drill/{users,timeline}`（含 cached_list 同口径下钻）；frontend `backend-agg` 启动只拉 meta。造数支持流式 `npm run generate:data:2m` + `npm run rebuild:rollups`。剩余见下方 P2-04 续项。
- [x] P2-04a 行为路径（Phase C）：`POST /api/metrics/paths`（≤14 天）；nodes/links/path_key；cached_list 下钻；`pathsAgg` 接入。25 万库冒烟：15264 会话 / 4867 用户 / ~4.2s；>14 天返回 400。
- [x] P2-04b 人群对比交叉下钻（Phase C 部分）：`POST /api/metrics/comparison` 概览计数 + cached_list 下钻；`POST /api/metrics/comparison/funnel` 分组漏斗；`panelAgg` 挂到 `segmentsAgg`。留存/趋势视图仍待补。
- [ ] P2-04c 2M 压测验收：造数/413/内存已通过；rollup 页与留存/7 天路径已近标；14 天漏斗与推荐仍超 3s。
  - 造数：`generate:data:2m` → 2,000,004 事件 / 50k 用户 / DB 1003.7MB / 381s + rollup 38.5s。
  - 防护：meta `aggregated`；无窗 raw → 413；浏览器 `usersLen=0`、JS heap ~14.5MB。
  - 已达标：north 14d 153ms、channels 15ms、trades 3ms、segments 363ms、comparison 923ms、retention 14d **2.1s**、paths 默认 ≤7 天 **3.1s**（14 天返回 400）。
  - 仍超：funnel 14d user 模式 **5.1s**（原 87s；light props）、referral **~5s**。可继续做 SQL 预聚合或结果缓存 TTL。
- [ ] P2-04d 口径金样：同一中小数据集（现有 JSON 或 ≤20 万库）对照 frontend `compute*` oracle 与 `/api/metrics`；覆盖 north/funnel/retention/channels/trades/segments/referral；允许排序无关差异，数字与名单同口径。
- [ ] P2-04e 契约与降级补齐：更新 `frontend/docs/API_DATA_CONTRACT.md` 写明聚合/分页/413；推荐页分享点击漏斗、交易监控 failure-reason 明细、agg 模式从远程名单冻 audience 再分析等降级项按需补。
- [ ] P2-05 保存人群：可复用固定快照或动态规则，明确刷新、版本、权限和删除；不混淆两种人群。
- [ ] P2-06 按需加载 ECharts/页面/Mock，减少构建资源体积；先测量再优化。

## 不在当前范围

- 真实产品页面接入埋点 SDK、产品部署域名配置及采集 transport 联调：产品侧正在推进，不属于本 Dashboard 工作。
- 激活与价值时刻、新的因果提升分析。
- 生命周期自动发送、订阅授权、频控、供应商和调度服务。
- 未经用户要求的推送、部署、提交/推送 Git。

## 工作记录与接续入口

| 日期 | 项目 | 状态与证据 | 下一步 |
|---|---|---|---|
| 2026-10-06 | 清单建立 | 已列大纲、分工、验收与外部依赖；基线工作区未提交 | 按编号继续 |
| 2026-10-06 | P0-01 部分完成 | 更新两份 frontend/docs 契约：当前路由表、旧样例标识、JSON 位置、生命周期范围；更新 todo.mkdown 已做/待做边界。git diff --check 通过；纯文档修改未重复运行测试 | 继续逐节核对旧字段表和交付清单，完全统一后勾选首项；然后 P0-02 SDK |

| 2026-10-06 | P0-01 完成 | 重写 API_DATA_CONTRACT.md 和 GROWTH_TRACKING_AND_INTEGRATION.md 为当前契约，消除旧路由、订阅/发送和旧 mock-api 要求；保留事件清单和验收边界 | 后端按当前路由表对接 |
| 2026-10-06 | P0-02 仓库部分完成 | 实现 captureFirstVisit + localStorage lifetime；7条新测试覆盖刷新/会话/未知/站内/重试/登录/受限存储。全量20文件98测试通过，构建及 diff检查通过 | 产品接入由产品侧另行推进（已移出 Dashboard 待办）；后端原子落库待联调；下一仓库任务 P0-04 交易 Mock/质量 |

| 2026-10-06 | P0-04 完成 | 新增 tradeFacts.js 严格校验/重复去重/冲突隔离；normalize 统一使用有效事实；交易页展示全量质量。既有 JSON 新增 MOCK-TRADE-01 / mock_demo，4次有效提交、2成功、1失败、1待确认、50% 演示链成功率；477输入=472接受+5排除。21文件101测试、构建、浏览器和 diff检查通过；截图 /tmp/logearn-trade-quality.png | 下一仓库任务 P1-01 历史覆盖；P0-03真实后端联调仍为外部依赖 |

| 2026-10-06 | P1-01 完成 | coverage.js 统一边界和共同asOf；API/JSON保留交易meta；北极星同比、日交易图/明细、人群对比、渠道D7、留存和生命周期接入。明确完整零值/缺失，7日均线不补零；修正留存批次业务日期。22文件107测试、构建和浏览器验证通过，截图 /tmp/logearn-coverage.png | 下一仓库任务 P1-02 漏斗业务关联；连续单区间声明由后端保证，服务端分页/多区间断档另列P2 |

| 2026-10-06 | P1-02 完成 | computeFunnel新增association、缺ID质量名单和确认流失排除；主页面/分群对比新增两预设、模式选择与下钻，配置保存兼容。现有JSON新增4位MOCK-FUNNEL案例。23文件113测试、构建与浏览器验证通过；截图 /tmp/logearn-associated-funnel.png | 下一仓库任务 P1-03 剩余页面拆分；同次业务漏斗仍按用户首次起点去重，不是所有尝试次数 |

| 2026-10-06 | P1-03 完成 | 新增 pages/northStar.js、funnel.js、referral.js、segments.js；主文件约23KB，仅保留配置/导航/协调及渠道挂载。北极星两图/漏斗统一chartLifecycle；分群自有对比清理。23文件113测试、构建、逐页与367人固定名单跨页验证通过，无控制台错误；截图 /tmp/logearn-page-split.png | 下一仓库任务 P1-04 身份冲突与输入验证；静态导入暂不减少构建体积，按需加载仍P2 |

| 2026-10-06 | P1-04 完成 | inputQuality.js在身份映射前校验事件；冲突匿名保持独立、明确用户保留；事件/同源用户冲突隔离，推荐统一首次绑定及同时间冲突隔离；页面输入质量面板和状态提示。8条专项测试，全量24文件121测试、构建与浏览器通过；现有Mock 10233事件=9804接受+429超截止，北极星386不变；截图 /tmp/logearn-input-identity-quality.png | P1全部完成；进入P2-01渠道第二版可在仓库内做的字段/规则/下钻，链接验证与真实服务仍依赖后端。P0-03后端联调仍未完成；产品埋点接入已移出 Dashboard 范围 |

| 2026-10-06 | 范围调整 | 按用户要求移除实际产品 SDK 接入、部署域名配置和采集 transport 联调待办；产品侧正在推进。保留仓库 SDK 实现记录与 Dashboard 数据接口联调 | 后续仅跟进 Dashboard 范围 |
| 2026-10-08 | P2-04 Phase 0/A/B | SQLite 事实表+rollup；meta/413；metrics 北极星/渠道/交易/漏斗/留存/分群/推荐；drill 分页与 cached_list；frontend backend-agg 与 *Agg 页面；流式造数与 rebuild:rollups。25 万库冒烟：漏斗~2.8s、留存~1.1s、分群~80ms；vitest 121、build 通过 | 下一仓库任务 P2-04a 行为路径；并行可做 P2-04c 2M 压测或 P2-04d 口径金样 |
| 2026-10-08 | P2-04a 行为路径 | paths 服务端聚合 + pathsAgg；≤14 天硬限制；Sankey/常见路径/边下钻。浏览器冒烟通过 | 下一：P2-04b 对比交叉，或 P2-04c 2M 压测 |
| 2026-10-08 | P2-04b 对比交叉 | comparison overview/funnel API + panelAgg；下钻不分发 people[]。浏览器分群页可见对比控件 | 下一：P2-04c 2M 压测，或补对比留存/趋势 |
| 2026-10-08 | P2-04c 部分 | 2M 造数成功；413/聚合启动/堆内存通过；north/channels/trades/segments/comparison <1s。funnel 87s、retention 27s、paths 157s 未达 <3s | 优化 loadNormalizedUsers 事件拉取；达标后勾选 P2-04c |
| 2026-10-08 | P2-04c 加载优化 | `loadEventsForUsers` 改 name+ts 索引扫描；retention 2.5s 达标；funnel 6.8s、paths 10.2s | 路径默认短窗或日聚合；漏斗继续减载；然后勾选 |
| 2026-10-08 | P2-04c 再优化 | paths 默认 max 7 天；funnel user 模式 light props；paths 7d 3.1s、funnel 5.1s | 漏斗/推荐再压或接受并写明 SLA；勾选条件待定 |

每完成一个编号：修改对应复选框，在此表记录改动文件、验证结果和剩余依赖。中断时写下最后完成步骤及下一条具体命令；不要把本文件所有未勾选项当作一次已完成交付。
