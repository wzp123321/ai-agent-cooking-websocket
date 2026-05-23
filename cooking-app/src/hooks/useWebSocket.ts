/**
 * ============================================================
 * useWebSocket — 通用 WebSocket Hook
 * ============================================================
 *
 * 功能：
 *   封装 WebSocket 连接管理，提供稳定的双向通信能力
 *   支持自动重连、心跳检测、消息序列化/反序列化
 *
 * 特点：
 *   ✅ 完全独立，不依赖任何项目特定代码
 *   ✅ 开箱即用，传入 URL 即可连接
 *   ✅ 自动重连（指数退避策略）
 *   ✅ 心跳检测（ping/pong）
 *   ✅ 完整的错误处理
 *
 * 使用方式：
 * ```typescript
 * const { connect, send, disconnect, isConnected, onMessage } = useWebSocket()
 * 
 * // 连接
 * connect('ws://localhost:9002/api/chat/ws')
 * 
 * // 监听消息
 * onMessage((data) => {
 *   console.log('收到消息:', data)
 * })
 * 
 * // 发送消息
 * send({ type: 'chat', message: 'hello' })
 * 
 * // 断开连接
 * disconnect()
 * ```
 */

import { ref, onUnmounted } from 'vue'

/**
 * WebSocket 消息类型
 */
export interface WebSocketMessage<T = unknown> {
  type: string
  [key: string]: T
}

/**
 * Hook 返回值
 */
export interface UseWebSocketReturn {
  /** 连接到 WebSocket 服务器 */
  connect: (url: string) => void
  /** 发送消息 */
  send: <T extends WebSocketMessage>(message: T) => void
  /** 断开连接 */
  disconnect: (code?: number, reason?: string) => void
  /** 是否已连接 */
  isConnected: () => boolean
  /** 注册消息监听 */
  onMessage: <T extends WebSocketMessage>(callback: (message: T) => void) => void
  /** 注册错误监听 */
  onError: (callback: (error: Error) => void) => void
  /** 注册连接关闭监听 */
  onClose: (callback: (code: number, reason: string) => void) => void
}

/**
 * 生成唯一消息 ID
 */
