# Logearn Growth Analytics

增长分析系统 - 用户行为分析与增长诊断平台

---

## 🚀 性能优化 (2024-10-20 更新)

**阶段 1 (立即可用) 已完成 ✅**
- 前端代码分割: dashboard.js 减小 84% (410KB → 66KB)
- 批量查询接口: 3 RTT → 1 RTT
- 多级缓存系统: 命中率 75%+
- 首屏加载时间: ~5s → ~1.5s (-70%)

**快速部署:**
```bash
# 1. 验证优化
./scripts/verify-optimization.sh

# 2. 安装依赖
cd backend && npm install

# 3. 重启服务
pm2 restart logearn-backend

# 4. 前端部署
cd ../frontend
npm run build
# 部署 dist/ 到 Web 服务器
```

**完整文档:** [OPTIMIZATION_COMPLETE.md](./OPTIMIZATION_COMPLETE.md)

---

## 项目结构

```
Logearn-growth/
├── frontend/          # 前端 (Vite + Vue)
│   ├── src/
│   │   ├── api/      # API 客户端
│   │   ├── pages/    # 页面组件
│   │   └── utils/    # 工具函数
│   ├── vite.config.js  # ✨ 代码分割配置
│   └── README_BATCH_API.md  # ✨ 批量 API 指南
│
├── backend/           # 后端 (Express + Hologres)
│   ├── src/
│   │   ├── cache/    # ✨ 多级缓存
│   │   ├── data/     # 数据层
│   │   ├── db/       # 数据库
│   │   ├── monitoring/  # ✨ Prometheus 监控
│   │   ├── routes/   # 路由
│   │   └── workers/  # ✨ 后台任务
│   └── test/         # 测试
│
├── docs/             # 文档
│   ├── PERFORMANCE_OPTIMIZATION.md  # ✨ 详细优化方案
│   └── grafana-dashboard.json  # ✨ Grafana 模板
│
├── scripts/          # ✨ 工具脚本
│   └── verify-optimization.sh  # 部署验证
│
├── OPTIMIZATION_COMPLETE.md  # ✨ 优化总结
├── QUICK_DEPLOY.md          # ✨ 快速部署指南
└── OPTIMIZATION_SUMMARY.md  # ✨ 优化概览
```

✨ = 本次性能优化新增/修改

---

## 核心功能

### 增长分析
- 用户增长趋势
- 来源质量分析
- 漏斗转化分析
- 用户留存分析
- 推荐贡献分析
- 用户路径分析

### 系统监控 (NEW!)
- 实时性能监控面板 (`/performance`)
- 缓存统计 (`/api/system/metrics`)
- Prometheus 指标 (`/metrics`)
- 慢查询告警

---

## 技术栈

### 前端
- **框架:** Vite + Vue 3
- **图表:** ECharts (按需加载)
- **优化:** 代码分割、懒加载、Terser 压缩

### 后端
- **框架:** Express.js
- **数据库:** Hologres (PostgreSQL 兼容)
- **缓存:** 多级缓存 (L1 内存 + L2 Redis)
- **监控:** Prometheus + Grafana

---

## API 接口

### 增长分析
- `POST /api/analytics/funnel` - 漏斗转化
- `POST /api/analytics/retention` - 留存分析
- `POST /api/analytics/channels` - 来源质量
- `POST /api/analytics/referral` - 推荐贡献
- `POST /api/analytics/paths` - 用户路径

### 批量查询 (NEW!)
- `POST /api/batch-analytics` - 批量获取多个指标

**示例:**
```javascript
import { fetchHomeDashboard } from './api/batchAnalytics.js'

// 一次获取首页所有数据
const { overview, growthInsights, channels } =
  await fetchHomeDashboard(start, end)
```

### 系统监控 (NEW!)
- `GET /api/system/metrics` - 缓存统计
- `POST /api/system/metrics/flush-cache` - 清空缓存
- `GET /metrics` - Prometheus 格式指标

---

## 开发指南

### 本地开发

```bash
# 在项目根目录执行
npm run dev
```

同时运行后端 API、AI Worker 和前端；按 Ctrl+C 停止由该命令启动的进程。需先安装 backend 和 frontend 的依赖，并准备好现有的数据库、Redis 和 `backend/.env` 配置。默认前端地址为 http://localhost:5173。若后端端口由本项目旧后端占用，启动器会将其停止；其他程序占用时需手动处理。已有本项目 Worker 会继续运行，不由该命令停止。后端启动时仍会执行项目原有的本地数据库初始化；此命令不会执行 AI 数据库迁移。

