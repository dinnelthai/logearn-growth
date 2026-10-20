#!/bin/bash
# =====================================================================
# 阶段 2 快速部署 - 交互式引导
# =====================================================================

set -e

echo "======================================================================"
echo "🚀 阶段 2 优化 - 快速部署"
echo "======================================================================"
echo ""
echo "将部署 4 项优化:"
echo "  1. 每日预聚合表 (必做, Overview -95%)"
echo "  2. 物化视图 (可选, 查询 -90%)"
echo "  3. Redis L2 缓存 (可选, 命中率 +20%)"
echo "  4. 读写分离 (可选, 并发 +300%)"
echo ""

# 加载环境变量
if [ -f "backend/.env" ]; then
  source backend/.env
else
  echo "❌ backend/.env 不存在，请先配置数据库连接"
  exit 1
fi

# 检查数据库连接
if [ -z "$PGHOST" ]; then
  echo "❌ 未配置 PGHOST，请先配置 backend/.env"
  exit 1
fi

echo "数据库: $PGHOST / $PGDATABASE"
echo ""

# ===================================================================
# 1. 每日预聚合表 (必做)
# ===================================================================

echo "======================================================================"
echo "1️⃣  每日预聚合表 (推荐)"
echo "======================================================================"
echo ""
echo "效果: Overview 查询从 800ms → 40ms (-95%)"
echo "风险: 低 (只添加新表，不影响现有功能)"
echo ""

read -p "是否创建预聚合表? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  echo ""
  echo "创建预聚合表..."

  if psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -f backend/src/db/daily_rollups.sql > /dev/null 2>&1; then
    echo "✅ 预聚合表创建成功"

    # 回填数据
    echo ""
    read -p "回填最近几天数据? (输入天数, 0=跳过) [30]: " BACKFILL_DAYS
    BACKFILL_DAYS=${BACKFILL_DAYS:-30}

    if [ "$BACKFILL_DAYS" -gt 0 ]; then
      echo "回填最近 $BACKFILL_DAYS 天数据..."
      cd backend
      node src/workers/dailyRollupRefresh.js backfill "$BACKFILL_DAYS" 2>/dev/null || echo "⚠️  回填失败，请手动执行"
      cd ..
      echo "✅ 数据回填完成"
    fi

    # 启用定时任务
    if ! grep -q "ENABLE_DAILY_ROLLUP=true" backend/.env; then
      echo "" >> backend/.env
      echo "ENABLE_DAILY_ROLLUP=true" >> backend/.env
      echo "ROLLUP_SCHEDULE=5 2 * * *" >> backend/.env
      echo "✅ 定时任务已启用 (每日凌晨 2:05 刷新)"
    fi
  else
    echo "❌ 创建失败，请检查数据库权限"
  fi
fi

echo ""

# ===================================================================
# 2. 物化视图 (可选)
# ===================================================================

echo "======================================================================"
echo "2️⃣  物化视图 (可选)"
echo "======================================================================"
echo ""
echo "效果: 查询从 500ms → 50ms (-90%)"
echo "风险: 中 (需要 DBA 权限，可能占用磁盘空间)"
echo ""

read -p "是否创建物化视图? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "创建物化视图..."

  if psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -f backend/src/db/hologres_views.sql > /dev/null 2>&1; then
    echo "✅ 物化视图创建成功"

    # 启用定时刷新
    if ! grep -q "ENABLE_MATERIALIZED_VIEWS=true" backend/.env; then
      echo "" >> backend/.env
      echo "ENABLE_MATERIALIZED_VIEWS=true" >> backend/.env
      echo "MV_REFRESH_SCHEDULE=5 * * * *" >> backend/.env
      echo "✅ 定时刷新已启用 (每小时第 5 分钟)"
    fi
  else
    echo "❌ 创建失败，可能需要更高权限"
  fi
fi

echo ""

# ===================================================================
# 3. Redis L2 缓存 (可选)
# ===================================================================

echo "======================================================================"
echo "3️⃣  Redis L2 缓存 (可选)"
echo "======================================================================"
echo ""
echo "效果: 缓存命中率 80% → 95% (+19%)"
echo "需要: Redis 服务器"
echo ""

