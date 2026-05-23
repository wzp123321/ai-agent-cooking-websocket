export const APP_NAME = '厨神小助'

export const APP_SUBTITLE = 'AI 烹饪智能体'

export const APP_DESC = '专业烹饪 AI 顾问'

export const BASE_URL = '/api'

export const HEALTH_CHECK_INTERVAL = 30_000

export const MAX_SESSION_TITLE_LENGTH = 20

export const QUICK_QUESTIONS = [
  '🍖 红烧肉怎么做才能入口即化？',
  '🥬 如何炒出脆嫩的蔬菜？',
  '🍜 家常番茄鸡蛋汤的做法',
  '🔪 切洋葱不流泪有什么技巧？',
  '🌶 川菜为什么那么辣？',
  '🥘 用冰箱剩余食材能做什么菜？',
] as const

export const WELCOME_TAGS = [
  { label: '🍜 菜谱推荐' },
  { label: '🔪 烹饪技法' },
  { label: '🥗 营养搭配' },
  { label: '🛒 食材选购' },
] as const

export const AGENT_OFFLINE_TIP = '⚠️ Agent 未连接，请先启动后端服务'

export const AGENT_ONLINE_PLACEHOLDER = '问我任何做菜相关的问题... (Enter 发送，Shift+Enter 换行)'

export const DISCLAIMER = '厨神小助可能会犯错，重要食品安全问题请以权威资料为准'

export const ERROR_MSG_AGENT_OFFLINE =
  '❌ 请求失败：Agent 服务未连接\n\n请检查 Agent 服务是否已启动（cd cooking-agent && npm run dev）。'