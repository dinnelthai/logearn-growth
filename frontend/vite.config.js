import { defineConfig } from 'vite'
import viteCompression from 'vite-plugin-compression'
import viteImagemin from 'vite-plugin-imagemin'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // PWA / Service Worker (离线缓存 + 二次访问 < 500ms)
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Logearn Growth Analytics',
        short_name: 'Logearn',
        description: '增长分析系统 - 用户行为分析与增长诊断',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // 运行时缓存策略
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 分钟
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 天
              },
            },
          },
        ],
      },
    }),
    // 图片优化 (PNG/JPG/SVG 自动压缩)
    viteImagemin({
      gifsicle: { optimizationLevel: 7 },
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 80 },
      pngquant: { quality: [0.8, 0.9], speed: 4 },
      svgo: {
        plugins: [
          { name: 'removeViewBox', active: false },
          { name: 'removeEmptyAttrs', active: false },
        ],
      },
    }),
    // Brotli 压缩 (比 gzip 再压缩 15-20%)
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240, // 10KB 以上才压缩
      algorithm: 'brotliCompress',
      ext: '.br',
      deleteOriginFile: false,
    }),
    // gzip 压缩 (兼容旧浏览器)
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      algorithm: 'gzip',
      ext: '.gz',
      deleteOriginFile: false,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ECharts 相关单独打包
          if (id.includes('echarts')) {
            if (id.includes('echarts/core')) return 'echarts-core'
            if (id.includes('echarts/charts')) return 'echarts-charts'
            if (id.includes('echarts/components')) return 'echarts-components'
            if (id.includes('echarts/renderers')) return 'echarts-renderers'
            return 'echarts-lib'
          }

          // Floating UI 单独打包
          if (id.includes('@floating-ui')) {
            return 'floating-ui'
          }

          // 页面按模块分组
          if (id.includes('/pages/')) {
            const match = id.match(/\/pages\/([^/]+)\.js/)
            if (match) return `page-${match[1]}`
          }

          // Analytics 核心模块
          if (id.includes('/analytics/') && !id.includes('__tests__')) {
            if (id.includes('funnelAgg')) return 'analytics-funnel'
            if (id.includes('retentionAgg')) return 'analytics-retention'
            if (id.includes('referralAgg')) return 'analytics-referral'
            if (id.includes('pathsAgg')) return 'analytics-paths'
            if (id.includes('northStarAgg')) return 'analytics-northstar'
            if (id.includes('tradeMonitorAgg')) return 'analytics-trade'
            return 'analytics-core'
          }
        },
      },
    },
    chunkSizeWarningLimit: 300,
    sourcemap: false, // 生产环境禁用 sourcemap
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 移除 console.log
        drop_debugger: true,
      },
    },
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
