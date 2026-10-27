> 历史说明：本文的接口、完成标记和启动方式可能过时。当前实现与限制请以 [docs/ai/README.md](README.md) 为准。

# AI 业务分析 API 使用指南

## 概述

用户主动触发的业务分析系统，支持：
1. **主动分析**：用户选择时间范围和业务范围，触发 AI 分析并获得建议
2. **记录行动**：用户标记建议的状态（采纳/执行/拒绝）
3. **主动复盘**：用户选择已执行的建议，触发效果复盘
4. **历史学习**：下次分析会使用相关历史经验

## 核心流程

```
用户选择范围 → 触发分析 → 查看建议 → 记录行动 → 主动复盘 → 下次分析使用历史
```

## API 端点

### 1. 创建分析任务

**POST /api/ai-analysis/analyze**

用户从业务页面选择时间范围、业务范围后，调用此接口创建分析任务。

**请求体：**
```json
{
  "title": "十月激活分析",
  "analysisType": "optimization",
  "dateRangeStart": 1696089600000,
  "dateRangeEnd": 1698681600000,
  "businessScope": {
    "source": "all",
    "channels": ["telegram", "twitter"],
    "cohorts": []
  },
  "userQuestion": "如何提升新用户的激活率？",
  "focusGoal": "activation"
}
```

**参数说明：**
- `title`: 分析标题（必填）
- `analysisType`: 分析类型，`anomaly`（异常检测）/ `optimization`（常态优化）/ `retrospective`（历史复盘）
- `dateRangeStart`, `dateRangeEnd`: Unix 时间戳（毫秒），必填
- `businessScope`: 业务范围筛选
  - `source`: 数据来源，默认 `"all"`
  - `channels`: 渠道列表
  - `cohorts`: 用户群
- `userQuestion`: 可选的具体问题
- `focusGoal`: 关注目标，`activation` / `retention` / `conversion` / `revenue`

**响应：**
```json
{
  "analysisId": "uuid",
  "jobId": "123",
  "status": "pending",
  "message": "Analysis task created successfully"
}
```

### 2. 轮询任务状态

**GET /api/ai-analysis/jobs/:jobId/status**

创建任务后，前端通过轮询查询任务进度和结果。

**响应（处理中）：**
```json
{
  "jobId": "123",
  "state": "active",
  "progress": 65,
  "result": null,
  "error": null,
  "attempts": 1,
  "maxAttempts": 3
}
```

**响应（完成）：**
```json
{
  "jobId": "123",
  "state": "completed",
  "progress": 100,
  "result": {
    "analysisId": "uuid",
    "status": "completed",
    "summary": "核心发现摘要",
    "suggestionsCount": 5,
    "duration": 12345,
    "cost": 0.05
  },
  "error": null,
  "attempts": 1,
  "maxAttempts": 3
}
```

**state 可能的值：**
- `waiting`: 等待执行
- `active`: 处理中
- `completed`: 完成
- `failed`: 失败