### 构建部署

```bash
# 前端
cd frontend
npm run build  # 生成 dist/

# 后端
cd backend
npm start  # 生产模式
# 或使用 pm2: pm2 start ecosystem.config.js
```

---

## 性能指标

| 指标 | 优化前 | 优化后 (阶段 1) | 提升 |
|------|--------|----------------|------|
| 首屏加载 (3G) | ~5s | **~1.5s** | **-70%** |
| Dashboard 大小 | 410 KB | **66 KB** | **-84%** |
| P95 查询延迟 | ~1200ms | **~800ms** | **-33%** |
| 缓存命中率 | ~60% | **~75%** | **+25%** |
| Lighthouse 分数 | ~60 | **> 85** | **+42%** |

---

## 监控与告警

### Grafana 仪表板
```bash
# 导入 Grafana 模板
curl -X POST http://your-grafana/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @docs/grafana-dashboard.json
```

### Prometheus 配置
```yaml
scrape_configs:
  - job_name: 'logearn-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### 告警规则
- 缓存命中率 < 70% → 警告
- 慢查询频率 > 10/min → 严重
- 内存占用 > 2GB → 警告
- P95 查询延迟 > 1s → 警告

---

## 维护建议

### 日常
- 查看 `/api/system/metrics` 缓存统计
- 检查慢查询日志: `grep "Slow Query" logs/*.log`

### 每周
- 审查 Lighthouse 报告
- 分析 Network 瀑布图
- 检查 Prometheus 指标趋势

### 每月
- 评估缓存 TTL 设置
- 考虑新的预聚合表
- 规划进一步优化 (Redis L2、读写分离)

---

## 常见问题

### 前端

**Q: 首屏加载慢?**
- 检查 CDN 是否启用 gzip
- 验证 `echarts-lib-*.js` 按需加载
- 使用 Chrome DevTools → Performance 分析

**Q: 图表不显示?**
- 打开控制台查看错误
- 确认 ECharts 模块已加载
- 检查数据格式

### 后端

**Q: 缓存命中率低?**
- 刚启动服务 (等待预热 30 分钟)
- 查询参数频繁变化 (正常)
- 检查 TTL 设置 (默认 30s)

**Q: 批量查询 401?**
- 验证 token 有效性
- 检查 Authorization header

**Q: 慢查询频繁?**
- 考虑启用物化视图 (阶段 2)
- 检查 Hologres 连接池
- 分析具体的慢 SQL

---

## 文档索引

### 优化相关
- [OPTIMIZATION_COMPLETE.md](./OPTIMIZATION_COMPLETE.md) - 完整优化总结
- [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - 快速部署指南
- [OPTIMIZATION_SUMMARY.md](./OPTIMIZATION_SUMMARY.md) - 优化概览
- [docs/PERFORMANCE_OPTIMIZATION.md](./docs/PERFORMANCE_OPTIMIZATION.md) - 详细方案

### API 文档
- [frontend/README_BATCH_API.md](./frontend/README_BATCH_API.md) - 批量查询 API

### 监控
- [docs/grafana-dashboard.json](./docs/grafana-dashboard.json) - Grafana 模板
- [backend/src/monitoring/prometheus.js](./backend/src/monitoring/prometheus.js) - Prometheus 导出器

### 阶段 2 (深度优化)
- [backend/src/db/hologres_views.sql](./backend/src/db/hologres_views.sql) - 物化视图 SQL
- [backend/src/workers/materializedViewRefresh.js](./backend/src/workers/materializedViewRefresh.js) - 视图刷新任务

---

## 贡献

欢迎提交 Issue 和 Pull Request！

### 开发规范
- 代码风格: ESLint + Prettier
- 提交信息: [Conventional Commits](https://www.conventionalcommits.org/)
- 测试: 确保现有测试通过

---

## 许可证

[MIT License](./LICENSE)

---

## 联系方式

- **团队:** Logearn 增长团队
- **问题反馈:** [GitHub Issues](https://github.com/your-org/logearn-growth/issues)

---

**最后更新:** 2024-10-20  
**版本:** 2.0 (性能优化版)  
**状态:** ✅ 生产就绪
