/**
 * ============================================================
 * SkillLoader — 从 .md 文件加载 Skill 定义
 * ============================================================
 *
 * 工作原理：
 *   启动时扫描 skills/ 目录，解析所有 .md 文件
 *   提取元数据、角色设定、工具引用、回答格式、触发词
 *   供 prompts.ts 构建系统提示词使用
 *
 * .md 文件结构约定（严格按 ## 二级标题分节）：
 *   ## 元数据          → name / trigger / priority
 *   ## 角色设定        → Agent 的行为规范
 *   ## 工具            → 使用的工具列表
 *   ## 回答格式        → 输出模板
 *   ## 触发关键词      → 触发该 Skill 的关键词
 *   ## 禁忌/注意事项   → 行为边界（可选）
 */

import fs from 'fs'
import path from 'path'

// ─── 类型定义 ────────────────────────────────────────────

export interface Skill {
  /** 唯一标识，与 .md 文件名一致 */
  name: string
  /** 中文显示名称 */
  label: string
  /** 触发关键词（逗号分隔） */
  trigger: string
  /** 优先级：数值越小优先级越高 */
  priority: number
  /** Agent 角色行为规范 */
  roleInstruction: string
  /** 工具列表（逗号分隔） */
  tools: string[]
  /** 回答格式模板 */
  responseFormat: string
  /** 触发关键词列表 */
  triggerKeywords: string[]
  /** 禁忌/注意事项（可选） */
  warnings?: string
  /** 原始 .md 文件内容（用于调试） */
  rawContent: string
}

// ─── 核心解析函数 ────────────────────────────────────────

/**
 * 从单个 .md 文件内容中提取 Skill 信息
 */
function parseSkillMarkdown(name: string, content: string): Skill {
  const lines = content.split('\n')

  // 提取 ## 元数据 区块
  const metaSection = extractSection(lines, '元数据')
  const meta = parseMetadata(metaSection)

  // 提取其他区块
  const roleSection = extractSection(lines, '角色设定')
  const toolsSection = extractSection(lines, '工具')
  const formatSection = extractSection(lines, '回答格式')
  const triggerSection = extractSection(lines, '触发关键词')
  const warningsSection = extractSection(lines, '禁忌') || extractSection(lines, '注意事项')

  // 解析工具列表
  const tools = parseToolList(toolsSection)

  return {
    name: meta.name || name.replace(/\.md$/, ''),
    label: meta.label || name,
    trigger: meta.trigger || '',
    priority: parseInt(meta.priority || '5', 10),
    roleInstruction: roleSection.trim(),
    tools,
    responseFormat: formatSection.trim(),
    triggerKeywords: parseKeywordList(triggerSection),
    warnings: warningsSection?.trim(),
    rawContent: content,
  }
}

/**
 * 提取指定标题下的内容块
 */
function extractSection(lines: string[], title: string): string {
  const startIdx = lines.findIndex(
    (l) => l.trim() === `## ${title}` || l.trim() === `##${title}`,
  )
  if (startIdx === -1) return ''

  const endIdx = lines.findIndex(
    (l, i) => i > startIdx && l.startsWith('## '),
  )

  return lines.slice(startIdx + 1, endIdx === -1 ? lines.length : endIdx).join('\n')
}

/**
 * 解析元数据区块（key: value 格式）
 */
function parseMetadata(section: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = section.split('\n')
  for (const line of lines) {
    const match = line.match(/^-\s+\*\*(\w+)\*\*:\s*(.+)/)
    if (match) {
      result[match[1].toLowerCase()] = match[2].trim()
    }
  }
  return result
}

/**
 * 解析工具列表（表格格式或列表格式）
 */
function parseToolList(section: string): string[] {
  const tools: string[] = []
  const lines = section.split('\n')

  for (const line of lines) {
    // 表格行：| tool_name | 用途 |
    const tableMatch = line.match(/^\|\s*(\w+)\s*\|/)
    if (tableMatch) {
      tools.push(tableMatch[1])
      continue
    }
    // 列表行：- tool_name
    const listMatch = line.match(/^-\s+(\w+)/)
    if (listMatch) {
      tools.push(listMatch[1])
    }
  }
  return [...new Set(tools)] // 去重
}