**前端轮询示例：**
```javascript
async function pollJobStatus(jobId) {
  const maxAttempts = 60; // 最多轮询 60 次
  const interval = 2000; // 每 2 秒轮询一次

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`/api/ai-analysis/jobs/${jobId}/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const status = await response.json();

    if (status.state === 'completed') {
      return status.result;
    }

    if (status.state === 'failed') {
      throw new Error(status.error || 'Analysis failed');
    }

    // 更新进度条
    updateProgress(status.progress);

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Analysis timeout');
}
```

### 3. 获取分析详情

**GET /api/ai-analysis/:id**

任务完成后，获取完整的分析结果和建议列表。

**响应：**
```json
{
  "id": "analysis-uuid",
  "owner_id": "user-id",
  "title": "十月激活分析",
  "analysis_type": "optimization",
  "date_range_start": 1696089600000,
  "date_range_end": 1698681600000,
  "status": "completed",
  "result": {
    "summary": "核心发现摘要",
    "keyFindings": [
      "发现1",
      "发现2"
    ],
    "suggestionsCount": 5
  },
  "created_at": 1698681600000,
  "completed_at": 1698682800000,
  "cost_usd": 0.05,
  "suggestions": [
    {
      "id": "suggestion-uuid",
      "business_problem": "新用户7日留存率偏低",
      "data_evidence": {
        "metrics": ["7日留存率: 15%，低于行业平均25%"],
        "dataPoints": ["过去30天新增500用户，只有75人在第7天回访"]
      },
      "hypothesis": "可能是首次体验不够清晰，用户不知道下一步做什么",
      "uncertainties": [
        "未调查过用户流失原因",
        "缺少首次会话的行为数据"
      ],
      "action": "在用户首次登录后，增加引导任务系统，分3步引导完成核心功能",
      "priority": "P0",
      "priority_reason": "留存直接影响长期增长，且实施成本不高",
      "applicable_scope": {
        "targetUsers": "新注册用户",
        "timeframe": "立即执行，2周内完成"
      },
      "expected_impact": "预计7日留存率提升5-10个百分点",
      "impact_basis": "参考同类产品引导任务后的留存提升数据",
      "validation_metrics": {
        "primary": "7日留存率",
        "secondary": ["引导任务完成率", "首日活跃时长"]
      },
      "review_conditions": [
        "执行2周后复盘",
        "需要至少500个新用户样本"
      ],
      "user_status": "pending",
      "created_at": 1698682800000
    }
  ]
}
```

### 4. 获取分析列表

**GET /api/ai-analysis/list?limit=20&offset=0&status=completed**

用户历史分析记录列表。

**查询参数：**
- `limit`: 每页数量，默认 20
- `offset`: 偏移量，默认 0
- `status`: 可选，筛选状态 `pending` / `processing` / `completed` / `failed`

**响应：**
```json
{
  "records": [
    {
      "id": "uuid",
      "title": "十月激活分析",
      "analysis_type": "optimization",
      "status": "completed",
      "date_range_start": 1696089600000,
      "date_range_end": 1698681600000,
      "created_at": 1698681600000,
      "completed_at": 1698682800000,
      "suggestion_count": 5,
      "executed_count": 2,
      "retrospective_count": 1,
      "cost_usd": 0.05
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

### 5. 更新建议状态

**PUT /api/ai-analysis/suggestions/:id/status**

用户标记建议的状态：是否采纳、是否执行、执行了什么。

**请求体（采纳）：**
```json
{
  "userStatus": "adopted"
}
```

**请求体（执行）：**
```json
{
  "userStatus": "executed",
  "actualAction": "已上线引导任务，包含3个步骤：绑定钱包、完成首次分析、分享策略",
  "actionScope": {
    "targetUsers": "新注册用户",
    "startDate": 1698768000000
  },
  "executedAt": 1698768000000
}
```

**请求体（拒绝）：**
```json
{
  "userStatus": "rejected",
  "rejectionReason": "开发资源不足，优先级调整到下个季度"
}
```

**userStatus 可选值：**
- `pending`: 待处理
- `adopted`: 已采纳（准备执行）
- `executing`: 执行中
- `executed`: 已执行（可以复盘）
- `rejected`: 已拒绝
- `invalid`: 已失效

**响应：**
```json
{
  "id": "suggestion-uuid",
  "user_status": "executed",
  "actual_action": "...",
  "executed_at": 1698768000000,
  "updated_at": 1698768000000
}
```

### 6. 触发复盘分析

**POST /api/ai-analysis/suggestions/:id/retrospective**

用户对已执行的建议发起复盘，评估实际效果。

**前提条件：**
- 建议状态必须是 `executed`
- 执行后至少观察 3 天

**响应：**
```json
{
  "retrospectiveId": "uuid",
  "jobId": "456",
  "status": "pending",
  "message": "Retrospective analysis started"
}
```

**轮询复盘任务状态：**
同样使用 `/api/ai-analysis/jobs/:jobId/status` 轮询。

### 7. 获取复盘记录列表

**GET /api/ai-analysis/retrospectives/list?limit=20**

**响应：**
```json
{
  "retrospectives": [
    {
      "id": "retrospective-uuid",
      "suggestion_id": "suggestion-uuid",
      "business_problem": "新用户7日留存率偏低",
      "action": "增加引导任务系统",
      "has_improvement": true,
      "has_causality": true,
      "confidence": "medium",
      "conclusion": "7日留存率从15%提升到22%，提升显著。但同期有营销活动，可能有一定影响。建议继续观察一个月。",
      "created_at": 1699977600000,
      "analysis_title": "十月激活分析"
    }
  ],
  "count": 1
}
```

### 8. 获取建议列表

**GET /api/ai-analysis/suggestions/list?status=executed&limit=50**

跨分析的建议列表，支持按状态筛选。

**查询参数：**
- `status`: 可选，筛选状态
- `limit`: 每页数量
- `offset`: 偏移量

### 9. 获取成本统计

**GET /api/ai-analysis/cost-stats?startTime=xxx&endTime=yyy**

查询用户的 AI 使用成本统计。

**响应：**
```json
{
  "total_calls": 25,
  "total_cost": 1.25,
  "total_tokens": 150000,
  "avg_duration_ms": 3500,
  "cache_hits": 8
}
```

## 集成示例

### React 前端集成

```typescript
// 1. 创建分析
async function createAnalysis(params: AnalysisParams) {
  const response = await fetch('/api/ai-analysis/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify(params)
  });

  const { analysisId, jobId } = await response.json();

  // 2. 轮询状态
  const result = await pollJobStatus(jobId);

  // 3. 获取完整结果
  const analysis = await fetch(`/api/ai-analysis/${analysisId}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  }).then(r => r.json());

  return analysis;
}

