/**
 * ============================================================
 * tools/suggest.ts — 食材推荐菜品工具
 * ============================================================
 *
 * 功能：根据用户提供的食材库存，推荐可以做的菜品。
 * 数据来源：内置菜谱数据库 + 食材匹配算法。
 */

import type { Tool, ToolImpl } from './types'

export const suggest_tool: Tool = {
  name: 'suggest_dishes',
  description:
    '当用户说"我冰箱里有XX、XX"、"有什么推荐"、"只有XX食材能做什么"时使用。' +
    '也适用于用户犹豫不知道做什么菜时的推荐场景。',
  parameters: {
    type: 'object',
    properties: {
      available_ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: '用户手头拥有的食材列表，如：["鸡蛋", "番茄", "土豆"]',
      },
      meal_type: {
        type: 'string',
        enum: ['早餐', '午餐', '晚餐', '宵夜'],
        description: '餐次类型，影响推荐（默认不区分）',
      },
      cuisine_style: {
        type: 'string',
        description: '偏好的菜系，如：川菜、粤菜、家常（可选）',
      },
      cooking_level: {
        type: 'string',
        enum: ['简单', '中等', '困难'],
        description: '用户期望的烹饪难度（可选）',
      },
      people_count: {
        type: 'number',
        description: '用餐人数（可选，影响份量建议）',
      },
    },
    required: ['available_ingredients'],
  },
}

// ─── 食材别名映射（标准化匹配）────────────────────────────

const INGREDIENT_ALIAS: Record<string, string[]> = {
  '番茄': ['西红柿', '小番茄'],
  '土豆': ['马铃薯', '洋芋'],
  '鸡胸': ['鸡胸肉', '鸡大胸'],
  '鸡腿': ['鸡腿肉', '鸡小腿'],
  '黄瓜': ['青瓜'],
  '大葱': ['葱', '小葱', '香葱', '葱段'],
  '胡萝卜': ['红萝卜'],
  '白菜': ['大白菜', '小白菜'],
  '生抽': ['酱油'],
  '老抽': ['红烧酱油'],
  '糖': ['白糖', '冰糖', '砂糖'],
  '蒜': ['大蒜', '蒜头', '蒜末'],
}

// ─── 菜品数据库 ──────────────────────────────────────────

interface DishEntry {
  name: string
  alias?: string[]
  core_ingredients: string[]   // 核心主料（必须有）
  optional_ingredients: string[] // 可选配料（加分项）
  tags: string[]
  difficulty: '简单' | '中等' | '困难'
  cuisine?: string
}

const DISH_DB: DishEntry[] = [
  {
    name: '番茄炒蛋',
    alias: ['西红柿炒鸡蛋'],
    core_ingredients: ['番茄', '鸡蛋'],
    optional_ingredients: ['大葱', '糖', '盐'],
    tags: ['家常', '快手', '下饭', '素菜'],
    difficulty: '简单',
  },
  {
    name: '蛋炒饭',
    alias: ['蛋炒饭', '蛋炒米'],
    core_ingredients: ['米饭', '鸡蛋'],
    optional_ingredients: ['大葱', '火腿', '胡萝卜', '盐'],
    tags: ['家常', '快手', '主食'],
    difficulty: '简单',
  },
  {
    name: '酸辣土豆丝',
    core_ingredients: ['土豆'],
    optional_ingredients: ['干辣椒', '花椒', '大葱', '白醋', '盐'],
    tags: ['川菜', '家常', '素菜', '下饭'],
    difficulty: '简单',
  },
  {
    name: '蒜蓉西兰花',
    core_ingredients: ['西兰花'],
    optional_ingredients: ['蒜', '盐', '蚝油'],
    tags: ['素菜', '健康', '快手'],
    difficulty: '简单',
  },
  {
    name: '黄瓜拌凉粉',
    core_ingredients: ['黄瓜'],
    optional_ingredients: ['蒜', '醋', '盐', '香油', '辣椒油'],
    tags: ['凉菜', '夏天', '开胃'],
    difficulty: '简单',
  },
  {
    name: '可乐鸡翅',
    core_ingredients: ['鸡翅'],
    optional_ingredients: ['可乐', '姜', '盐', '生抽'],
    tags: ['家常', '孩子爱吃', '宴客'],
    difficulty: '简单',
  },
  {
    name: '宫保鸡丁',
    alias: ['宫保鸡'],
    core_ingredients: ['鸡胸', '花生米'],
    optional_ingredients: ['干辣椒', '花椒', '大葱', '黄瓜', '胡萝卜'],
    tags: ['川菜', '经典', '下酒'],
    difficulty: '中等',
  },
  {
    name: '红烧肉',
    core_ingredients: ['五花肉'],
    optional_ingredients: ['冰糖', '姜', '大葱', '八角', '桂皮', '生抽', '老抽'],
    tags: ['硬菜', '下饭', '宴客'],
    difficulty: '中等',
  },
  {
    name: '麻婆豆腐',
    core_ingredients: ['豆腐'],
    optional_ingredients: ['肉末', '豆瓣酱', '花椒', '蒜', '大葱'],
    tags: ['川菜', '下饭', '经典'],
    difficulty: '中等',
  },
  {
    name: '清蒸鲈鱼',
    core_ingredients: ['鱼肉'],
    optional_ingredients: ['大葱', '姜', '蒸鱼豉油', '盐'],
    tags: ['粤菜', '清淡', '宴客', '健康'],
    difficulty: '中等',
  },
  {
    name: '土豆烧鸡块',
    core_ingredients: ['土豆', '鸡肉'],
    optional_ingredients: ['姜', '大葱', '生抽', '老抽', '八角'],
    tags: ['家常', '硬菜', '下饭'],
    difficulty: '中等',
  },
  {
    name: '胡萝卜炒肉丝',
    core_ingredients: ['胡萝卜'],
    optional_ingredients: ['猪肉', '大葱', '蒜', '生抽'],
    tags: ['家常', '素菜为主', '护眼'],
    difficulty: '简单',
  },
  {
    name: '番茄蛋花汤',
    core_ingredients: ['番茄', '鸡蛋'],
    optional_ingredients: ['大葱', '盐', '香油'],
    tags: ['汤', '家常', '快手', '开胃'],
    difficulty: '简单',
  },
  {
    name: '鸡蛋饼',
    core_ingredients: ['鸡蛋'],
    optional_ingredients: ['大葱', '盐', '面粉', '油'],
    tags: ['早餐', '主食', '快手'],
    difficulty: '简单',
  },
  {
    name: '黄瓜炒鸡蛋',
    core_ingredients: ['黄瓜', '鸡蛋'],
    optional_ingredients: ['大葱', '盐'],
    tags: ['家常', '快手', '清淡'],
    difficulty: '简单',
  },
  {
    name: '蒜蓉蒸虾',
    core_ingredients: ['虾'],
    optional_ingredients: ['蒜', '大葱', '盐', '蒸鱼豉油'],
    tags: ['宴客', '鲜', '粤菜'],
    difficulty: '中等',
  },
]

