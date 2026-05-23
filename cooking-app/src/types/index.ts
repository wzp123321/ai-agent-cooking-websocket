// ─── 消息类型 ─────────────────────────────────────────
export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  streaming?: boolean
  image?: string
}

// ─── 会话类型 ─────────────────────────────────────────
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface SessionMeta {
  id: string
  title: string
  created_at: number
  updated_at: number
}

// ─── API 响应类型 ─────────────────────────────────────
export interface ChatResponse {
  success: boolean
  message: string
  sessionId: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ─── SSE 事件类型 ─────────────────────────────────────
export interface SSEChunkData {
  content: string
}

export interface SSEDoneData {
  content: string
  sessionId: string
}

export interface SSEErrorData {
  error: string
}

export interface UserProfile {
  id: string
  allergies: string[]
  diet_type: string
  skill_level: 'beginner' | 'intermediate' | 'expert'
  disliked: string[]
  calorie_goal: number
  created_at: number
  updated_at: number
}
