# 部署检查清单 ✅

## 📋 阶段 1 部署 (立即可用)

### 前置准备
- [ ] 已阅读 `OPTIMIZATION_COMPLETE.md`
- [ ] 已阅读 `QUICK_DEPLOY.md`
- [ ] 已备份当前代码和数据库

### 后端部署
- [ ] 运行验证脚本: `./scripts/verify-optimization.sh`
- [ ] 安装依赖: `cd backend && npm install`
- [ ] 检查 `.env` 配置正确
- [ ] 重启服务: `pm2 restart logearn-backend`
- [ ] 验证健康检查: `curl http://localhost:3000/health`
- [ ] 验证 Prometheus 指标: `curl http://localhost:3000/metrics`
- [ ] 验证批量查询: `curl -X POST http://localhost:3000/api/batch-analytics ...`

### 前端部署
- [ ] 构建: `cd frontend && npm run build`
- [ ] 验证 `dist/` 目录存在
- [ ] 验证 `echarts-lib-*.js` 存在
- [ ] 验证 `dashboard-*.js` < 100 KB
- [ ] 部署 `dist/` 到 Web 服务器/CDN
- [ ] 清除 CDN 缓存 (如果适用)
- [ ] 验证首页可访问
- [ ] 验证图表正常显示

### 性能验证
- [ ] Chrome Lighthouse 审计 (Performance > 85)
- [ ] 首屏加载时间 < 2s (3G 网络)
- [ ] Network 面板确认资源按需加载
- [ ] 批量查询比单独请求快 50%+
- [ ] 缓存命中率 30 分钟后 > 60%

### 监控配置
- [ ] 访问 `/api/system/metrics` 查看缓存统计
- [ ] 配置 Prometheus 抓取 `/metrics` 端点
- [ ] 导入 Grafana Dashboard (`docs/grafana-dashboard.json`)
- [ ] 配置告警规则 (缓存命中率、慢查询等)

---

## 📋 阶段 2 部署 (深度优化)

### 物化视图准备
- [ ] 申请 Hologres CREATE MATERIALIZED VIEW 权限
- [ ] 确认有足够存储空间 (约 2x 原表大小)
- [ ] 选择低峰期时段执行

### 物化视图部署
- [ ] 连接到 Hologres: `psql -h $PGHOST ...`
- [ ] 执行 SQL: `\i backend/src/db/hologres_views.sql`
- [ ] 等待创建完成 (10-30 分钟)
- [ ] 验证视图数据: `SELECT COUNT(*) FROM mv_events_unified`
- [ ] 记录视图大小和行数

### 自动刷新配置
- [ ] 安装 node-cron: `npm install node-cron`
- [ ] 配置环境变量: `ENABLE_MATERIALIZED_VIEWS=true`
- [ ] 配置刷新时间: `MV_REFRESH_SCHEDULE=5 * * * *`
- [ ] 重启服务: `pm2 restart logearn-backend`
- [ ] 验证定时任务启动: 查看日志
- [ ] 手动触发刷新: `node backend/src/workers/materializedViewRefresh.js`

### 查询迁移
- [ ] 修改 `hologres.js` 的 `eventsCte()` 函数
- [ ] 从 CTE 方式改为查询 `mv_events_unified`
- [ ] 测试单个查询性能
- [ ] 灰度上线 (10% 流量)
- [ ] 监控错误率和延迟
- [ ] 全量上线

### 性能验证
- [ ] P95 查询延迟 < 300ms
- [ ] 缓存命中率 > 90%
- [ ] 慢查询频率 < 5%
- [ ] 运行对比测试: `./scripts/benchmark-comparison.sh`

---

## 📋 可选优化

### Redis L2 缓存
- [ ] 部署 Redis 实例
- [ ] 配置连接: `REDIS_HOST`, `REDIS_PORT`
- [ ] 修改 `multilevel.js` 启用 L2
- [ ] 测试缓存共享
- [ ] 监控 Redis 内存占用

### 读写分离
- [ ] 配置 Hologres 只读副本
- [ ] 分离查询连接池
- [ ] 测试查询性能
- [ ] 监控主从延迟

### 每日预聚合
- [ ] 设计预聚合表结构
- [ ] 实现增量刷新脚本
- [ ] 配置每日定时任务
- [ ] 改造查询使用预聚合表

---

## 🔍 验证命令速查

```bash
# 验证优化文件
./scripts/verify-optimization.sh

# 性能对比测试
./scripts/benchmark-comparison.sh

# 查看缓存统计
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/metrics

# 查看 Prometheus 指标
curl http://localhost:3000/metrics

# 测试批量查询
cd backend
TOKEN=$TOKEN node test/batchAnalytics.manual.test.js

# 手动刷新物化视图
node backend/src/workers/materializedViewRefresh.js

# 清空缓存
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/metrics/flush-cache
```

---

## 📊 成功指标

### 阶段 1 目标
- ✅ 首屏加载 < 2s (3G)
- ✅ Dashboard 大小 < 100 KB
- ✅ 批量查询快 50%+
- ✅ 缓存命中率 > 70%

### 阶段 2 目标
- ✅ P95 查询延迟 < 300ms
- ✅ 缓存命中率 > 90%
- ✅ 慢查询率 < 5%
- ✅ 支持 100+ 并发

---

## ⚠️ 回滚计划

### 前端回滚
```bash
# 恢复旧版 dist/ (从备份)
cp -r dist.backup/* dist/
# 重新部署
```

### 后端回滚
```bash
# 恢复旧版代码
git checkout main^

# 重启服务
pm2 restart logearn-backend
```

### 物化视图回滚
```sql
-- 禁用自动刷新
-- 修改 .env: ENABLE_MATERIALIZED_VIEWS=false

-- 删除视图 (可选)
DROP MATERIALIZED VIEW mv_events_unified;
DROP MATERIALIZED VIEW mv_identity_map;
DROP MATERIALIZED VIEW mv_events_deduped;

-- 恢复原 eventsCte() 函数
```

---

## 📞 问题上报

遇到问题？

1. 查看日志: `pm2 logs logearn-backend`
2. 查看监控: `/api/system/metrics`
3. 运行验证: `./scripts/verify-optimization.sh`
4. 联系团队: [Your Contact]

---

**最后更新:** 2024-10-20  
**版本:** 1.0  
**状态:** 待部署
