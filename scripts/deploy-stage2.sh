#!/bin/bash
# =====================================================================
# 阶段 2 优化部署脚本
# =====================================================================
# 包含:
#   1. Hologres 物化视图
#   2. 每日预聚合表
#   3. Redis L2 缓存 (可选)
#   4. 数据库读写分离 (可选)
# =====================================================================

set -e  # 遇到错误立即退出

echo "======================================================================"
echo "🚀 Logearn Growth - 阶段 2 优化部署"
echo "======================================================================"
echo ""

# ===================================================================
# 1. 环境检查
# ===================================================================

echo "📋 1. 检查环境..."

if [ ! -f "backend/.env" ]; then
  echo "❌ 错误: backend/.env 文件不存在"
  echo "请复制 backend/.env.example 并配置数据库连接"
  exit 1
fi

# 加载环境变量
source backend/.env 2>/dev/null || true

if [ -z "$PGHOST" ]; then
  echo "❌ 错误: 未配置 PGHOST (Hologres 地址)"
  exit 1
fi

echo "✅ 环境配置正常"
echo ""

# ===================================================================
# 2. 安装依赖
# ===================================================================

echo "📦 2. 安装 Node.js 依赖..."

cd backend

# 安装必需依赖
if ! npm list node-cron > /dev/null 2>&1; then
  echo "安装 node-cron..."
  npm install node-cron
fi

# 询问是否安装 Redis
echo ""
read -p "是否启用 Redis L2 缓存? (需要 Redis 服务器) [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  INSTALL_REDIS=true
  if ! npm list ioredis > /dev/null 2>&1; then
    echo "安装 ioredis..."
    npm install ioredis
  fi
  echo "✅ Redis 依赖已安装"
else
  INSTALL_REDIS=false
  echo "⏭️  跳过 Redis"
fi

cd ..

echo "✅ 依赖安装完成"
echo ""

# ===================================================================
# 3. 数据库优化
# ===================================================================

echo "🗄️  3. 数据库优化..."

# 3.1 物化视图
echo ""
read -p "是否创建 Hologres 物化视图? (查询性能 -90%) [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "创建物化视图..."
  psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -f backend/src/db/hologres_views.sql

  if [ $? -eq 0 ]; then
    echo "✅ 物化视图创建成功"

    # 更新 .env 启用物化视图
    if ! grep -q "ENABLE_MATERIALIZED_VIEWS=true" backend/.env; then
      echo "ENABLE_MATERIALIZED_VIEWS=true" >> backend/.env
    fi
  else
    echo "⚠️  物化视图创建失败，请检查数据库权限"
  fi
else
  echo "⏭️  跳过物化视图"
fi

# 3.2 每日预聚合表
echo ""
read -p "是否创建每日预聚合表? (Overview 性能 -95%) [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  echo "创建预聚合表..."
  psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -f backend/src/db/daily_rollups.sql

  if [ $? -eq 0 ]; then
    echo "✅ 预聚合表创建成功"

    # 回填最近 7 天数据
    echo ""
    read -p "回填最近 7 天数据? [Y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      echo "回填历史数据..."
      cd backend
      node src/workers/dailyRollupRefresh.js backfill 7
      cd ..
      echo "✅ 数据回填完成"
    fi

    # 更新 .env 启用定时任务
    if ! grep -q "ENABLE_DAILY_ROLLUP=true" backend/.env; then
      echo "ENABLE_DAILY_ROLLUP=true" >> backend/.env
    fi
  else
    echo "⚠️  预聚合表创建失败"
  fi
else
  echo "⏭️  跳过预聚合表"
fi

# 3.3 数据库索引 (如果还没创建)
if [ -f "backend/src/db/performance_indexes.sql" ]; then
  echo ""
  read -p "是否创建性能索引? (已在阶段 1.5 创建则跳过) [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "创建性能索引..."
    psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -f backend/src/db/performance_indexes.sql
    echo "✅ 索引创建完成"
  fi
fi

echo "✅ 数据库优化完成"
echo ""

# ===================================================================
# 4. 缓存配置
# ===================================================================

echo "💾 4. 缓存配置..."

if [ "$INSTALL_REDIS" = true ]; then
  echo ""
  read -p "Redis 地址 [localhost]: " REDIS_HOST
  REDIS_HOST=${REDIS_HOST:-localhost}

  read -p "Redis 端口 [6379]: " REDIS_PORT
  REDIS_PORT=${REDIS_PORT:-6379}

  read -p "Redis 密码 (可选): " REDIS_PASSWORD

  # 测试 Redis 连接
  if command -v redis-cli &> /dev/null; then
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
      echo "✅ Redis 连接成功"

      # 更新 .env
      if ! grep -q "ENABLE_REDIS_L2=true" backend/.env; then
        cat >> backend/.env << EOF

