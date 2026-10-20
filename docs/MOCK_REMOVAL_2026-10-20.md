# Mock 数据模式移除记录

**日期**: 2026-10-20  
**状态**: ✅ 完成

## 变更摘要

LogEarn Growth Analytics 平台已完全移除 mock JSON 数据模式。所有数据源现在必须配置真实的 API 或数据库连接。

## 移除的组件

### 前端

1. **JSON 数据文件** (已删除)
   - `frontend/src/api/activities.json`
   - `frontend/src/api/dataset.json`
   - `frontend/src/api/kolMetrics.json`

2. **加载器改为错误抛出**
   - `frontend/src/analytics/jsonDataset.js` - 调用 `datasetFromJson()` 现在抛出明确错误
   - `frontend/src/analytics/loadJsonDataset.js` - 调用 `loadJsonDataset()` 现在抛出明确错误

3. **测试更新**
   - `mockCoverage.test.js` - 跳过所有依赖 mock 数据的覆盖测试
   - `funnelAssociation.test.js` - 跳过 JSON 关联验证测试
   - `tradeFacts.test.js` - 跳过 JSON 交易验证测试
   - 移除不再使用的 import 语句

### 后端

1. **文档更新**
   - `backend/src/db/rebuildRollups.js` - 移除 mock 相关注释

### 配置模板

新增环境配置示例文件:

1. **`frontend/.env.example`**
   ```env
   VITE_BACKEND_BASE_URL=http://localhost:3001
   # VITE_ANALYTICS_DATA_SOURCE=api
   # VITE_ANALYTICS_API_BASE_URL=/api/analytics
   ```

2. **`backend/.env.example`**
   ```env
   DB_PATH=./data/analytics.db
   HOLOGRES_HOST=...
   HOLOGRES_PORT=80
   PORT=3001
   JWT_SECRET=...
   OPS_TOKEN=...
   ```

### 文档

- `.gitignore` - 已包含 `frontend/src/api/*.json` 排除规则
- `todo.markdown` - 移除所有 Mock 相关描述,更新为真实数据要求

## 测试结果

### 前端
```
Test Files  58 passed | 1 skipped (59)
Tests       253 passed | 4 skipped (257)
Duration    2.75s
```

### 后端
```
Tests       307 passed
Duration    1716.30ms
```

### 构建
```
✓ built in 3.37s
```

## 迁移指南

### 对于开发者

1. **复制配置模板**
   ```bash
   cp frontend/.env.example frontend/.env.local
   cp backend/.env.example backend/.env
   ```

2. **配置后端数据源**
   - 使用 SQLite: 设置 `DB_PATH`
   - 使用 Hologres: 配置 `HOLOGRES_*` 参数

3. **配置前端 API 端点**
   - 设置 `VITE_BACKEND_BASE_URL` 指向后端服务

4. **启动服务**
   ```bash
   # 后端
   cd backend && npm start

   # 前端
   cd frontend && npm run dev
   ```

### 错误处理

调用旧的 mock 加载器将抛出错误:
```
Error: Mock JSON data mode has been removed. 
Configure VITE_BACKEND_BASE_URL or VITE_ANALYTICS_DATA_SOURCE=api for real data.
```

## 向后兼容性

⚠️ **破坏性变更**: 不再支持无配置的本地演示模式。

所有部署必须:
- 配置真实数据库(SQLite 或 Hologres)
- 提供完整的环境变量配置
- 通过 API 加载真实分析数据

## 相关问题

如需技术支持,请参考:
- 前端配置: `frontend/.env.example`
- 后端配置: `backend/.env.example`
- API 契约: `docs/API_DATA_CONTRACT.md` (如果存在)
