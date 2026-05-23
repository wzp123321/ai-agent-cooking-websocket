/**
 * ============================================================
 * useConversation — 对话内容发送 Hook
 * ============================================================
 *
 * 职责：
 *   封装消息发送的完整流程（用户消息 → SSE 流式请求 → AI 回复）
 *   操作 store 中的 sessions / messages / loading 状态
 *
 * 使用方式：
 *   const { sendMessage } = useConversation()
 *   await sendMessage('红烧肉怎么做')
 */

import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { sendChatStream, sendVisionChat } from '@/api/chat'
import { MAX_SESSION_TITLE_LENGTH, ERROR_MSG_AGENT_OFFLINE } from '@/constants'
import type { ChatMessage } from '@/types'

/**
 * 流式请求超时间隔（毫秒）
 *
 * 当后端 Agent 卡死或 LLM API 无响应时，
 * 前端不能无限等待。60 秒后自动中止请求，
 * 清理 loading 状态并显示超时提示。
 */
const STREAM_TIMEOUT_MS = 60_000

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useConversation() {
  const store = useChatStore()
  let abortController: AbortController | null = null
  let streamTimer: ReturnType<typeof setTimeout> | null = null

  function clearStreamTimer(): void {
    if (streamTimer !== null) {
      clearTimeout(streamTimer)
      streamTimer = null
    }
  }

  function abort(): void {
    clearStreamTimer()
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  function stopGeneration(): void {
    if (!abortController) return

    console.info('[Conversation] 🛑 用户手动中止生成')
    clearStreamTimer()
    /**
     * 调用 abort() 触发的链路：
     *   1. fetch() 收到 AbortError → catch 中调用 onError
     *   2. sendChatStream 的 catch 中调用外层 catch 的 onError
     *   3. 本方 sendMessage 的 catch(err) 捕获 → 清理状态
     *
     * 但 onError 可能因 AbortError 直接 return 而不被调用，
     * 因此这里也要显式清理 loading / streaming / abortController。
     */
    abortController.abort()
    abortController = null
    store.loading = false

    const session = store.currentSession
    const aiMsg = session.messages[session.messages.length - 1]
    if (aiMsg && aiMsg.streaming) {
      aiMsg.streaming = false
      if (aiMsg.content.length > 0) {
        aiMsg.content += '\n\n[已中止]'
      }
      session.updatedAt = Date.now()
    }
  }

  async function sendMessage(content: string): Promise<void> {
    if (store.loading) {
      console.warn('[Conversation] ⚠️ 正在发送中，忽略重复请求')
      return
    }
    if (!content.trim()) {
      console.warn('[Conversation] ⚠️ 收到空消息，忽略')
      return
    }

    abort()

    store.loading = true
    const session = store.currentSession

    console.info(`[Conversation] 📤 发送消息 [${session.id}]：${content.slice(0, 50)}…`)

    if (session.messages.length === 0) {
      session.title = content.slice(0, MAX_SESSION_TITLE_LENGTH) + (content.length > MAX_SESSION_TITLE_LENGTH ? '…' : '')
      console.info(`[Conversation] 📝 会话标题更新为：${session.title}`)
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    session.messages.push(userMsg)
    session.updatedAt = Date.now()

    session.messages.push({
      id: genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    })
    const aiMsg = session.messages[session.messages.length - 1]
    console.info('[Conversation] ⏳ AI 消息已追加，等待流式响应…')

    abortController = new AbortController()

    /**
     * 启动超时计时器 — 防止后端卡死导致前端无限等待
     *
     * 触发场景：
     *   - LLM API 调用卡住（网络拥塞、服务端限流等待）
     *   - Agent 进程进入死循环
     *   - Express 线程被阻塞（同步 IO、JSON 解析大文件等）
     *
     * 超时后：中止 fetch → 清理 loading → 显示超时提示
     *   ① 已有部分内容 → 追加 "[回答超时]" 标记
     *   ② 无任何内容   → 填充完整超时提示文本
     */
    streamTimer = setTimeout(() => {
      if (!abortController) return
      console.warn('[Conversation] ⏰ 流式请求超时')
      abortController.abort()
      abortController = null
      store.loading = false
      if (aiMsg.streaming) {
        aiMsg.streaming = false
        if (!aiMsg.content) {
          aiMsg.content = '回答超时，请稍后重试。'
        } else {
          aiMsg.content += '\n\n[回答超时]'
        }
      }
    }, STREAM_TIMEOUT_MS)

    try {
      await sendChatStream(
        content,
        session.id,
        (chunk) => {
          aiMsg.content += chunk
        },
        () => {
          clearStreamTimer()
          aiMsg.streaming = false
          session.updatedAt = Date.now()
          store.loading = false
          abortController = null
          console.info(`[Conversation] ✅ AI 回复完成，共 ${aiMsg.content.length} 字符`)
        },
        (err) => {
          clearStreamTimer()
          if ((err as any)?.name === 'AbortError') {
            console.info('[Conversation] 🛑 请求已被取消')
            aiMsg.streaming = false
            store.loading = false
            abortController = null
            return
          }
          aiMsg.content = ERROR_MSG_AGENT_OFFLINE
          aiMsg.streaming = false
          store.loading = false
          abortController = null
          ElMessage.error('Agent 服务请求失败，请检查后端是否已启动')
          console.error('[Conversation] ❌ 流式请求失败：', err)
        },
        abortController.signal,
      )
    } catch (err) {
      clearStreamTimer()
      if ((err as any)?.name === 'AbortError') {
        console.info('[Conversation] 🛑 请求已被取消')
        aiMsg.streaming = false
        store.loading = false
        abortController = null
        return
      }
      aiMsg.content = `❌ 未知错误：${(err as Error).message}`
      aiMsg.streaming = false
      store.loading = false
      abortController = null
      console.error('[Conversation] ❌ sendMessage 未捕获的错误：', err)
    }
  }

  async function sendVisionMessage(imageBase64: string, text?: string): Promise<void> {
    if (store.loading) {
      console.warn('[Conversation] ⚠️ 正在发送中，忽略重复请求')
      return
    }

    abort()

    store.loading = true
    const session = store.currentSession

    const contentText = text || '帮我看看这些食材可以做什么菜？'
    console.info(`[Conversation] 📷 发送图片消息 [${session.id}]`)

    if (session.messages.length === 0) {
      session.title = contentText.slice(0, MAX_SESSION_TITLE_LENGTH) + (contentText.length > MAX_SESSION_TITLE_LENGTH ? '…' : '')
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text || '📷 拍照识别食材',
      timestamp: Date.now(),
      image: `data:image/jpeg;base64,${imageBase64}`,
    }
    session.messages.push(userMsg)
    session.updatedAt = Date.now()

    session.messages.push({
      id: genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    })
    const aiMsg = session.messages[session.messages.length - 1]

    try {
      const result = await sendVisionChat(imageBase64, text)

      aiMsg.content = result.content
      aiMsg.streaming = false
      session.updatedAt = Date.now()
      store.loading = false
      console.info(`[Conversation] ✅ 图片识别完成，共 ${aiMsg.content.length} 字符`)
    } catch (err) {
      aiMsg.content = `❌ 图片识别失败：${(err as Error).message}`
      aiMsg.streaming = false
      store.loading = false
      ElMessage.error('图片识别失败，请检查 Vision API 配置')
      console.error('[Conversation] ❌ 图片识别失败：', err)
    }
  }

  return { sendMessage, sendVisionMessage, stopGeneration, abort }
}