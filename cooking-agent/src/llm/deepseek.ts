import OpenAI from 'openai'
import type { LLMProvider, LLMConfig, ChatCompletionParams, ChatCompletionResult } from './types'

export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek'
  readonly model: string
  private readonly client: OpenAI
  private readonly defaultMaxTokens: number
  private readonly defaultTemperature: number

  constructor(config: LLMConfig) {
    this.model = config.model
    this.defaultMaxTokens = config.maxTokens ?? 2048
    this.defaultTemperature = config.temperature ?? 0.7

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })

    console.info(`[LLM:DeepSeek] 🤖 模型：${this.model} | 地址：${config.baseURL}`)
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tool_choice ?? 'auto',
      temperature: params.temperature ?? this.defaultTemperature,
      max_tokens: params.max_tokens ?? this.defaultMaxTokens,
    })

    const msg = response.choices[0].message

    return {
      content: msg.content,
      tool_calls: msg.tool_calls as ChatCompletionResult['tool_calls'] ?? null,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    }
  }

  async chatCompletionStream(
    params: ChatCompletionParams,
    onChunk: (chunk: string) => void,
    onDone: (result: ChatCompletionResult) => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: params.messages,
        tools: params.tools,
        tool_choice: params.tool_choice ?? 'auto',
        temperature: params.temperature ?? this.defaultTemperature,
        max_tokens: params.max_tokens ?? this.defaultMaxTokens,
        stream: true,
      })

      let fullContent = ''
      let toolCalls: ChatCompletionResult['tool_calls'] = null
      let cancelled = false

      for await (const chunk of stream) {
        if (signal?.aborted) {
          cancelled = true
          console.info('[LLM:DeepSeek] 🛑 流已被中止')
          break
        }

        const delta = chunk.choices[0]?.delta

        if (delta?.content) {
          fullContent += delta.content
          onChunk(delta.content)
        }

        if (delta?.tool_calls) {
          if (!toolCalls) toolCalls = []
          for (const tc of delta.tool_calls) {
            const existing = toolCalls.find((t) => (t as any).index === tc.index)
            if (existing) {
              if (tc.function?.arguments) {
                existing.function.arguments += tc.function.arguments
              }
            } else {
              toolCalls.push({
                id: tc.id ?? '',
                type: 'function' as const,
                index: tc.index,
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                },
              } as any)
            }
          }
        }
      }

      if (cancelled) {
        console.info(`[LLM:DeepSeek] 🛑 流已中止，已生成 ${fullContent.length} 字符`)
      }

      onDone({
        content: fullContent || null,
        tool_calls: toolCalls,
      })
    } catch (err) {
      if ((err as any)?.name === 'AbortError' || signal?.aborted) {
        console.info('[LLM:DeepSeek] 🛑 请求被中止')
        return
      }
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
}