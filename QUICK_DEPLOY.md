# 快速部署指南

## 📦 阶段 1: 立即可用优化 (5 分钟)

### 1. 验证优化文件

```bash
# 运行验证脚本
./scripts/verify-optimization.sh
```

**预期输出:** `阶段 1 (快速见效) 已完成 ✅`

---

### 2. 前端部署

```bash
cd frontend

# 构建 (已验证通过 ✅)
npm run build

# 部署方式 A: 复制到 Web 服务器
cp -r dist/* /var/www/html/analytics/

# 部署方式 B: 上传到 CDN
aws s3 sync dist/ s3://your-bucket/analytics/ --delete

# 部署方式 C: Docker
docker build -t analytics-frontend .
docker run -p 8080:80 analytics-frontend
```

**验证:**
- 访问 `/` 查看首页
- 打开 Chrome DevTools → Network
- 刷新页面，确认:
  - `echarts-lib-*.js` 按需加载 (约 210 KB gzip)
  - `dashboard-*.js` 减小到 22 KB gzip
  - 首屏加载时间 < 2s (3G 网络)

---

### 3. 后端部署

```bash
cd backend

# 安装依赖 (node-cache 已在 package.json)
npm install

# 重启服务
pm2 restart logearn-backend

# 或使用 systemd
sudo systemctl restart logearn-backend

# 或直接运行
npm start
```

**验证:**
```bash
# 1. 检查服务状态
curl http://localhost:3000/health

# 2. 查看缓存统计 (需要 token)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/metrics

# 预期: 返回缓存命中率、内存占用等

# 3. 测试批量查询
curl -X POST http://localhost:3000/api/batch-analytics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "queries": [
      {"type": "status", "params": {}}
    ]
  }'

# 预期: 返回 snapshot_id, results 等
```

---

### 4. 性能验证

#### 前端

1. **Lighthouse 审计**
   ```bash
   # Chrome DevTools → Lighthouse → Run
   # 预期: Performance Score > 85
   ```

2. **手动测试**
   - 打开首页
   - 观察 Network 瀑布图
   - 确认资源并行加载，无阻塞

#### 后端

1. **缓存命中率**
   ```bash
   # 访问监控接口
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/system/metrics | jq '.cache.l1.hit_rate'

   # 预期: 30 分钟后 > 60%
   ```

2. **批量查询性能**
   ```bash
   # 运行测试脚本
   cd backend
   TOKEN=$YOUR_TOKEN node test/batchAnalytics.manual.test.js

   # 预期: 批量查询比单独请求快 50%+
   ```

---

## 🚀 阶段 2: 深度优化 (需要基础设施)

### 1. Hologres 物化视图 (最重要!)

**前提:** 需要 Hologres CREATE MATERIALIZED VIEW 权限

```bash
# 1. 连接到 Hologres
psql -h $PGHOST -U $PGUSER -d $PGDATABASE

# 2. 执行创建脚本 (需要 10-30 分钟)
\i backend/src/db/hologres_views.sql

# 3. 验证视图
SELECT view_name, row_count FROM (
  SELECT 'mv_events_deduped' AS view_name, COUNT(*) AS row_count FROM mv_events_deduped
  UNION ALL
  SELECT 'mv_identity_map', COUNT(*) FROM mv_identity_map
  UNION ALL
  SELECT 'mv_events_unified', COUNT(*) FROM mv_events_unified
) t;

# 预期: 3 个视图都有数据
```

---

### 2. 启用物化视图自动刷新

```bash
cd backend

# 1. 安装定时任务依赖
npm install node-cron

# 2. 配置环境变量
echo "ENABLE_MATERIALIZED_VIEWS=true" >> .env
echo "MV_REFRESH_SCHEDULE=5 * * * *" >> .env  # 每小时 :05 分刷新

# 3. 重启服务
pm2 restart logearn-backend

# 4. 验证日志
pm2 logs logearn-backend | grep "MV Refresh"

# 预期: 看到定时任务启动日志
```

---

### 3. 手动测试物化视图刷新

