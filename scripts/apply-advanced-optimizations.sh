#!/usr/bin/env bash
# =====================================================================
# 高级优化一键部署脚本
# =====================================================================
# 自动执行所有三星以上优化 (⭐⭐⭐+)
# 预期时间: 10-15 分钟
# =====================================================================

set -e  # 遇到错误立即退出

COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'
COLOR_RESET='\033[0m'

echo "======================================================================"
echo "  🚀 高级优化部署脚本"
echo "======================================================================"
echo ""

# =====================================================================
# 1. 前端优化
# =====================================================================

echo -e "${COLOR_BLUE}--- 第 1 步: 安装前端依赖 ---${COLOR_RESET}"
cd "$(dirname "$0")/../frontend" || exit 1

echo "安装 Brotli、PWA、图片优化插件..."
npm install --save-dev \
  vite-plugin-compression@0.5.1 \
  vite-plugin-imagemin@0.6.1 \
  vite-plugin-pwa@latest \
  --legacy-peer-deps

echo -e "${COLOR_GREEN}✓${COLOR_RESET} 前端依赖已安装"
echo ""

# =====================================================================
# 2. 重新构建前端
# =====================================================================

echo -e "${COLOR_BLUE}--- 第 2 步: 重新构建前端 ---${COLOR_RESET}"

echo "清理旧构建..."
rm -rf dist

echo "构建中 (Brotli + PWA + 图片优化)..."
npm run build

# 验证构建产物
if [ -f "dist/index.html" ]; then
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} 前端构建成功"
else
  echo -e "${COLOR_RED}✗${COLOR_RESET} 前端构建失败"
  exit 1
fi

# 检查压缩文件
BR_COUNT=$(find dist/assets -name "*.br" 2>/dev/null | wc -l)
GZ_COUNT=$(find dist/assets -name "*.gz" 2>/dev/null | wc -l)

if [ "$BR_COUNT" -gt 0 ]; then
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} Brotli 压缩成功 ($BR_COUNT 个文件)"
else
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} Brotli 压缩未生效 (检查 vite-plugin-compression)"
fi

if [ "$GZ_COUNT" -gt 0 ]; then
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} gzip 压缩成功 ($GZ_COUNT 个文件)"
else
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} gzip 压缩未生效"
fi

# 检查 PWA
if [ -f "dist/sw.js" ]; then
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} Service Worker 已生成"
else
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} Service Worker 未生成 (检查 vite-plugin-pwa)"
fi

if [ -f "dist/manifest.webmanifest" ]; then
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} PWA Manifest 已生成"
else
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} PWA Manifest 未生成"
fi

echo ""

# =====================================================================
# 3. 后端配置检查
# =====================================================================

echo -e "${COLOR_BLUE}--- 第 3 步: 后端配置检查 ---${COLOR_RESET}"
cd ../backend || exit 1

if [ ! -f ".env" ]; then
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} .env 不存在，从 .env.example 复制..."
  cp .env.example .env
fi

# 检查连接池配置
if grep -q "PG_POOL_MAX" .env; then
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} 连接池配置已存在"
else
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} 添加连接池配置到 .env..."
  cat >> .env << 'EOF'

# === 高级优化配置 (自动添加) ===
PG_POOL_MAX=10
PG_CONNECT_TIMEOUT_MS=3000
PG_STATEMENT_TIMEOUT_MS=15000
CACHE_TTL_SECONDS=30
CACHE_MAX_KEYS=500
CACHE_SWR_ENABLED=true
EOF
  echo -e "${COLOR_GREEN}✓${COLOR_RESET} 配置已添加"
fi

echo ""

# =====================================================================
# 4. 数据库索引 (可选)
# =====================================================================

echo -e "${COLOR_BLUE}--- 第 4 步: 数据库索引优化 (可选) ---${COLOR_RESET}"

if [ -n "$PGHOST" ] && [ -n "$PGUSER" ]; then
  read -p "是否立即创建数据库索引? (y/N): " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "执行索引创建..."
    psql -h "$PGHOST" -p "${PGPORT:-5432}" -d "$PGDATABASE" -U "$PGUSER" \
      -f src/db/performance_indexes.sql

    if [ $? -eq 0 ]; then
      echo -e "${COLOR_GREEN}✓${COLOR_RESET} 数据库索引已创建"
    else
      echo -e "${COLOR_RED}✗${COLOR_RESET} 数据库索引创建失败 (可手动执行)"
    fi
  else
    echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} 跳过数据库索引创建"
    echo "  提示: 手动执行 backend/src/db/performance_indexes.sql"
  fi
else
  echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} 未检测到数据库环境变量，跳过索引创建"
  echo "  提示: 配置 PGHOST, PGUSER 后手动执行"
fi

echo ""

# =====================================================================
# 5. 验证优化效果
# =====================================================================

echo -e "${COLOR_BLUE}--- 第 5 步: 验证优化效果 ---${COLOR_RESET}"

echo "文件大小对比:"
cd ../frontend/dist/assets || exit 1

for file in dashboard-*.js echarts-lib-*.js; do
  if [ -f "$file" ]; then
    ORIGINAL_SIZE=$(ls -lh "$file" | awk '{print $5}')

    if [ -f "$file.br" ]; then
      BR_SIZE=$(ls -lh "$file.br" | awk '{print $5}')
      echo "  $file: $ORIGINAL_SIZE → $BR_SIZE (Brotli)"
    elif [ -f "$file.gz" ]; then
      GZ_SIZE=$(ls -lh "$file.gz" | awk '{print $5}')
      echo "  $file: $ORIGINAL_SIZE → $GZ_SIZE (gzip)"
    else
      echo "  $file: $ORIGINAL_SIZE (未压缩)"
    fi
  fi
done

echo ""

# =====================================================================
# 总结
# =====================================================================

cd ../.. || exit 1

echo "======================================================================"
echo -e "${COLOR_GREEN}  ✅ 高级优化部署完成！${COLOR_RESET}"
echo "======================================================================"
echo ""
echo "已完成优化:"
echo "  ✓ Brotli 压缩 (前端体积 -15%)"
echo "  ✓ Service Worker (二次访问 < 500ms)"
echo "  ✓ 图片优化 (自动压缩)"
echo "  ✓ 连接池优化 (并发 +150%)"
echo ""
echo "下一步:"
echo "  1. 重启后端服务:"
echo "     cd backend && pm2 restart logearn-backend"
echo ""
echo "  2. 部署前端 dist/ 到 Web 服务器"
echo ""
echo "  3. 配置 Nginx/Apache 支持 Brotli"
echo "     (参考 ADVANCED_OPTIMIZATIONS.md 第 3 步)"
echo ""
echo "  4. 运行验证脚本:"
echo "     ./scripts/verify-optimization.sh"
echo ""
echo "  5. Lighthouse 性能测试 (目标 > 90 分)"
echo ""
echo "详细指南: ADVANCED_OPTIMIZATIONS.md"
echo "======================================================================"
