# 🌐 CDN 部署指南

**目标:** 全球用户延迟减少 50%, 带宽成本减少 70%  
**推荐:** Cloudflare (免费) 或阿里云 CDN  
**投入:** 2 小时

---

## 🎯 CDN 优化效果

### 当前架构
```
全球用户 → 单一源站（中国/美国） → 高延迟
          (RTT: 200-1000ms)
```

### CDN 架构
```
美国用户 → Cloudflare 洛杉矶节点 → 源站
  RTT: ~50ms (vs 800ms)

欧洲用户 → Cloudflare 法兰克福节点 → 源站
  RTT: ~60ms (vs 1200ms)

中国用户 → 阿里云 CDN 北京节点 → 源站
  RTT: ~30ms (vs 300ms)
```

---

## 📋 方案对比

| CDN 服务商 | 免费额度 | 全球覆盖 | 中国加速 | 配置难度 | 推荐度 |
|-----------|---------|---------|---------|---------|--------|
| **Cloudflare** | ✅ 无限 | ⭐⭐⭐⭐⭐ | ❌ 差 | 低 | ⭐⭐⭐⭐⭐ |
| **阿里云 CDN** | 10 GB/月 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 中 | ⭐⭐⭐⭐ |
| **腾讯云 CDN** | 10 GB/月 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 中 | ⭐⭐⭐⭐ |
| **AWS CloudFront** | 1 TB/年 | ⭐⭐⭐⭐⭐ | ⭐⭐ | 高 | ⭐⭐⭐ |

**推荐组合:** Cloudflare (全球) + 阿里云 CDN (中国)

---

## 🚀 方案 A: Cloudflare (推荐)

### 优点
- ✅ 完全免费
- ✅ 全球 300+ 节点
- ✅ 自动 HTTPS
- ✅ 自动 Brotli 压缩
- ✅ 免费 DDoS 防护
- ✅ 配置简单

### 缺点
- ❌ 中国大陆访问较慢（可加速域名走阿里云）

### 部署步骤

#### 1. 注册 Cloudflare 账号

