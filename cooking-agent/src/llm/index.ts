import 'dotenv/config'
import type { LLMProvider, ModelTier } from './types'
import { DeepSeekProvider } from './deepseek'

const providers: Map<string, LLMProvider> = new Map()

function initProviders(): void {
  if (providers.size > 0) return

  const dsKey = process.env.DEEPSEEK_API_KEY
  if (dsKey) {
    const dsChat = new DeepSeekProvider({
      apiKey: dsKey,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-chat',
      maxTokens: 2048,
      temperature: 0.7,
    })
    providers.set('deepseek-chat', dsChat)

    if (process.env.DEEPSEEK_REASONER_KEY || dsKey) {
      const dsReasoner = new DeepSeekProvider({
        apiKey: process.env.DEEPSEEK_REASONER_KEY ?? dsKey,
        baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
        model: process.env.DEEPSEEK_REASONER_MODEL ?? 'deepseek-reasoner',
        maxTokens: 4096,
        temperature: 0.3,
      })
      providers.set('deepseek-reasoner', dsReasoner)
    }
  }

  const oaiKey = process.env.OPENAI_API_KEY
  if (oaiKey) {
    const oaiProvider = new DeepSeekProvider({
      apiKey: oaiKey,
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      maxTokens: 4096,
      temperature: 0.7,
    })
    providers.set('openai', oaiProvider)
  }

  if (providers.size === 0) {
    throw new Error(
      '未配置任何 LLM Provider。请在 .env 中设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY',
    )
  }

  const names = [...providers.keys()].join(', ')
  console.info(`[LLM] 🚀 已初始化 Provider：${names}`)
}

export function getProvider(name?: string): LLMProvider {
  initProviders()

  if (name) {
    const p = providers.get(name)
    if (p) return p
    console.warn(`[LLM] ⚠️ Provider "${name}" 未找到，使用默认`)
  }

  return providers.get('deepseek-chat') ?? [...providers.values()][0]
}

export function getProviderForTier(tier: ModelTier): LLMProvider {
  initProviders()

  switch (tier) {
    case 'fast':
      return providers.get('deepseek-chat') ?? [...providers.values()][0]

    case 'smart':
      return (
        providers.get('deepseek-reasoner') ??
        providers.get('openai') ??
        providers.get('deepseek-chat') ??
        [...providers.values()][0]
      )

    case 'vision':
      return (
        providers.get('openai') ??
        providers.get('deepseek-chat') ??
        [...providers.values()][0]
      )

    default:
      return [...providers.values()][0]
  }
}

export function listProviders(): string[] {
  initProviders()
  return [...providers.keys()]
}

export { DeepSeekProvider }
export type { LLMProvider, LLMConfig, ChatCompletionParams, ChatCompletionResult, ModelTier } from './types'