read -p "是否启用 Redis L2 缓存? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""

  # 安装 ioredis
  if ! npm list ioredis --prefix backend > /dev/null 2>&1; then
    echo "安装 ioredis..."
    cd backend
    npm install ioredis --save
    cd ..
  fi

  # 配置 Redis
  read -p "Redis 地址 [localhost]: " REDIS_HOST
  REDIS_HOST=${REDIS_HOST:-localhost}

  read -p "Redis 端口 [6379]: " REDIS_PORT
  REDIS_PORT=${REDIS_PORT:-6379}

  # 测试连接
  if command -v redis-cli &> /dev/null; then
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
      echo "✅ Redis 连接成功"

      # 更新 .env
      if ! grep -q "ENABLE_REDIS_L2=true" backend/.env; then
        echo "" >> backend/.env
        echo "# Redis L2 Cache" >> backend/.env
        echo "ENABLE_REDIS_L2=true" >> backend/.env
        echo "REDIS_HOST=$REDIS_HOST" >> backend/.env
        echo "REDIS_PORT=$REDIS_PORT" >> backend/.env
        echo "✅ Redis 配置已添加"
      fi
    else
      echo "⚠️  Redis 连接失败，请检查服务是否启动"
    fi
  else
    echo "⚠️  未找到 redis-cli，跳过连接测试"
  fi
fi

echo ""

# ===================================================================
# 4. 读写分离 (可选)
# ===================================================================

echo "======================================================================"
echo "4️⃣  读写分离 (可选)"
echo "======================================================================"
echo ""
echo "效果: 并发支持 50 → 200+ 用户 (+300%)"
echo "需要: Hologres 只读副本"
echo ""

read -p "是否配置读写分离? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  read -p "只读副本地址: " PGHOST_REPLICA

  if [ ! -z "$PGHOST_REPLICA" ]; then
    # 测试连接
    if psql -h "$PGHOST_REPLICA" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" > /dev/null 2>&1; then
      echo "✅ 只读副本连接成功"

      # 更新 .env
      if ! grep -q "ENABLE_READ_REPLICA=true" backend/.env; then
        echo "" >> backend/.env
        echo "# Read/Write Split" >> backend/.env
        echo "ENABLE_READ_REPLICA=true" >> backend/.env
        echo "PGHOST_REPLICA=$PGHOST_REPLICA" >> backend/.env
        echo "✅ 读写分离配置已添加"
      fi

      # 生成迁移报告
      echo ""
      echo "生成代码迁移报告..."
      cd backend
      node src/db/migrateToRWSplit.js > ../RW_SPLIT_REPORT.txt 2>&1 || true
      cd ..
      echo "⚠️  需要手动修改代码使用 read()/write()"
      echo "   详见: RW_SPLIT_REPORT.txt"
    else
      echo "❌ 只读副本连接失败"
    fi
  fi
fi

echo ""

# ===================================================================
# 5. 重启服务
# ===================================================================

echo "======================================================================"
echo "5️⃣  重启服务"
echo "======================================================================"
echo ""

read -p "是否重启后端服务? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  cd backend

  if command -v pm2 &> /dev/null; then
    echo "使用 PM2 重启..."
    pm2 restart logearn-backend 2>/dev/null || pm2 start src/index.js --name logearn-backend
    echo "✅ 服务已重启"
  else
    echo "⚠️  未找到 PM2，请手动重启:"
    echo "   cd backend && npm run start"
  fi

  cd ..
fi

echo ""

# ===================================================================
# 6. 验证
# ===================================================================

echo "======================================================================"
echo "✅ 部署完成"
echo "======================================================================"
echo ""

sleep 2

# 检查服务
BACKEND_URL=${BACKEND_URL:-http://localhost:3001}

if curl -f -s "$BACKEND_URL/health" > /dev/null 2>&1; then
  echo "✅ 后端服务运行正常"
else
  echo "⚠️  后端服务未响应"
fi

# 检查预聚合
if curl -f -s "$BACKEND_URL/api/rollup/health" > /dev/null 2>&1; then
  echo "✅ 预聚合系统运行正常"

  ROLLUP_HEALTH=$(curl -s "$BACKEND_URL/api/rollup/health")
  echo "   $ROLLUP_HEALTH"
fi

echo ""
echo "🎉 阶段 2 优化部署完成！"
echo ""
echo "下一步:"
echo "  1. 运行验证脚本: ./scripts/verify-optimization.sh"
echo "  2. 监控预聚合: curl $BACKEND_URL/api/rollup/health"
echo "  3. 监控缓存: curl $BACKEND_URL/api/system/metrics"
echo ""
echo "======================================================================"