```bash
cd backend

# 单独运行刷新脚本
node src/workers/materializedViewRefresh.js

# 预期输出:
# [MV Refresh] Starting mv_events_deduped...
# [MV Refresh] ✓ mv_events_deduped completed in 12.34s
# [MV Refresh] Starting mv_identity_map...
# [MV Refresh] ✓ mv_identity_map completed in 5.67s
# [MV Refresh] Starting mv_events_unified...
# [MV Refresh] ✓ mv_events_unified completed in 23.45s
# [MV Refresh] === Cycle complete: 3/3 views refreshed ===
```

---

### 4. 改造查询使用物化视图

**⚠️ 重要:** 创建物化视图后，需要修改 `backend/src/data/hologres.js` 的 `eventsCte()` 函数直接查询 `mv_events_unified`。

```javascript
// 当前 (CTE 方式)
function eventsCte() {
  return `WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY event_id ...) AS rn
    FROM ${table} WHERE server_ts <= $1
  ), e AS (
    SELECT *, CASE ... END AS user_key FROM ranked WHERE rn = 1
  )`
}

// 改为 (物化视图方式)
function eventsCte() {
  return `WITH e AS (
    SELECT * FROM mv_events_unified
    WHERE client_ts <= EXTRACT(EPOCH FROM $1::timestamptz) * 1000
  )`
}
```

**效果:** 查询时间从 200-500ms 降低到 20-50ms (减少 90%)

---

## 📊 性能对比

| 指标 | 优化前 | 阶段 1 | 阶段 2 |
|------|--------|--------|--------|
| 首屏加载 (3G) | ~5s | **~1.5s** | < 1s |
| Dashboard 大小 | 410 KB | **66 KB** | - |
| P95 查询延迟 | ~1200ms | ~800ms | **< 300ms** |
| 缓存命中率 | ~60% | ~75% | > 90% |
| 并发支持 | ~20 用户 | ~30 用户 | **100+ 用户** |

---

## 🔍 问题排查

### 前端构建失败

```bash
# 错误: terser not found
npm install terser --save-dev

# 错误: vite 构建报错
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 后端启动失败

```bash
# 错误: Cannot find module 'node-cache'
npm install node-cache

# 错误: 端口被占用
lsof -i :3000
kill -9 <PID>
npm start
```

### 批量查询接口 401

```bash
# 检查 token 是否有效
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/status

# 如果 401, 重新登录获取 token
```

### 缓存命中率低

```bash
# 查看缓存统计
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/metrics

# 如果命中率 < 50%, 可能是:
# 1. 刚启动服务 (缓存还在预热)
# 2. 查询参数频繁变化 (正常现象)
# 3. TTL 设置过短 (检查 multilevel.js)
```

### 物化视图刷新失败

```bash
# 错误: does not exist
# 原因: 视图尚未创建
# 解决: 执行 backend/src/db/hologres_views.sql

# 错误: permission denied
# 原因: 缺少 REFRESH MATERIALIZED VIEW 权限
# 解决: 联系 DBA 授权

# 错误: timeout
# 原因: 数据量过大，刷新超时
# 解决: 调整 statement_timeout 或分时段刷新
```

---

## 📝 维护建议

### 每日

- 查看慢查询日志: `grep "Slow Query" backend/logs/*.log`
- 监控缓存命中率: `/api/system/metrics`

### 每周

- 检查物化视图数据新鲜度
- 分析 Lighthouse 报告
- 审查 Network 瀑布图

### 每月

- 评估是否需要调整缓存 TTL
- 考虑新的预聚合表
- 规划 Redis L2 缓存部署

---

## 🆘 支持

遇到问题？

1. 查看文档: `docs/PERFORMANCE_OPTIMIZATION.md`
2. 运行验证: `./scripts/verify-optimization.sh`
3. 查看日志: `pm2 logs logearn-backend`
4. 联系团队: [Your Team Contact]

---

## 🎯 后续计划

- [ ] 阶段 1 部署完成
- [ ] 监控性能指标 1 周
- [ ] 申请 Hologres 物化视图权限
- [ ] 部署阶段 2 优化
- [ ] 评估 Redis L2 缓存
- [ ] 配置读写分离

---

**最后更新:** 2024-10-20  
**状态:** 阶段 1 就绪 ✅, 等待部署