访问 [cloudflare.com](https://dash.cloudflare.com/sign-up)，注册账号。

#### 2. 添加站点

```bash
# 在 Cloudflare Dashboard
1. 点击 "Add a Site"
2. 输入域名: analytics.logearn.com
3. 选择 "Free" 计划
4. 点击 "Continue"
```

#### 3. 更新 DNS

Cloudflare 会提供 2 个 Nameservers，例如：
```
nameserver1.cloudflare.com
nameserver2.cloudflare.com
```

在你的域名注册商（如 GoDaddy, Namecheap, 阿里云）处更新 Nameservers：

```bash
# 原 DNS 记录
analytics.logearn.com  A  47.88.123.45

# 更新为 Cloudflare Nameservers
# （保留原有 A 记录，在 Cloudflare Dashboard 添加）
```

#### 4. 配置 DNS 记录（在 Cloudflare）

```
类型  名称       值                  代理状态
A    analytics  47.88.123.45        ☁️ Proxied (已代理)
```

**重要:** 确保 "Proxy status" 是橙色云朵 ☁️（已代理），而不是灰色（仅 DNS）

#### 5. 启用优化功能

在 Cloudflare Dashboard → 你的站点 → Speed:

##### 5.1 Auto Minify
```
☑️ JavaScript
☑️ CSS
☑️ HTML
```

##### 5.2 Brotli
```
☑️ Enable Brotli compression
```

##### 5.3 Early Hints
```
☑️ Enable Early Hints
```

##### 5.4 Rocket Loader (可选)
```
☐ Rocket Loader (可能与 React 冲突，建议关闭)
```

#### 6. 配置缓存规则

在 Cloudflare Dashboard → 你的站点 → Rules → Page Rules:

##### 规则 1: 静态资源长缓存
```
URL: analytics.logearn.com/assets/*

设置:
  Cache Level: Cache Everything
  Edge Cache TTL: 1 year
  Browser Cache TTL: 1 year
```

##### 规则 2: HTML 短缓存
```
URL: analytics.logearn.com/*.html

设置:
  Cache Level: Cache Everything
  Edge Cache TTL: 5 minutes
  Browser Cache TTL: 5 minutes
```

##### 规则 3: API 不缓存
```
URL: analytics.logearn.com/api/*

设置:
  Cache Level: Bypass
```

#### 7. 启用 HTTP/3 和 0-RTT

在 Network 标签:
```
☑️ HTTP/3 (with QUIC)
☑️ 0-RTT Connection Resumption
☑️ WebSockets
```

#### 8. 配置 SSL/TLS

在 SSL/TLS 标签:
```
Encryption mode: Full (strict)
☑️ Always Use HTTPS
☑️ Automatic HTTPS Rewrites
Minimum TLS Version: TLS 1.2
```

#### 9. 验证 CDN 生效

```bash
# 检查响应头
curl -I https://analytics.logearn.com

# 应该看到:
# server: cloudflare
# cf-ray: 8a1b2c3d4e5f6789-LAX
# cf-cache-status: HIT
```

```bash
# 测试不同地区延迟
# 使用 https://www.webpagetest.org/
# 选择 Multiple Locations
# 对比优化前后
```

---

## 🇨🇳 方案 B: 阿里云 CDN (中国加速)

### 适用场景
- 主要用户在中国大陆
- 需要 ICP 备案
- 对延迟要求极高

### 部署步骤

#### 1. 开通 CDN 服务

登录阿里云控制台 → CDN → 立即开通

#### 2. 添加加速域名

```
加速域名: analytics.logearn.com
业务类型: 图片小文件
源站类型: IP
源站地址: 47.88.123.45
端口: 80 或 443
```

#### 3. 配置 CNAME

阿里云会分配一个 CNAME:
```
analytics.logearn.com.w.kunlunaq.com
```

在 DNS 处添加 CNAME 记录:
```
analytics  CNAME  analytics.logearn.com.w.kunlunaq.com
```

#### 4. 配置缓存策略

在 CDN 控制台 → 域名管理 → 缓存配置:

```
目录/文件     缓存时间    权重
/assets/*     1 年        90
*.js          1 年        90
*.css         1 年        90
*.png|jpg     1 年        90
*.html        5 分钟      80
/api/*        不缓存      100
```

#### 5. 启用 Brotli 压缩

在 性能优化 → 页面优化:
```
☑️ 智能压缩 (Brotli/gzip)
```

#### 6. 配置 HTTPS

在 HTTPS 配置:
```
☑️ 启用 HTTPS
证书来源: 免费证书 或 上传自有证书
强制跳转: HTTP → HTTPS
TLS 版本: TLS 1.2 及以上
```

#### 7. 刷新预热

首次部署后:
```bash
# 在 CDN 控制台 → 刷新预热
# 刷新: /assets/*
# 预热: /index.html, /assets/dashboard-*.js
```

---

## 🔥 方案 C: 混合 CDN (最优)

### 架构设计

```
全球用户 (非中国) → Cloudflare → 源站
中国用户 → 阿里云 CDN → 源站
```

### 实现方式

#### 方法 1: 地理 DNS (GeoDNS)

使用 DNSPod 或 Cloudflare Load Balancer:

```
analytics.logearn.com
  ├─ 默认: cloudflare-proxy.example.com (Cloudflare)
  └─ 中国: aliyun-cdn.example.com (阿里云 CDN)
```

#### 方法 2: 双域名

```
全球访问: analytics.logearn.com (Cloudflare)
中国访问: analytics-cn.logearn.com (阿里云 CDN)
```

前端自动检测:
```javascript
const isChinaMainland = /cn|china/.test(navigator.language) ||
  Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Shanghai'

const apiBase = isChinaMainland
  ? 'https://analytics-cn.logearn.com'
  : 'https://analytics.logearn.com'
```

---

## ✅ 验证 CDN 效果

### 1. 缓存命中率

```bash
# Cloudflare Analytics
https://dash.cloudflare.com/YOUR_ACCOUNT/analytics

# 目标: Cache Hit Ratio > 85%
```

### 2. 全球延迟测试

使用 [webpagetest.org](https://www.webpagetest.org/):

```
测试地点:
  - 美国 (Dulles, VA)
  - 欧洲 (London, UK)
  - 亚洲 (Tokyo, Japan)
  - 中国 (Beijing, China - 阿里云 CDN)

指标对比:
  - TTFB (Time to First Byte)
  - First Contentful Paint
  - Largest Contentful Paint
```

**目标:**
- TTFB < 200ms (全球)
- FCP < 1s
- LCP < 2s

### 3. 带宽节省

```bash
# Cloudflare Analytics → Bandwidth Saved
# 应该看到 Brotli 节省 15-30% 流量
```

---

## 🔧 故障排查

### 问题 1: CDN 不生效

```bash
# 检查 DNS 解析
dig analytics.logearn.com

# 应该看到 Cloudflare IP (如 104.16.x.x)
# 或阿里云 CDN CNAME
```

### 问题 2: 缓存未命中

```bash
# 检查响应头
curl -I https://analytics.logearn.com/assets/dashboard-*.js

# Cloudflare:
# cf-cache-status: HIT (已缓存)
# cf-cache-status: MISS (未缓存)
# cf-cache-status: EXPIRED (已过期)

# 阿里云 CDN:
# x-cache: HIT from cn-beijing
```

### 问题 3: Brotli 未启用

```bash
curl -H "Accept-Encoding: br" -I https://analytics.logearn.com/assets/dashboard-*.js

# 应该看到:
# content-encoding: br
```

如果没有，检查：
- Cloudflare: Speed → Optimization → Brotli
- 阿里云: 性能优化 → 智能压缩

### 问题 4: HTTPS 证书错误

```bash
# Cloudflare:
# SSL/TLS → Edge Certificates → 检查状态

# 阿里云:
# HTTPS 配置 → 检查证书有效期
```

---

## 💰 成本估算

### Cloudflare (免费)
```
流量: 无限制 ✅
请求数: 无限制 ✅
带宽: 无限制 ✅
HTTPS: 免费 ✅
DDoS 防护: 免费 ✅

月费用: $0
```

### 阿里云 CDN
```
流量费用:
  - 中国大陆: ¥0.24/GB
  - 海外: ¥0.45/GB

预估月流量: 100 GB (小型项目)
月费用: ¥24-45

免费额度: 10 GB/月
```

### 推荐配置 (混合)
```
Cloudflare (全球) + 阿里云 CDN (中国 100GB)
月费用: ~¥24
```

---

## 📊 性能提升预期

| 指标 | 无 CDN | Cloudflare | 阿里云 CDN | 混合 CDN |
|------|--------|-----------|-----------|---------|
| **全球 TTFB** | 800ms | **150ms** | 300ms | **120ms** |
| **中国 TTFB** | 300ms | 250ms | **80ms** | **80ms** |
| **美国 TTFB** | 600ms | **100ms** | 400ms | **100ms** |
| **带宽成本** | $100 | **$0** | $30 | **$30** |
| **缓存命中率** | 0% | **85%** | **90%** | **90%** |

---

## 🎯 实施建议

### 第 1 天: Cloudflare 基础部署 (2 小时)
1. 注册 Cloudflare
2. 添加域名
3. 配置 DNS
4. 启用基础优化
5. 验证效果

### 第 2 天: 高级优化 (1 小时)
1. 配置缓存规则
2. 启用 HTTP/3
3. 调优 SSL/TLS
4. 全球延迟测试

### 第 3 天: 中国加速 (可选, 2 小时)
1. 开通阿里云 CDN
2. 配置缓存策略
3. 配置混合 DNS
4. 对比测试

---

## 📚 相关资源

- [Cloudflare Speed Guide](https://www.cloudflare.com/learning/performance/)
- [阿里云 CDN 文档](https://help.aliyun.com/product/27099.html)
- [WebPageTest](https://www.webpagetest.org/)
- [Pingdom Speed Test](https://tools.pingdom.com/)

---

**立即开始:** 先部署 Cloudflare (免费 + 2 小时)，效果不满意再考虑混合方案。

**预期效果:** 全球延迟减少 50-70%，Lighthouse Performance +5-10 分
