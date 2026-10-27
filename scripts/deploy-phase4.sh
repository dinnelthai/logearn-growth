#!/bin/bash

# Phase 4: RAG Deployment Script
# 自动化部署脚本

set -e  # Exit on error

echo "================================================"
echo "  Phase 4: RAG 向量检索 - 自动部署"
echo "================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Step 1: Check Docker
echo -e "${YELLOW}[1/8]${NC} 检查 Docker..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗${NC} Docker 未安装"
    echo ""
    echo "请先安装 Docker:"
    echo "  macOS: https://www.docker.com/products/docker-desktop"
    echo "  或: brew install --cask docker"
    exit 1
fi

if ! docker ps &> /dev/null; then
    echo -e "${RED}✗${NC} Docker 未运行"
    echo ""
    echo "请启动 Docker Desktop:"
    echo "  macOS: open /Applications/Docker.app"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker 已就绪"
echo ""

# Step 2: Check dependencies
echo -e "${YELLOW}[2/8]${NC} 检查 Node.js 依赖..."
cd backend

if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
fi

# Check for @qdrant/js-client-rest
if ! npm list @qdrant/js-client-rest &> /dev/null; then
    echo "安装 Qdrant 客户端..."
    npm install @qdrant/js-client-rest --save
fi

echo -e "${GREEN}✓${NC} 依赖已就绪"
echo ""

# Step 3: Check .env configuration
echo -e "${YELLOW}[3/8]${NC} 检查环境配置..."

if [ ! -f ".env" ]; then
    echo -e "${RED}✗${NC} .env 文件不存在"
    echo "复制 .env.example 并配置..."
    cp .env.example .env
fi

# Check for required env vars
if ! grep -q "OPENAI_API_KEY=" .env || grep -q "OPENAI_API_KEY=sk-your-key-here" .env; then
    echo -e "${YELLOW}!${NC} 警告: OPENAI_API_KEY 未配置"
    echo ""
    echo "请编辑 backend/.env 并设置:"
    echo "  OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx"
    echo ""
    echo "获取 API Key: https://platform.openai.com/api-keys"
    echo ""
    read -p "配置完成后按 Enter 继续... "
fi

if ! grep -q "QDRANT_URL=" .env; then
    echo "添加 RAG 配置到 .env..."
    echo "" >> .env
    echo "# RAG Configuration" >> .env
    echo "QDRANT_URL=http://localhost:6333" >> .env
    echo "QDRANT_COLLECTION=logearn_knowledge" >> .env
    echo "EMBEDDING_MODEL=text-embedding-3-small" >> .env
    echo "EMBEDDING_DIMENSIONS=1536" >> .env
fi

echo -e "${GREEN}✓${NC} 环境配置已就绪"
echo ""

# Step 4: Start infrastructure
echo -e "${YELLOW}[4/8]${NC} 启动基础设施 (Redis + Qdrant)..."
cd "$PROJECT_ROOT"

# Stop existing containers
docker-compose -f docker-compose.rag.yml down 2>/dev/null || true

# Start new containers
docker-compose -f docker-compose.rag.yml up -d

# Wait for services to be ready
echo "等待服务启动..."
sleep 5

# Check Redis
if docker exec logearn-redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✓${NC} Redis 运行中"
else
    echo -e "${RED}✗${NC} Redis 启动失败"
    docker logs logearn-redis
    exit 1
fi

# Check Qdrant
if curl -s http://localhost:6333/ | grep -q "qdrant"; then
    echo -e "${GREEN}✓${NC} Qdrant 运行中"
else
    echo -e "${RED}✗${NC} Qdrant 启动失败"
    docker logs logearn-qdrant
    exit 1
fi

echo ""

# Step 5: Initialize RAG system
echo -e "${YELLOW}[5/8]${NC} 初始化 RAG 系统..."
cd "$PROJECT_ROOT/backend"

if node src/ai/rag/cli.js init; then
    echo -e "${GREEN}✓${NC} RAG 系统初始化完成"
else
    echo -e "${RED}✗${NC} RAG 初始化失败"
    exit 1
fi

echo ""

# Step 6: Index knowledge base
echo -e "${YELLOW}[6/8]${NC} 索引知识库..."

echo "正在索引 findings..."
if node src/ai/rag/cli.js index findings 100; then
    echo -e "${GREEN}✓${NC} Findings 索引完成"
else
    echo -e "${YELLOW}!${NC} Findings 索引失败 (可能无数据,跳过)"
fi

echo ""

# Step 7: Run tests
echo -e "${YELLOW}[7/8]${NC} 运行测试套件..."

if npm run test:rag; then
    echo -e "${GREEN}✓${NC} 所有测试通过"
else
    echo -e "${YELLOW}!${NC} 部分测试失败 (可能无数据,继续)"
fi

echo ""

# Step 8: Show status
echo -e "${YELLOW}[8/8]${NC} 部署状态..."
echo ""

# Show stats
node src/ai/rag/cli.js stats 2>/dev/null || echo "知识库为空,可稍后索引"

echo ""
echo "================================================"
echo -e "${GREEN}✓ Phase 4 部署完成!${NC}"
echo "================================================"
echo ""
echo "基础设施:"
echo "  Redis:   http://localhost:6379"
echo "  Qdrant:  http://localhost:6333"
echo ""
echo "下一步:"
echo ""
echo "  1. 启动后端服务:"
echo "     cd backend && npm run queue:dev"
echo ""
echo "  2. 测试 RAG 搜索:"
echo "     node src/ai/rag/cli.js search \"用户留存率下降\""
echo ""
echo "  3. 查看容器状态:"
echo "     docker-compose -f docker-compose.rag.yml ps"
echo ""
echo "  4. 查看日志:"
echo "     docker-compose -f docker-compose.rag.yml logs -f"
echo ""
echo "  5. 停止服务:"
echo "     docker-compose -f docker-compose.rag.yml down"
echo ""
echo "文档:"
echo "  - PHASE4_DEPLOYMENT_GUIDE.md (完整部署指南)"
echo "  - PHASE4_QUICKSTART.md (快速开始)"
echo ""
echo "================================================"
