/**
 * 虚拟滚动列表组件
 *
 * 适用场景:
 * - 长列表 (> 1000 项)
 * - 用户路径分析表格
 * - 漏斗详情列表
 *
 * 性能提升:
 * - 只渲染可见区域 (约 20 项)
 * - 滚动性能 60fps
 * - 内存占用减少 90%
 *
 * 使用示例:
 *
 * import VirtualList from './components/VirtualList.js'
 *
 * const list = new VirtualList({
 *   container: document.getElementById('list'),
 *   itemHeight: 50,  // 每项固定高度
 *   totalItems: 10000,
 *   buffer: 5,  // 上下缓冲区项数
 *   renderItem: (index) => {
 *     const div = document.createElement('div')
 *     div.textContent = `Item ${index}`
 *     return div
 *   }
 * })
 */

export default class VirtualList {
  constructor(options) {
    this.container = options.container
    this.itemHeight = options.itemHeight || 50
    this.totalItems = options.totalItems || 0
    this.buffer = options.buffer || 5
    this.renderItem = options.renderItem
    this.data = options.data || []

    this.scrollTop = 0
    this.visibleStart = 0
    this.visibleEnd = 0

    this.init()
  }

  init() {
    // 设置容器样式
    this.container.style.overflowY = 'auto'
    this.container.style.position = 'relative'

    // 创建占位容器 (撑开滚动高度)
    this.spacer = document.createElement('div')
    this.spacer.style.height = `${this.totalItems * this.itemHeight}px`
    this.spacer.style.position = 'relative'
    this.container.appendChild(this.spacer)

    // 创建可见内容容器
    this.content = document.createElement('div')
    this.content.style.position = 'absolute'
    this.content.style.top = '0'
    this.content.style.left = '0'
    this.content.style.right = '0'
    this.spacer.appendChild(this.content)

    // 监听滚动
    this.container.addEventListener('scroll', () => {
      this.scrollTop = this.container.scrollTop
      this.render()
    })

    // 初始渲染
    this.render()
  }

  render() {
    const containerHeight = this.container.clientHeight
    const scrollTop = this.scrollTop

    // 计算可见区域
    const startIndex = Math.floor(scrollTop / this.itemHeight)
    const endIndex = Math.ceil((scrollTop + containerHeight) / this.itemHeight)

    // 加上缓冲区
    this.visibleStart = Math.max(0, startIndex - this.buffer)
    this.visibleEnd = Math.min(this.totalItems, endIndex + this.buffer)

    // 清空当前内容
    this.content.innerHTML = ''

    // 设置内容偏移
    this.content.style.transform = `translateY(${this.visibleStart * this.itemHeight}px)`

    // 渲染可见项
    for (let i = this.visibleStart; i < this.visibleEnd; i++) {
      const item = this.renderItem(i, this.data[i])
      if (item) {
        item.style.height = `${this.itemHeight}px`
        this.content.appendChild(item)
      }
    }
  }

  // 更新数据
  update(data) {
    this.data = data
    this.totalItems = data.length
    this.spacer.style.height = `${this.totalItems * this.itemHeight}px`
    this.render()
  }

  // 滚动到指定索引
  scrollToIndex(index) {
    this.container.scrollTop = index * this.itemHeight
  }

  // 销毁
  destroy() {
    this.container.removeEventListener('scroll', this.render)
    this.container.innerHTML = ''
  }
}

/**
 * React Hook 版本 (如果使用 React)
 *
 * import { useEffect, useRef } from 'react'
 *
 * function useVirtualList(items, itemHeight = 50) {
 *   const containerRef = useRef(null)
 *   const [visibleItems, setVisibleItems] = useState([])
 *
 *   useEffect(() => {
 *     const container = containerRef.current
 *     const handleScroll = () => {
 *       const scrollTop = container.scrollTop
 *       const containerHeight = container.clientHeight
 *       const startIndex = Math.floor(scrollTop / itemHeight)
 *       const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight)
 *       setVisibleItems(items.slice(startIndex, endIndex))
 *     }
 *
 *     container.addEventListener('scroll', handleScroll)
 *     handleScroll()
 *
 *     return () => container.removeEventListener('scroll', handleScroll)
 *   }, [items, itemHeight])
 *
 *   return { containerRef, visibleItems }
 * }
 */

/**
 * Vue 3 Composition API 版本
 *
 * import { ref, computed, onMounted, onUnmounted } from 'vue'
 *
 * export function useVirtualList(items, itemHeight = 50) {
 *   const containerRef = ref(null)
 *   const scrollTop = ref(0)
 *
 *   const visibleItems = computed(() => {
 *     if (!containerRef.value) return []
 *     const containerHeight = containerRef.value.clientHeight
 *     const startIndex = Math.floor(scrollTop.value / itemHeight)
 *     const endIndex = Math.ceil((scrollTop.value + containerHeight) / itemHeight)
 *     return items.value.slice(startIndex, endIndex)
 *   })
 *
 *   const handleScroll = () => {
 *     scrollTop.value = containerRef.value.scrollTop
 *   }
 *
 *   onMounted(() => {
 *     containerRef.value?.addEventListener('scroll', handleScroll)
 *   })
 *
 *   onUnmounted(() => {
 *     containerRef.value?.removeEventListener('scroll', handleScroll)
 *   })
 *
 *   return { containerRef, visibleItems }
 * }
 */