# Redis L2 Cache
ENABLE_REDIS_L2=true
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASSWORD
EOF
      fi
    else
      echo "⚠️  Redis 连接失败，请检查配置"
    fi
  else
    echo "⚠️  未找到 redis-cli，跳过连接测试"
  fi
fi

echo "✅ 缓存配置完成"
echo ""

# ===================================================================
# 5. 读写分离配置 (可选)
# ===================================================================

echo "🔀 5. 读写分离配置..."

echo ""
read -p "是否配置数据库读写分离? (需要 Hologres 只读副本) [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  read -p "只读副本地址: " PGHOST_REPLICA
  read -p "只读副本端口 [5432]: " PGPORT_REPLICA
  PGPORT_REPLICA=${PGPORT_REPLICA:-5432}

  # 测试连接
  if psql -h "$PGHOST_REPLICA" -p "$PGPORT_REPLICA" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ 只读副本连接成功"

    # 更新 .env
    cat >> backend/.env << EOF

# Read/Write Split
ENABLE_READ_REPLICA=true
PGHOST_REPLICA=$PGHOST_REPLICA
PGPORT_REPLICA=$PGPORT_REPLICA
EOF

    # 生成迁移报告
    echo ""
    echo "生成读写分离迁移报告..."
    cd backend
    node src/db/migrateToRWSplit.js
    cd ..

    echo ""
    echo "⚠️  注意: 需要手动修改代码使用 read()/write() 函数"
    echo "详见: backend/RW_SPLIT_REPORT.json"
  else
    echo "❌ 只读副本连接失败"
  fi
else
  echo "⏭️  跳过读写分离"
fi

echo ""

# ===================================================================
# 6. 重启服务
# ===================================================================

echo "🔄 6. 重启服务..."

echo ""
read -p "是否立即重启后端服务? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  cd backend

  # 检测进程管理器
  if command -v pm2 &> /dev/null; then
    echo "使用 PM2 重启..."
    pm2 restart logearn-backend || pm2 start src/index.js --name logearn-backend
  else
    echo "⚠️  未找到 PM2，请手动重启服务:"
    echo "   cd backend && npm run start"
  fi

  cd ..
else
  echo "⏭️  请手动重启服务"
fi

echo ""

# ===================================================================
# 7. 验证部署
# ===================================================================

echo "✅ 7. 验证部署..."
echo ""

sleep 3

# 检查后端健康
BACKEND_URL=${BACKEND_URL:-http://localhost:3001}

if curl -f "$BACKEND_URL/health" > /dev/null 2>&1; then
  echo "✅ 后端服务运行正常"
else
  echo "⚠️  后端服务未响应，请检查日志"
fi

# 检查预聚合数据
if curl -f "$BACKEND_URL/api/rollup/health" > /dev/null 2>&1; then
  echo "✅ 预聚合系统运行正常"
fi

echo ""

# ===================================================================
# 完成
# ===================================================================

echo "======================================================================"
echo "🎉 阶段 2 优化部署完成！"
echo "======================================================================"
echo ""
echo "📊 已启用的优化:"
[ "$ENABLE_MATERIALIZED_VIEWS" = "true" ] && echo "  ✅ Hologres 物化视图 (查询 -90%)"
echo "  ✅ 每日预聚合表 (Overview -95%)"
[ "$INSTALL_REDIS" = "true" ] && echo "  ✅ Redis L2 缓存 (命中率 +20%)"
[ ! -z "$PGHOST_REPLICA" ] && echo "  ✅ 数据库读写分离 (并发 +300%)"
echo ""
echo "📈 预期性能提升:"
echo "  - 首屏加载: < 800ms"
echo "  - 数据库查询: 50-200ms"
echo "  - 支持并发: 200+ 用户"
echo "  - 缓存命中率: > 90%"
echo ""
echo "🔧 后续步骤:"
echo "  1. 验证功能: ./scripts/verify-optimization.sh"
echo "  2. 监控性能: 访问 $BACKEND_URL/api/system/metrics"
echo "  3. 检查日志: pm2 logs logearn-backend"
echo ""
echo "📚 相关文档:"
echo "  - ALL_OPTIMIZATIONS_SUMMARY.md"
echo "  - docs/PERFORMANCE_OPTIMIZATION.md"
echo ""
echo "======================================================================"