export const generateMessageId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export const useWebSocket = (): UseWebSocketReturn => {
  // WebSocket 实例
  let ws: WebSocket | null = null
  
  // 状态
  const connected = ref(false)
  const reconnecting = ref(false)
  
  // 监听回调列表
  const messageCallbacks = new Set<(message: WebSocketMessage) => void>()
  const errorCallbacks = new Set<(error: Error) => void>()
  const closeCallbacks = new Set<(code: number, reason: string) => void>()
  
  // 重连配置
  const MAX_RECONNECT_ATTEMPTS = 5
  const INITIAL_RECONNECT_DELAY = 1000
  const MAX_RECONNECT_DELAY = 30000
  let reconnectAttempts = 0
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  
  // 心跳配置
  const HEARTBEAT_INTERVAL = 30000
  const PING_TIMEOUT = 10000
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pingTimeoutTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 生成重连延迟（指数退避 + 随机抖动）
   */
  const getReconnectDelay = (attempt: number): number => {
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attempt)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1)
    return Math.min(delay + jitter, MAX_RECONNECT_DELAY)
  }

  /**
   * 清除定时器
   */
  const clearTimers = (): void => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (pingTimeoutTimer) {
      clearTimeout(pingTimeoutTimer)
      pingTimeoutTimer = null
    }
  }

  /**
   * 发送 ping 心跳
   */
  const sendPing = (): void => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    pingTimeoutTimer = setTimeout(() => {
      console.warn('[WebSocket] ⚠️ ping 超时，断开连接')
      ws?.close(1006, 'Ping timeout')
    }, PING_TIMEOUT)

    ws.send(JSON.stringify({ type: 'ping' }))
  }

  /**
   * 启动心跳检测
   */
  const startHeartbeat = (): void => {
    heartbeatTimer = setInterval(sendPing, HEARTBEAT_INTERVAL)
  }

  /**
   * 创建 WebSocket 连接
   */
  const createConnection = (url: string): void => {
    console.info('[WebSocket] 🔄 尝试连接:', url)
    
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.info('[WebSocket] ✅ 连接成功')
      connected.value = true
      reconnecting.value = false
      reconnectAttempts = 0
      
      // 启动心跳检测
      startHeartbeat()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage
        
        // 响应 pong
        if (data.type === 'ping') {
          ws?.send(JSON.stringify({ type: 'pong' }))
          return
        }
        
        // 清除 ping 超时
        if (data.type === 'pong' && pingTimeoutTimer) {
          clearTimeout(pingTimeoutTimer)
          pingTimeoutTimer = null
          return
        }
        
        // 通知所有回调
        messageCallbacks.forEach((callback) => callback(data))
      } catch (err) {
        console.warn('[WebSocket] ⚠️ 消息解析失败:', event.data.slice(0, 50))
      }
    }

    ws.onerror = (event) => {
      console.error('[WebSocket] ❌ 连接错误:', event)
      errorCallbacks.forEach((callback) => callback(new Error('WebSocket error')))
    }

    ws.onclose = (event) => {
      console.info(`[WebSocket] 🔌 连接关闭 (${event.code}): ${event.reason || '正常关闭'}`)
      
      connected.value = false
      clearTimers()
      
      // 通知所有回调
      closeCallbacks.forEach((callback) => callback(event.code, event.reason))
      
      // 自动重连（非主动关闭）
      if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnecting.value = true
        const delay = getReconnectDelay(reconnectAttempts)
        reconnectAttempts++
        
        console.warn(`[WebSocket] ⚠️ 尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})，延迟 ${Math.round(delay)}ms`)
        
        reconnectTimeout = setTimeout(() => {
          createConnection(url)
        }, delay)
      }
    }
  }

  /**
   * 连接到 WebSocket 服务器
   */
  const connect = (url: string): void => {
    if (connected.value) {
      console.warn('[WebSocket] ⚠️ 已连接，先断开再重连')
      disconnect(1000, 'Reconnecting')
    }
    
    reconnectAttempts = 0
    createConnection(url)
  }

  /**
   * 发送消息
   */
  const send = <T extends WebSocketMessage>(message: T): void => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] ⚠️ 未连接，无法发送消息')
      return
    }
    
    try {
      ws.send(JSON.stringify(message))
      console.debug('[WebSocket] 📤 发送消息:', message.type)
    } catch (err) {
      console.error('[WebSocket] ❌ 发送失败:', err)
    }
  }

  /**
   * 断开连接
   */
  const disconnect = (code: number = 1000, reason: string = 'Normal close'): void => {
    clearTimers()
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS // 阻止重连
    
    if (ws) {
      try {
        ws.close(code, reason)
      } catch {
        // 忽略关闭错误
      }
      ws = null
    }
    
    connected.value = false
  }

  /**
   * 是否已连接
   */
  const isConnected = (): boolean => {
    return connected.value
  }

  /**
   * 注册消息监听
   */
  const onMessage = <T extends WebSocketMessage>(callback: (message: T) => void): void => {
    messageCallbacks.add(callback as (message: WebSocketMessage) => void)
  }

  /**
   * 注册错误监听
   */
  const onError = (callback: (error: Error) => void): void => {
    errorCallbacks.add(callback)
  }

  /**
   * 注册连接关闭监听
   */
  const onClose = (callback: (code: number, reason: string) => void): void => {
    closeCallbacks.add(callback)
  }

  /**
   * 组件卸载时清理
   */
  onUnmounted(() => {
    disconnect()
  })

  return {
    connect,
    send,
    disconnect,
    isConnected,
    onMessage,
    onError,
    onClose,
  }
}