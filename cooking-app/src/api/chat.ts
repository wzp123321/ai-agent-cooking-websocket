/**
 * ============================================================
 * cooking-app API 客户端
 * ============================================================
 *
 * 功能概述：
 *   封装与 cooking-agent 后端服务的 HTTP/WebSocket 通信，包括：
 *   - 普通对话（完整返回）
 *   - 流式对话（WebSocket，逐字接收）
 *   - 会话管理（列表、历史、清除）
 *   - 健康检查
 *   - 用户画像（获取、更新）
 *
 * 技术选型：
 *   - REST 接口：使用 Axios 实例（统一拦截器、错误处理、日志）
 *   - WebSocket 流式：使用原生 WebSocket API
 *   - BASE_URL 由 Vite 代理到 http://localhost:9002（见 vite.config.js）
 *
 * WebSocket 特性：
 *   - 自动重连（指数退避策略，最大延迟 30 秒）
 *   - 心跳检测（响应服务端 ping）
 *   - 消息确认（ACK）机制
 *   - 连接状态管理
 */

import request from './request'
import { BASE_URL } from '@/constants'
import type { ChatResponse, SessionMeta, ChatMessage, UserProfile } from '@/types'

// ─── 普通对话 ──────────────────────────────────────────────

export async function sendChat(message: string, sessionId: string): Promise<ChatResponse> {
  console.info(`[API] POST /chat [${sessionId}]`)

  const { data } = await request.post<ChatResponse>('/chat', { message, sessionId })

  console.info(`[API] ✅ /chat [${sessionId}] 收到回复：${data.message.length} 字符`)
  return data
}

// ─── 流式对话（WebSocket）─────────────────────────────────

interface WebSocketMessage {
  type: 'chunk' | 'done' | 'error' | 'ping' | 'pong' | 'ack' | 'welcome'
  content?: string
  sessionId?: string
  error?: string
  messageId?: string
  message?: string
}

/**
 * 生成唯一消息 ID
 */
const generateMessageId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 发送流式对话请求（WebSocket）
 *
 * WebSocket 消息格式：
 *   客户端发送：{ "type": "chat", "message": "...", "sessionId": "...", "messageId": "..." }
 *   客户端发送：{ "type": "pong" } - 心跳响应
 *   服务端发送：{ "type": "chunk", "content": "..." }
 *   服务端发送：{ "type": "done", "content": "...", "sessionId": "..." }
 *   服务端发送：{ "type": "error", "error": "..." }
 *   服务端发送：{ "type": "ping" } - 心跳检测
 *   服务端发送：{ "type": "ack", "messageId": "..." } - 消息确认
 *   服务端发送：{ "type": "welcome", "message": "..." } - 连接成功
 *
 * @param message   - 用户输入
 * @param sessionId - 会话 ID
 * @param onChunk   - 每次收到 token 片段的回调
 * @param onDone    - 流结束后回调
 * @param onError   - 出错时的回调
 * @param signal    - AbortSignal，用于取消请求
 */
