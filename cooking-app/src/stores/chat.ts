/**
 * ============================================================
 * Pinia Chat Store — 全局对话状态管理
 * ============================================================
 *
 * 职责边界：
 *   Store 维护全局状态（会话列表、在线状态、加载状态）
 *   useConversation hook 负责对话内容的发送逻辑
 *
 * 技术细节：
 *   - 使用 Pinia 的 Composition API 风格（defineStore + 函数式 setup）
 *   - 会话存储在内存中，页面刷新后从后端 DB 重新加载
 */

// ─── 模块引入 ──────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { clearSession, healthCheck, getSessions, getHistory } from '@/api/chat'
import type { ChatMessage, ChatSession, SessionMeta } from '@/types'

// ─── 工具函数 ──────────────────────────────────────────────

const genId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const createSession = (): ChatSession => {
  const id = genId()
  return {
    id,
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const metaToSession = (meta: SessionMeta): ChatSession => {
  return {
    id: meta.id,
    title: meta.title,
    messages: [],
    createdAt: meta.created_at,
    updatedAt: meta.updated_at,
  }
}

// ─── Store 定义 ────────────────────────────────────────────

export const useChatStore = defineStore('chat', () => {
  // ══════════════════════════════════════════════════════════
  // State
  // ══════════════════════════════════════════════════════════

  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string>('')
  const agentOnline = ref<boolean>(false)
  const loading = ref<boolean>(false)

  // ══════════════════════════════════════════════════════════
  // Getters
  // ══════════════════════════════════════════════════════════

  const currentSession = computed<ChatSession>(() => {
    const found = sessions.value.find((s) => s.id === currentSessionId.value)
    if (found) return found
    if (sessions.value.length > 0) return sessions.value[0]
    return createSession()
  })

  const messages = computed<ChatMessage[]>(() => currentSession.value.messages)

  // ══════════════════════════════════════════════════════════
  // Actions — 会话管理
  // ══════════════════════════════════════════════════════════

  const newSession = (): void => {
    const s = createSession()
    sessions.value.unshift(s)
    currentSessionId.value = s.id
    console.info(`[Store] 🆕 新建会话：${s.id}`)
  }

  const switchSession = (id: string): void => {
    if (id === currentSessionId.value) return
    console.info(`[Store] 🔄 切换会话：${currentSessionId.value} → ${id}`)
    currentSessionId.value = id
  }

  const deleteSession = async (id: string): Promise<void> => {
    console.info(`[Store] 🗑️ 删除会话：${id}`)
    await clearSession(id).catch(() => {})

    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value.splice(idx, 1)

    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0]?.id ?? ''
    }
    if (sessions.value.length === 0) newSession()
  }

  const clearCurrentSession = async (): Promise<void> => {
    const session = currentSession.value
    console.info(`[Store] 🧹 清空会话消息：${session.id}`)
    await clearSession(session.id).catch(() => {})
    session.messages = []
    session.title = '新对话'
    session.updatedAt = Date.now()
  }

  // ══════════════════════════════════════════════════════════
  // Actions — 后端同步
  // ══════════════════════════════════════════════════════════

  const loadSessions = async (): Promise<void> => {
    try {
      const metas = await getSessions()
      if (metas.length === 0) {
        newSession()
        return
      }

      sessions.value = metas.map(metaToSession)
      currentSessionId.value = sessions.value[0].id
      console.info(`[Store] � 从后端加载了 ${metas.length} 个会话`)
    } catch (err) {
      console.warn('[Store] ⚠️ 加载会话列表失败，使用本地默认会话：', err)
      newSession()
    }
  }

  const loadHistory = async (sessionId: string): Promise<void> => {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    if (session.messages.length > 0) return // 已加载过

    try {
      const msgs = await getHistory(sessionId)
      session.messages = msgs
      console.info(`[Store] 📜 加载会话 ${sessionId} 历史：${msgs.length} 条`)
    } catch (err) {
      console.warn(`[Store] ⚠️ 加载历史失败 [${sessionId}]：`, err)
    }
  }

  // ══════════════════════════════════════════════════════════
  // Actions — 健康检查
  // ══════════════════════════════════════════════════════════

  const checkHealth = async (): Promise<void> => {
    agentOnline.value = await healthCheck()
  }

  // ══════════════════════════════════════════════════════════
  // 导出
  // ══════════════════════════════════════════════════════════
  return {
    sessions,
    currentSessionId,
    agentOnline,
    loading,
    currentSession,
    messages,
    newSession,
    switchSession,
    deleteSession,
    clearCurrentSession,
    loadSessions,
    loadHistory,
    checkHealth,
  }
})