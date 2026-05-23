/**
 * ============================================================
 * LLM Provider 抽象层类型定义
 * ============================================================
 *
 * 设计目标：
 *   将 LLM 调用抽象为统一接口，支持多 Provider 切换
 *   （DeepSeek、OpenAI 等），业务层无需关心具体实现。
 *
 * 核心接口：
 *   - LLMProvider：所有 Provider 必须实现的接口
 *   - ChatCompletionParams：统一的 LLM 调用参数
 *   - ChatCompletionResult：统一的 LLM 返回结果
 */

import type OpenAI from 'openai'

/** LLM Provider 初始化配置 */
export interface LLMConfig {
  apiKey: string
  baseURL: string
  model: string
  maxTokens?: number
  temperature?: number
}

/** 统一的 LLM 调用参数（屏蔽不同 Provider 的差异） */
export interface ChatCompletionParams {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[]
  tool_choice?: 'auto' | 'none' | 'required'
  temperature?: number
  max_tokens?: number
}

/** 统一的 LLM 返回结果 */
export interface ChatCompletionResult {
  content: string | null
  tool_calls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | null
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * LLM Provider 接口
 *
 * 所有 Provider（DeepSeek、OpenAI 等）必须实现此接口。
 * 包含两个核心方法：
 *   - chatCompletion：普通对话（一次性返回完整结果）
 *   - chatCompletionStream：流式对话（逐 token 推送）
 */
export interface LLMProvider {
  readonly name: string
  readonly model: string
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>
  chatCompletionStream(
    params: ChatCompletionParams,
    onChunk: (chunk: string) => void,
    onDone: (result: ChatCompletionResult) => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
  ): Promise<void>
}

/** 模型能力分级 */
export type ModelTier = 'fast' | 'smart' | 'vision'

/** 模型路由配置（按能力分级选择不同模型） */
export interface ModelRoute {
  tier: ModelTier
  provider: string
  model: string
}