/**
 * 解析触发关键词列表
 */
function parseKeywordList(section: string): string[] {
  if (!section) return []
  return section
    .split(/[，,\n]/)
    .map((k) => k.trim().replace(/^[-*]\s*/, ''))
    .filter((k) => k.length > 0)
}

// ─── Skill 注册表 ────────────────────────────────────────

let _loaded = false
let _skills: Skill[] = []
let _skillsByName: Map<string, Skill> = new Map()
let _globalTriggers: Map<string, string> = new Map() // triggerWord → skillName

/**
 * 加载所有 .md Skill 文件（幂等，只加载一次）
 */
export function loadSkills(): Skill[] {
  if (_loaded) return _skills

  const skillsDir = path.join(__dirname, '../skills')
  if (!fs.existsSync(skillsDir)) {
    console.warn(`[SkillLoader] ⚠️ skills/ 目录不存在：${skillsDir}`)
    return []
  }

  const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'))

  if (files.length === 0) {
    console.warn('[SkillLoader] ⚠️ skills/ 目录为空，未找到任何 .md Skill 文件')
    return []
  }

  console.info(`[SkillLoader] 📂 发现 ${files.length} 个 Skill 文件`)

  for (const file of files) {
    const name = file.replace(/\.md$/, '')
    const filePath = path.join(skillsDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    try {
      const skill = parseSkillMarkdown(name, content)
      _skills.push(skill)
      _skillsByName.set(skill.name, skill)

      // 注册触发词
      for (const trigger of skill.triggerKeywords) {
        _globalTriggers.set(trigger, skill.name)
      }

      console.info(`[SkillLoader] ✅ 加载 Skill：${skill.name}（优先级 ${skill.priority}，${skill.tools.length} 个工具）`)
    } catch (err) {
      console.error(`[SkillLoader] ❌ 解析失败 ${file}：${(err as Error).message}`)
    }
  }

  // 按优先级排序（低优先级数字先执行）
  _skills.sort((a, b) => a.priority - b.priority)

  _loaded = true
  console.info(
    `[SkillLoader] ✅ 加载完成，共 ${_skills.length} 个 Skill，已注册 ${_globalTriggers.size} 个触发词`,
  )

  return _skills
}

// ─── 查询 API ────────────────────────────────────────────

/** 获取所有已加载的 Skills */
export function getAllSkills(): Skill[] {
  return _skills
}

/** 按 name 获取单个 Skill */
export function getSkill(name: string): Skill | undefined {
  return _skillsByName.get(name)
}

/** 获取所有 Skill 的元数据（用于调试） */
export function getSkillsSummary(): Array<{ name: string; label: string; priority: number; tools: string[] }> {
  return _skills.map((s) => ({
    name: s.name,
    label: s.label,
    priority: s.priority,
    tools: s.tools,
  }))
}

/** 根据触发词查找对应的 Skill */
export function matchSkill(trigger: string): Skill | undefined {
  return _skillsByName.get(_globalTriggers.get(trigger) ?? '') ?? undefined
}

/** 获取全局触发词列表（用于注入 system prompt） */
export function getAllTriggerWords(): string[] {
  return Array.from(_globalTriggers.keys())
}

/** 获取所有 Skill 的角色指令（拼接成完整 system prompt 片段） */
export function buildSkillsSystemBlock(): string {
  if (_skills.length === 0) return ''

  return (
    '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '📚 你拥有以下专业技能，可按需调用：\n' +
    _skills
      .map(
        (s) =>
          `\n【${s.label}】\n` +
          `${s.roleInstruction}\n` +
          (s.tools.length > 0 ? `可用工具：${s.tools.join('、')}\n` : '') +
          `输出格式：\n${s.responseFormat}`,
      )
      .join('\n\n') +
    '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  )
}