export async function sendChatStream(
  message: string,
  sessionId: string,
  onChunk: (chunk: string) => void,
  onDone: (full: string) => void,
  onError: (err: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  console.info(`[API] WebSocket /chat/ws [${sessionId}] 建立连接…`)

  // 构建 WebSocket URL（将 http/https 转换为 ws/wss）
  const baseUrl = BASE_URL.startsWith('/') 
    ? window.location.origin + BASE_URL 
    : BASE_URL
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${baseUrl.replace(/^https?:\/\//, '')}/chat/ws`

  // 生成消息 ID（用于 ACK 确认）
  const messageId = generateMessageId()

  return new Promise<void>((resolve, reject) => {
    let ws: WebSocket | null = null
    let fullContent = ''
    let closed = false
    let reconnectionAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5
    const INITIAL_RECONNECT_DELAY = 1000
    const MAX_RECONNECT_DELAY = 30000
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    /**
     * 生成重连延迟（指数退避）
     */
    const getReconnectDelay = (attempt: number): number => {
      const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attempt)
      // 添加随机抖动避免雪崩
      const jitter = delay * 0.1 * (Math.random() * 2 - 1)
      return Math.min(delay + jitter, MAX_RECONNECT_DELAY)
    }

    /**
     * 创建新的 WebSocket 连接
     */
    const createConnection = () => {
      if (closed) return

      ws = new WebSocket(wsUrl)

      /**
       * WebSocket 连接建立成功
       */
      ws.onopen = () => {
        console.info('[API] 🔗 WebSocket 连接已建立')
        reconnectionAttempts = 0 // 重置重连计数

        // 发送聊天消息
        const payload = JSON.stringify({
          type: 'chat',
          message,
          sessionId,
          messageId,
        })
        ws!.send(payload)
        console.info(`[API] 📤 发送消息 [${sessionId}]，消息ID: ${messageId}`)
      }

      /**
       * 接收 WebSocket 消息
       */
      ws.onmessage = (event) => {
        let data: WebSocketMessage

        try {
          data = JSON.parse(event.data)
        } catch (err) {
          console.warn('[API] ⚠️ WebSocket 消息解析失败：', event.data.slice(0, 50))
          return
        }

        switch (data.type) {
          case 'ping':
            // 响应心跳
            ws!.send(JSON.stringify({ type: 'pong' }))
            console.debug('[API] 🏓 响应 ping')
            break

          case 'welcome':
            console.info('[API] 👋 收到欢迎消息：', data.message)
            break

          case 'ack':
            console.info(`[API] ✅ 消息已确认 (${data.messageId})`)
            break

          case 'chunk':
            if (typeof data.content === 'string') {
              fullContent += data.content
              onChunk(data.content)
            }
            break

          case 'done':
            console.info(`[API] ✅ WebSocket [${sessionId}] 传输完成`)
            cleanupAndClose()
            onDone(data.content || fullContent)
            resolve()
            break

          case 'error':
            console.error('[API] ❌ WebSocket error 事件：', data.error)
            cleanupAndClose()
            onError(new Error(data.error || 'WebSocket error'))
            reject(new Error(data.error || 'WebSocket error'))
            break

          default:
            console.warn('[API] ⚠️ 未知消息类型：', data.type)
        }
      }

      /**
       * WebSocket 连接关闭
       */
      ws.onclose = (event) => {
        if (closed) return
        console.info(`[API] 🔌 WebSocket 连接关闭 (${event.code}): ${event.reason}`)

        // 检查是否需要重连
        if (!closed && 
            reconnectionAttempts < MAX_RECONNECT_ATTEMPTS && 
            event.code !== 1000 && // 非预期关闭
            event.code !== 1001 && // 客户端主动断开
            !signal?.aborted) {
          
          const delay = getReconnectDelay(reconnectionAttempts)
          reconnectionAttempts++
          
          console.warn(`[API] ⚠️ 尝试重连 (${reconnectionAttempts}/${MAX_RECONNECT_ATTEMPTS})，延迟 ${Math.round(delay)}ms`)
          
          reconnectTimeout = setTimeout(() => {
            console.info('[API] 🔄 尝试重新连接...')
            createConnection()
          }, delay)
          return
        }

        // 最终关闭
        closed = true
        if (event.code !== 1000 && !signal?.aborted) {
          const errorMsg = event.code === 1011 
            ? event.reason 
            : reconnectionAttempts >= MAX_RECONNECT_ATTEMPTS
              ? '重连失败，请检查网络或后端服务'
              : 'Agent 连接中断'
          onError(new Error(errorMsg))
          reject(new Error(errorMsg))
        }
      }

      /**
       * WebSocket 错误处理
       */
      ws.onerror = (event) => {
        if (closed) return

        console.error('[API] ❌ WebSocket 错误：', event)
        
        // 错误发生后会触发 onclose，由 onclose 处理重连逻辑
      }
    }

    /**
     * 清理资源并关闭连接
     */
    const cleanupAndClose = () => {
      if (closed) return
      closed = true

      // 清除重连定时器
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }

      // 关闭 WebSocket
      if (ws) {
        try {
          ws.close(1000, 'Normal close')
        } catch {
          // 忽略关闭错误
        }
        ws = null
      }
    }

    /**
     * 处理中止信号
     */
    signal?.addEventListener('abort', () => {
      console.info(`[API] 🛑 WebSocket [${sessionId}] 请求已取消`)
      cleanupAndClose()
      onError(new Error('AbortError'))
      reject(new Error('AbortError'))
    })

    // 建立初始连接
    createConnection()
  })
}

// ─── 会话管理 ──────────────────────────────────────────────

export async function clearSession(sessionId: string): Promise<void> {
  console.info(`[API] DELETE /session/${sessionId}`)

  try {
    await request.delete(`/session/${sessionId}`)
    console.info(`[API] ✅ 会话 ${sessionId} 已清除`)
  } catch (err) {
    console.error(`[API] ❌ 清除会话 ${sessionId} 失败：`, err)
  }
}

// ─── 健康检查 ──────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch('/health')
    const online = res.ok

    console.info(`[API] 🔍 健康检查：${online ? '✅ Agent 在线' : '❌ Agent 离线'}`)
    return online
  } catch {
    console.warn('[API] ⚠️  健康检查网络错误：Agent 服务不可达')
    return false
  }
}

// ─── 会话列表 & 历史 ──────────────────────────────────────

export async function getSessions(): Promise<SessionMeta[]> {
  console.info('[API] GET /sessions')

  const { data } = await request.get<SessionMeta[]>('/sessions')

  console.info(`[API] ✅ 获取到 ${data.length} 个会话`)
  return data
}

export async function getHistory(sessionId: string): Promise<ChatMessage[]> {
  console.info(`[API] GET /history/${sessionId}`)

  const { data } = await request.get<{
    sessionId: string
    history: { role: string; content: string; tool_call_id?: string }[]
  }>(`/history/${sessionId}`)

  const messages = data.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m, i) => ({
      id: `${sessionId}_${i}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: Date.now(),
    }))

  console.info(`[API] ✅ 加载会话 ${sessionId} 历史：${messages.length} 条`)
  return messages
}

// ─── 用户画像 ──────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  console.info('[API] GET /profile')

  const { data } = await request.get<UserProfile>('/profile')

  console.info(`[API] ✅ 获取用户画像：${data.diet_type || '无特殊膳食'} | ${data.skill_level}`)
  return data
}

export async function updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  console.info('[API] PUT /profile', updates)

  const { data } = await request.put<UserProfile>('/profile', updates)

  console.info(`[API] ✅ 用户画像已更新`)
  return data
}

// ─── 图片识别 ──────────────────────────────────────────────

export interface VisionResponse {
  success: boolean
  content: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export async function sendVisionChat(
  imageBase64: string,
  message?: string,
): Promise<VisionResponse> {
  console.info('[API] POST /vision/chat')

  const { data } = await request.post<VisionResponse>('/vision/chat', {
    image: imageBase64,
    message: message || undefined,
  })

  console.info(`[API] ✅ 图片识别完成，${data.content.length} 字符`)
  return data
}