import type { Tool, ToolImpl } from './types'
import { getKnowledgeBase } from '../knowledge'

export const knowledge_tool: Tool = {
  name: 'search_knowledge',
  description:
    '搜索烹饪知识库，获取菜谱、烹饪技巧、食材知识等信息。当用户询问具体菜谱做法、烹饪技巧、食材处理方法、调味知识、厨房安全等问题时使用。可以搜索菜谱名称、食材、技巧关键词等。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，如：红烧肉、炒糖色、油温判断、刀工、食材保鲜',
      },
      category: {
        type: 'string',
        enum: ['recipe', 'skill', 'knowledge', 'all'],
        description: '搜索范围：recipe(菜谱)、skill(技能指南)、knowledge(烹饪知识)、all(全部)',
      },
    },
    required: ['query'],
  },
}

export const knowledge_impl: ToolImpl<{ query: string; category?: string }> = async (args) => {
  const start = Date.now()
  const { query, category } = args

  const kb = getKnowledgeBase()
  const results = kb.search(query, 5)

  let filtered = results
  if (category && category !== 'all') {
    filtered = results.filter((r) => r.document.category === category)
  }

  if (filtered.length === 0) {
    return {
      success: false,
      error: `未找到与「${query}」相关的知识。请尝试更具体的关键词，或换个说法。`,
      duration: Date.now() - start,
    }
  }

  return {
    success: true,
    data: {
      query,
      total_results: filtered.length,
      results: filtered.map((r) => ({
        title: r.document.title,
        category: r.document.category,
        score: r.score,
        content: r.document.content.slice(0, 500) + (r.document.content.length > 500 ? '…' : ''),
        highlights: r.highlights,
        tags: r.document.tags,
      })),
    },
    duration: Date.now() - start,
  }
}