// 4. 标记建议为已执行
async function markAsExecuted(suggestionId: string, action: string) {
  await fetch(`/api/ai-analysis/suggestions/${suggestionId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
      userStatus: 'executed',
      actualAction: action,
      executedAt: Date.now()
    })
  });
}

// 5. 触发复盘
async function startRetrospective(suggestionId: string) {
  const response = await fetch(
    `/api/ai-analysis/suggestions/${suggestionId}/retrospective`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    }
  );

  const { jobId } = await response.json();
  const result = await pollJobStatus(jobId);

  return result;
}
```

## 错误处理

所有接口都遵循统一的错误响应格式：

```json
{
  "error": "错误类型",
  "message": "详细错误信息"
}
```

**常见错误：**
- `401 Unauthorized`: 未登录或 token 过期
- `403 Access denied`: 访问其他用户的数据
- `404 Not found`: 资源不存在
- `400 Bad request`: 参数错误
- `500 Internal server error`: 服务器错误

## 最佳实践

1. **轮询间隔**：建议 2-5 秒，避免过于频繁
2. **超时处理**：设置最大轮询次数（如 60 次 = 2 分钟），超时后提示用户刷新
3. **离开页面**：用户离开页面后停止轮询，可在返回时从分析列表重新进入
4. **错误重试**：失败后提供重试按钮，使用相同参数重新创建分析
5. **成本提示**：分析开始前，提示预估成本（约 $0.03-0.10）
6. **建议状态流转**：
   - 用户看到建议 → `pending`
   - 决定采纳 → `adopted`
   - 开始执行 → `executing`
   - 执行完成 → `executed`（记录实际行动）
   - 复盘 → 创建复盘任务
   - 不采纳 → `rejected`（记录原因）

## 权限控制

所有接口都需要认证（`requireAuth` 中间件），并且：
- 用户只能访问自己创建的分析记录
- 用户只能更新自己的建议状态
- 任务状态查询会验证所有者

## 后续扩展

后续版本可能支持：
- 向量检索历史经验（当前是简单文本匹配）
- 深入调查（按需查询更多维度数据）
- 实时推送（WebSocket，当前优先使用轮询）
- 自动复盘提醒（建议执行 N 天后提醒用户复盘）
