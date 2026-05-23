/**
 * ============================================================
 * tools/types.ts — 工具体系类型定义
 * ============================================================
 *
 * 整个 Agent 工具体系的核心类型：
 *   Tool         — 工具的元信息（名称、描述、参数 schema）
 *   ToolImpl     — 工具的实际执行函数
 *   ToolCall     — LLM 请求调用工具时传递的结构
 *   ToolResult   — 工具执行后的返回值
 *   ReActStep    — ReAct 推理循环中的单个步骤
 */

// ─── 通用工具参数类型 ──────────────────────────────────────

/** JSON Schema 风格的参数定义 */
export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  items?: { type: string; description?: string }
}

export interface ToolParameters {
  type: 'object'
  properties: Record<string, ToolParameterProperty>
  required: string[]
}

// ─── 工具元信息 ───────────────────────────────────────────

/**
 * 工具元信息
 *
 * 用途：
 *   - 传递给 LLM，让它知道有哪些工具可用、什么时候该调用
 *   - 与 OpenAI Function Calling 的 schema 格式保持一致
 */
export interface Tool {
  /** 工具唯一标识符，LLM 通过这个名字选择调用哪个工具 */
  name: string

  /** 工具描述（关键！LLM 根据这个决定是否调用） */
  description: string

  /** JSON Schema 格式的参数定义 */
  parameters: ToolParameters
}

// ─── 工具执行层 ───────────────────────────────────────────

/**
 * 工具实现函数的签名
 *
 * T — 工具参数的类型（由 Tool.parameters 自动推断）
 *
 * 实现要点：
 *   - 必须是 async 函数（支持异步 IO：查数据库、调外部 API）
 *   - 返回标准化的 ToolResult
 *   - 不抛错，错误也包装在 ToolResult 中返回
 */
export type ToolImpl<T extends Record<string, unknown> = Record<string, unknown>> = (
  args: T
) => Promise<ToolResult>

// ─── 工具返回值 ────────────────────────────────────────────

export interface ToolResult {
  /** 执行是否成功 */
  success: boolean
  /** 执行返回的数据（供 LLM 综合分析） */
  data?: unknown
  /** 错误信息（success=false 时填充） */
  error?: string
  /** 工具执行耗时（毫秒，用于日志和性能监控） */
  duration?: number
}

// ─── LLM → 工具调用 ───────────────────────────────────────

/**
 * 从 LLM 响应中提取出的工具调用请求
 * 对应 OpenAI SDK 的 tool_call 结构
 */
export interface ToolCall {
  /** 工具调用请求的唯一 ID（用于拼接 tool role 消息） */
  id: string
  /** 要调用的工具名称 */
  name: string
  /** 工具参数（JSON 字符串，解析后传给实现函数） */
  arguments: string
}

// ─── ReAct 推理循环 ───────────────────────────────────────

/**
 * ReAct（Reasoning + Acting）循环中的单个推理步骤
 *
 * ReAct 模式：
 *   Thought  →  LLM 分析当前情况，决定下一步行动
 *   Action    →  调用某个工具（或直接回答）
 *   Observation →  获取工具返回结果
 *   …循环直到 LLM 认为可以给出最终答案
 */
export interface ReActStep {
  /** 步骤序号（从 1 开始） */
  step: number
  /** LLM 的思考过程 */
  thought: string
  /** 调用的工具名称（'final_answer' 表示结束） */
  action: string
  /** 调用工具时传入的参数（单个参数对象或数组） */
  actionInput?: unknown
  /** 工具返回的观察结果（Action=final_answer 时为空） */
  observation?: string
}

/**
 * Agent 执行日志（方便调试和追踪 Agent 思维过程）
 */
export interface AgentExecutionLog {
  sessionId: string
  userMessage: string
  steps: ReActStep[]
  finalAnswer: string
  totalDuration: number
  toolCalls: number
}
