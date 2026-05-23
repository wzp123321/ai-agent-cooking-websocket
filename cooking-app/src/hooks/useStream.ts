/**
 * ============================================================
 * useStream — 通用流式回答 Hook
 * ============================================================
 *
 * 功能：
 *   封装 WebSocket 流式回答的核心逻辑，提供完整的流式通信能力
 *   支持自动重连、超时处理、错误恢复
 *
 * 特点：
 *   ✅ 完全独立，不依赖任何项目特定代码
 *   ✅ 开箱即用，传入必要参数即可使用
 *   ✅ 自动重连（指数退避策略）
 *   ✅ 超时处理（60秒自动中止）
 *   ✅ 支持手动中止
 *   ✅ 完整的错误处理
 *
 * 使用方式：
 * ```typescript
 * const { startStream, abort, stopGeneration, isStreaming } = useStream()
 * 
 * await startStream({
 *   content: '红烧肉怎么做',
 *   sessionId: 'session-1',
 *   onChunk: (chunk) => console.log('收到:', chunk),
 *   onDone: (full) => console.log('完成:', full),
 *   onError: (err) => console.error('错误:', err),
 * })
 * ```
 */

import { ref } from 'vue'

/**
 * 流式消息类型
 */
interface StreamMessage {
  type: 'chunk' | 'done' | 'error' | 'ping' | 'pong' | 'ack' | 'welcome'
  content?: string
  sessionId?: string
  error?: string
  messageId?: string
  message?: string
}

/**
 * 流式请求配置选项
 */
export interface StreamOptions {
  /** 用户输入内容 */
  content: string
  /** 会话 ID */
  sessionId: string
  /** WebSocket 服务端地址 */
  url?: string
  /** 收到流式片段时的回调 */
  onChunk: (chunk: string) => void
  /** 流式传输完成时的回调 */
  onDone: (full: string) => void
  /** 出错时的回调 */
  onError: (err: Error) => void
  /** 超时处理回调（可选） */
  onTimeout?: () => void
  /** 中止处理回调（可选） */
  onAbort?: () => void
}

/**
 * Hook 返回值
 */
export interface UseStreamReturn {
  /** 启动流式请求 */
  startStream: (options: StreamOptions) => Promise<void>
  /** 手动中止请求 */
  abort: () => void
  /** 停止生成（带中止标记） */
  stopGeneration: () => void
  /** 是否正在流式传输中 */
  isStreaming: () => boolean
  /** 获取当前错误 */
  getError: () => Error | null
  /** 获取累计的完整内容 */
  getFullContent: () => string
}

/**
 * 生成唯一消息 ID
 */
const generateMessageId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 默认 WebSocket 地址构建
 */
const buildDefaultUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}/api/chat/ws`
}

export const useStream = (): UseStreamReturn => {
  // 状态管理
  const streaming = ref(false)
  const fullContent = ref('')
  const currentError = ref<Error | null>(null)
  
  // 控制变量
  let abortController: AbortController | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  
  // 重连配置
  const MAX_RECONNECT_ATTEMPTS = 5
  const INITIAL_RECONNECT_DELAY = 1000
  const MAX_RECONNECT_DELAY = 30000
  const STREAM_TIMEOUT_MS = 60000

  /**
   * 清除超时计时器
   */
  const clearTimeoutTimer = (): void => {
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  /**
   * 重置状态
   */
  const resetState = (): void => {
    streaming.value = false
    fullContent.value = ''
    currentError.value = null
  }

  /**
   * 中止请求
   */
  const abort = (): void => {
    clearTimeoutTimer()
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    resetState()
  }

  /**
   * 停止生成（用户主动停止）
   */
  const stopGeneration = (): void => {
    if (!abortController) return
    console.info('[Stream] 🛑 用户手动中止生成')
    abort()
  }

  /**
   * 是否正在流式传输中
   */
  const isStreaming = (): boolean => {
    return streaming.value
  }

  /**
   * 获取当前错误
   */
  const getError = (): Error | null => {
    return currentError.value
  }

  /**
   * 获取累计的完整内容
   */
  const getFullContent = (): string => {
    return fullContent.value
  }

  /**
   * 启动流式请求
   */
  const startStream = async (options: StreamOptions): Promise<void> => {
    const {
      content,
      sessionId,
      url = buildDefaultUrl(),
      onChunk,
      onDone,
      onError,
      onTimeout,
      onAbort,
    } = options

    // 重置状态
    resetState()
    streaming.value = true
    fullContent.value = ''

    // 创建中止控制器
    const controller = new AbortController()
    abortController = controller

    // 启动超时计时器
    timeoutTimer = setTimeout(() => {
      if (!controller.signal.aborted) {
        console.warn('[Stream] ⏰ 流式请求超时')
        controller.abort()
        abortController = null
        onTimeout?.()
      }
    }, STREAM_TIMEOUT_MS)

    return new Promise<void>((resolve, reject) => {
      let ws: WebSocket | null = null
      let reconnectAttempts = 0
      let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

      /**
       * 生成重连延迟（指数退避 + 随机抖动）
       */
      const getReconnectDelay = (attempt: number): number => {
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attempt)
        const jitter = delay * 0.1 * (Math.random() * 2 - 1)
        return Math.min(delay + jitter, MAX_RECONNECT_DELAY)
      }

      /**
       * 创建连接
       */
      const createConnection = (): void => {
        if (controller.signal.aborted) {
          resetState()
          reject(new Error('AbortError'))
          return
        }

        ws = new WebSocket(url)
        const messageId = generateMessageId()

        ws.onopen = () => {
          console.info('[Stream] 🔗 连接已建立')
          reconnectAttempts = 0

          // 发送聊天消息
          const payload = JSON.stringify({
            type: 'chat',
            message: content,
            sessionId,
            messageId,
          })
          ws!.send(payload)
          console.info(`[Stream] 📤 发送消息 [${sessionId}]`)
        }

        ws.onmessage = (event) => {
          let data: StreamMessage
          try {
            data = JSON.parse(event.data)
          } catch {
            console.warn('[Stream] ⚠️ 消息解析失败')
            return
          }

          switch (data.type) {
            case 'ping':
              ws!.send(JSON.stringify({ type: 'pong' }))
              break

            case 'welcome':
              console.info('[Stream] 👋 收到欢迎消息')
              break

            case 'ack':
              console.info(`[Stream] ✅ 消息已确认`)
              break

            case 'chunk':
              if (typeof data.content === 'string') {
                fullContent.value += data.content
                onChunk(data.content)
              }
              break

            case 'done':
              console.info('[Stream] ✅ 传输完成')
              clearTimeoutTimer()
              abortController = null
              streaming.value = false
              const finalContent = data.content || fullContent.value
              onDone(finalContent)
              resolve()
              break

            case 'error':
              console.error('[Stream] ❌ 错误:', data.error)
              clearTimeoutTimer()
              abortController = null
              streaming.value = false
              const err = new Error(data.error || 'Stream error')
              currentError.value = err
              onError(err)
              reject(err)
              break

            default:
              console.warn('[Stream] ⚠️ 未知消息类型:', data.type)
          }
        }

        ws.onclose = (event) => {
          if (streaming.value &&
              reconnectAttempts < MAX_RECONNECT_ATTEMPTS &&
              event.code !== 1000 &&
              event.code !== 1001 &&
              !controller.signal.aborted) {

            const delay = getReconnectDelay(reconnectAttempts)
            reconnectAttempts++

            console.warn(`[Stream] ⚠️ 重连中 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})，延迟 ${Math.round(delay)}ms`)

            reconnectTimeout = setTimeout(() => {
              createConnection()
            }, delay)
            return
          }

          // 最终关闭
          clearTimeoutTimer()
          abortController = null
          resetState()

          if (event.code !== 1000 && !controller.signal.aborted) {
            const err = new Error(reconnectAttempts >= MAX_RECONNECT_ATTEMPTS
              ? '重连失败，请检查网络或后端服务'
              : '连接已断开')
            currentError.value = err
            onError(err)
            reject(err)
          }
        }

        ws.onerror = (event) => {
          console.error('[Stream] ❌ WebSocket 错误:', event)
        }
      }

      /**
       * 监听中止信号
       */
      controller.signal.addEventListener('abort', () => {
        console.info('[Stream] 🛑 请求已取消')

        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
        }

        if (ws) {
          try {
            ws.close(1000, 'Aborted')
          } catch {
            // 忽略错误
          }
        }

        resetState()
        onAbort?.()
        reject(new Error('AbortError'))
      })

      // 建立连接
      createConnection()
    })
  }

  return {
    startStream,
    abort,
    stopGeneration,
    isStreaming,
    getError,
    getFullContent,
  }
}