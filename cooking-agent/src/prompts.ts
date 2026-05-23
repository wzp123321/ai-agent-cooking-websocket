/**
 * ============================================================
 * prompts.ts — 系统提示词构建模块
 * ============================================================
 *
 * ⚠️ 重要变更（2026-05-15）：
 *   Skill 定义已迁移至 skills/ 目录的 .md 文件中。
 *   本模块现在从 SkillLoader 动态读取 Skill 内容，
 *   每次调用 buildSystemMessage() 时自动重新构建，
 *   无需手动维护工具描述和角色设定。
 *
 * .md 文件结构规范：
 *   ## 元数据          → name / trigger / priority
 *   ## 角色设定        → Agent 行为规范
 *   ## 工具            → 使用哪些工具
 *   ## 回答格式        → 输出模板
 *   ## 触发关键词      → 触发该 Skill 的关键词
 *   ## 禁忌/注意事项   → 行为边界（可选）
 */

import {
  loadSkills,
  buildSkillsSystemBlock,
  getAllTriggerWords,
  getSkillsSummary,
} from './loader'
import { TOOL_LIST } from './tools'
import type { ToolParameters } from './tools/types'

// ─── Agent 基础角色设定 ──────────────────────────────────

/**
 * Agent 基础人设（固定部分，不会写在 .md 中）
 */
const BASE_SYSTEM_PROMPT = `你是【小厨神】，一位热情、专业、幽默的中华料理大师。

你的特点：
- 🍳 精通川、粤、鲁、苏、浙、闽、湘、徽八大菜系
- 📖 熟悉各类食材的营养价值和搭配禁忌
- 🔪 掌握炒、煎、炸、蒸、炖、焖、烤、溜、拌、腌等烹饪技法
- 💡 善于根据用户现有食材给出创意菜谱建议
- ⚠️ 始终将食品安全放在第一位

你的语言风格：
- 亲切自然，像和朋友聊天
- 善用 emoji 增强表达（但不过度）
- 回答简洁有力，不废话
- 遇到不确定的问题，诚实说"不确定"而不是瞎猜

【安全红线】涉及食材中毒、过敏、变质等安全问题，必须主动警告并建议就医。`

// ─── 推理指令（固定，LLM 执行工具调用的行为规范）────────

export const REACT_INSTRUCTIONS = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 推理与行动指南

你正在使用 ReAct（Reasoning + Acting）推理模式：
1. 理解用户问题，判断是否需要调用工具
2. 需要调用工具时，一次调用可以发起多个工具请求（并行调用）
3. 收到工具结果后，继续推理直到有足够信息给出完整回答
4. 始终按照对应 Skill 的【回答格式】输出
5. 工具调用失败时，直接基于已有知识回答，并在回答末尾标注"（工具调用失败，内容仅供参考）"

【何时必须调用工具】
- 用户询问具体菜谱做法 → 调用 search_recipe
- 用户询问热量/营养 → 调用 calculate_nutrition
- 用户询问食品安全/相克 → 调用 check_ingredient_safe / check_food_conflict
- 用户询问烹饪技法 → 调用 explain_technique
- 用户说明食材后询问能做什么 → 调用 suggest_dishes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

// ─── 公开给外部调用的函数 ────────────────────────────────

/**
 * 构建完整的系统消息
 * 每次调用时重新从 .md 读取，保证热更新能力
 */
export function buildSystemMessage(): string {
  // 触发 SkillLoader 加载（首次调用时加载，之后幂等）
  loadSkills()

  // 拼接完整系统提示词
  const skillsBlock = buildSkillsSystemBlock()
  const triggerWords = getAllTriggerWords()
  const toolsBlock = buildToolsBlock()
  const summary = getSkillsSummary()

  const timestamp = new Date().toLocaleString('zh-CN')

  return [
    BASE_SYSTEM_PROMPT,
    skillsBlock,
    REACT_INSTRUCTIONS,
    toolsBlock,
    `\n📌 当前已注册触发词（用户输入含以下词时触发对应 Skill）：`,
    triggerWords.length > 0
      ? triggerWords.map((w) => `「${w}」`).join('、')
      : '（暂无）',
    `\n📊 Skill 状态：${summary.length} 个已加载 | 时间：${timestamp}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * 构建工具描述块（供 LLM 理解可调用工具）
 * 与 skills/ 的 .md 文件保持同步
 */
function buildToolsBlock(): string {
  if (TOOL_LIST.length === 0) return ''

  const toolDescriptions = TOOL_LIST.map((tool) => {
    const params = buildParameterDescription(tool.parameters)
    return `【${tool.name}】${tool.description}\n参数：${params}`
  }).join('\n\n')

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 可用工具列表（Function Calling）

${toolDescriptions}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

/**
 * 将 JSON Schema parameters 转成人类可读的参数说明
 */
function buildParameterDescription(params: ToolParameters): string {
  const props = params.properties ?? {}
  const required = params.required ?? []

  return Object.entries(props)
    .map(([key, val]) => {
      const req = required.includes(key) ? '（必填）' : '（可选）'
      const typeStr = val.type ? `[${val.type}]` : ''
      const enumStr = val.enum ? `枚举：${val.enum.join('/')}` : ''
      const desc = val.description ?? ''
      return `${key} ${typeStr} ${req} - ${desc} ${enumStr}`.trim()
    })
    .join(' | ')
}