// ─── 工具实现 ─────────────────────────────────────────────

type SuggestArgs = {
  available_ingredients: string[]
  meal_type?: '早餐' | '午餐' | '晚餐' | '宵夜'
  cuisine_style?: string
  cooking_level?: '简单' | '中等' | '困难'
  people_count?: number
}

export const suggest_impl: ToolImpl<SuggestArgs> = async ({
  available_ingredients,
  meal_type,
  cuisine_style,
  cooking_level,
  people_count = 2,
}) => {
  const startTime = Date.now()

  // ── 标准化食材名称 ──
  const normalize = (name: string): string[] => {
    const result = [name]
    for (const [canonical, aliases] of Object.entries(INGREDIENT_ALIAS)) {
      if (aliases.some((a) => name.includes(a) || a.includes(name))) {
        result.push(canonical)
      }
    }
    return result
  }

  const normalizedAvailable = available_ingredients.flatMap(normalize)

  // ── 匹配算法 ──
  const scored = DISH_DB.map((dish) => {
    let score = 0
    const matched: string[] = []
    const missing: string[] = []

    // 核心食材匹配
    for (const core of dish.core_ingredients) {
      const found = normalizedAvailable.some((ai) => core.includes(ai) || ai.includes(core))
      if (found) {
        score += 10
        matched.push(core)
      } else {
        score -= 5
        missing.push(core)
      }
    }

    // 可选配料匹配（加分项）
    for (const opt of dish.optional_ingredients) {
      if (normalizedAvailable.some((ai) => opt.includes(ai) || ai.includes(opt))) {
        score += 2
      }
    }

    // 按难度筛选
    if (cooking_level && dish.difficulty !== cooking_level) {
      score -= 20
    }

    // 按菜系筛选
    if (cuisine_style && !dish.cuisine?.includes(cuisine_style)) {
      score -= 5
    }

    // 按餐次筛选
    let mealHint = ''
    if (meal_type === '早餐' && dish.tags.includes('早餐')) {
      score += 5
      mealHint = '适合早餐'
    }

    return {
      ...dish,
      score,
      matched_core: matched,
      missing_core: missing,
      meal_hint: mealHint,
    }
  })

  // 排序：分数高的在前
  scored.sort((a, b) => b.score - a.score)

  const top = scored.slice(0, 5).filter((d) => d.score > 0)

  if (top.length === 0) {
    return {
      success: true,
      data: {
        available_ingredients,
        message: `根据您提供的食材 ${available_ingredients.join('、')}，数据库暂未找到匹配菜谱`,
        suggestions: scored.slice(0, 3).map((d) => ({
          name: d.name,
          reason: `需要：${d.core_ingredients.join('、')}`,
        })),
      },
      duration: Date.now() - startTime,
    }
  }

  // 推荐度评估
  const recommend = top.map((d, idx) => {
    let level: '完美匹配' | '高度推荐' | '可以考虑' = '可以考虑'
    if (d.score >= 15 && d.missing_core.length === 0) level = '完美匹配'
    else if (d.score >= 8) level = '高度推荐'

    return {
      rank: idx + 1,
      name: d.name,
      match_level: level,
      core_match: d.matched_core,
      core_missing: d.missing_core,
      optional_available: d.optional_ingredients.filter((opt) =>
        normalizedAvailable.some((ai) => opt.includes(ai) || ai.includes(opt)),
      ),
      optional_missing: d.optional_ingredients.filter(
        (opt) => !normalizedAvailable.some((ai) => opt.includes(ai) || ai.includes(opt)),
      ),
      difficulty: d.difficulty,
      tags: d.tags,
      portion_hint: people_count > 1 ? `约${people_count}人份` : '1-2人份',
      meal_hint: d.meal_hint || (d.tags.includes('快手') ? '操作简单' : ''),
    }
  })

  return {
    success: true,
    data: {
      available_ingredients,
      match_count: top.length,
      recommendations: recommend,
      tip: top[0]
        ? `最佳推荐"${top[0].name}"，您已有全部核心食材！`
        : '建议补充一些基础调料（盐、酱油、葱姜蒜）',
    },
    duration: Date.now() - startTime,
  }
}
