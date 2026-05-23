/**
 * ============================================================
 * tools/safety.ts — 食品安全检测工具
 * ============================================================
 *
 * 功能：检查食材的食用安全注意事项，包括：
 *   - 食材相克（不能一起吃的搭配）
 *   - 处理不当的风险（如未煮熟的食材）
 *   - 特殊人群禁忌
 *   - 保存方法和保质期
 */

import type { Tool, ToolImpl } from './types'

export const safety_tool: Tool = {
  name: 'check_food_safety',
  description:
    '当用户询问某种食材能不能吃、怎么保存、有什么禁忌时使用。' +
    '也适用于检查食材搭配是否相克，或询问食材是否变质、过期的判断。' +
    '【优先级最高】：涉及食品安全的问题必须使用此工具，并主动发出安全警告。',
  parameters: {
    type: 'object',
    properties: {
      ingredient: {
        type: 'string',
        description: '食材名称，如：四季豆、鲜黄花菜、河豚',
      },
      context: {
        type: 'string',
        description: '使用场景或搭配食材，如："和羊肉一起吃"、"孕妇可以吃吗"（可选）',
      },
    },
    required: ['ingredient'],
  },
}

// ─── 食品安全知识库 ───────────────────────────────────────

interface SafetyEntry {
  risk_level: '危险' | '警告' | '注意' | '安全'
  title: string
  description: string
  symptoms?: string
  prevention: string
  storage?: string
  shelf_life?: string
  crowd?: string[]  // 禁忌人群
}

const SAFETY_DB: Record<string, SafetyEntry[]> = {
  '四季豆': [
    {
      risk_level: '危险',
      title: '未煮熟的四季豆有毒',
      description: '四季豆含有皂苷和血球凝集素，未煮熟会导致食物中毒。',
      symptoms: '恶心、呕吐、腹泻、头痛，一般在食用后1-5小时发作',
      prevention: '彻底煮熟至失去原有的生绿色，颜色变为暗绿色，完全软烂方可食用。炖煮至少10分钟以上。',
      crowd: ['所有人'],
    },
  ],
  '鲜黄花菜': [
    {
      risk_level: '危险',
      title: '鲜黄花菜含秋水仙碱',
      description: '鲜黄花菜含有秋水仙碱，进入人体后会氧化成二秋水仙碱，有毒。',
      symptoms: '恶心、呕吐、腹痛、腹泻，严重可导致脱水、电解质紊乱',
      prevention: '食用前用开水焯烫，再用清水浸泡2小时以上。推荐食用干黄花菜（无毒）。',
      crowd: ['所有人'],
    },
  ],
  '发芽土豆': [
    {
      risk_level: '危险',
      title: '发芽或发绿的马铃薯含龙葵碱',
      description: '发芽、变绿或发芽芽眼周围马铃薯的龙葵碱含量可增加数十倍，有剧毒。',
      symptoms: '口舌发麻、恶心、呕吐、腹泻，中毒严重可致死亡',
      prevention: '发芽超过1cm、发绿的土豆禁止食用。仅轻微发芽者需深挖芽眼，削皮后加醋烹调可降低毒性，但仍不推荐。',
      crowd: ['所有人'],
    },
  ],
  '河豚': [
    {
      risk_level: '危险',
      title: '河豚毒素致命',
      description: '河豚卵巢、肝脏、肾脏、血液等部位含河豚毒素，毒性是氰化钾的1000倍，目前无特效解药。',
      symptoms: '口唇发麻、四肢麻痹、呼吸困难、心跳骤停，0.5-3小时内发作',
      prevention: '⚠️ 严禁自行处理和食用！必须由持证专业厨师在正规机构制作。任何自行尝试均为极高风险行为。',
      crowd: ['所有人'],
    },
  ],
  '野生蘑菇': [
    {
      risk_level: '危险',
      title: '野生蘑菇中毒风险极高',
      description: '普通市民无法准确辨别野生蘑菇是否有毒，许多毒蘑菇与可食用蘑菇外观相似。',
      symptoms: '恶心、呕吐、腹泻（6-24小时内）、肝肾功能衰竭、死亡',
      prevention: '⚠️ 绝对不采集、不食用任何野生蘑菇！正规渠道购买食用菌。',
      crowd: ['所有人'],
    },
  ],
  '豆浆': [
    {
      risk_level: '警告',
      title: '生豆浆必须彻底煮沸',
      description: '生豆浆含有皂苷、胰蛋白酶抑制剂等抗营养因子，未煮沸会引起中毒。',
      symptoms: '恶心、呕吐、腹胀，一般较轻',
      prevention: '豆浆必须煮沸后继续煮3-5分钟。出现"假沸"（80℃起泡）不代表煮沸，应继续加热。',
      crowd: ['所有人'],
    },
  ],
  '隔夜菜': [
    {
      risk_level: '警告',
      title: '隔夜菜存在食品安全风险',
      description: '蔬菜中的硝酸盐会转化为亚硝酸盐，放置时间越长含量越高。',
      symptoms: '亚硝酸盐中毒：头晕、胸闷、嘴唇发紫',
      prevention: '绿叶菜建议现做现吃，不宜隔夜。肉类可以保存但建议低温冷藏不超过24小时，食用前彻底加热。',
      storage: '2-4℃冷藏',
      shelf_life: '蔬菜12小时内，肉类24小时内',
    },
  ],
  '鸡蛋': [
    {
      risk_level: '警告',
      title: '生鸡蛋和溏心蛋有沙门氏菌风险',
      description: '鸡蛋壳表面可能含沙门氏菌，母鸡卵巢形成时也可能感染。',
      symptoms: '腹痛、腹泻、发烧、头痛，一般6-72小时内发作',
      prevention: '鸡蛋彻底加热至蛋黄凝固（中心温度达71℃以上）。免疫低下者、老人、儿童应避免溏心蛋。',
      storage: '冷藏保存，尖头朝下放置',
      shelf_life: '冷藏约3-5周，生食不超过2周',
      crowd: ['孕妇', '婴幼儿', '老年人', '免疫力低下者'],
    },
  ],
  '螃蟹': [
    {
      risk_level: '警告',
      title: '死螃蟹和生螃蟹都有风险',
      description: '螃蟹死后体内细菌迅速繁殖，产生组胺，导致过敏性中毒。',
      symptoms: '脸红、头晕、心跳加快、恶心、呕吐、腹泻',
      prevention: '必须食用活螃蟹，现买现做。蒸煮至少20分钟以上确保彻底熟透。死蟹及闻到异味的螃蟹立即丢弃。',
      storage: '活蟹冷藏湿布覆盖，最多保存1天，不可冷冻',
    },
  ],
  '芒果': [
    {
      risk_level: '注意',
      title: '芒果过敏',
      description: '芒果含漆酚，部分人群接触果皮或果汁会引起过敏（接触性皮炎）。',
      symptoms: '嘴角红肿、瘙痒、皮疹，严重者口舌发麻肿胀',
      prevention: '初次食用少量尝试。削皮后切成小块食用，避免接触果皮和嘴唇周围的果肉。',
      crowd: ['过敏体质', '哮喘患者'],
    },
  ],
  '海鲜': [
    {
      risk_level: '警告',
      title: '海鲜过敏与高嘌呤',
      description: '海鲜是常见过敏原，且嘌呤含量高。',
      symptoms: '过敏：皮疹、瘙痒、口唇发麻、呼吸困难；高嘌呤：痛风发作',
      prevention: '过敏体质者慎食。痛风患者应避免贝类、虾蟹等高嘌呤海鲜。',
      crowd: ['海鲜过敏者', '痛风患者', '高尿酸血症患者'],
    },
  ],
  '蜂蜜': [
    {
      risk_level: '危险',
      title: '1岁以下婴儿禁止食用蜂蜜',
      description: '蜂蜜中可能含肉毒杆菌芽孢，婴儿肠道未发育完全，无法抑制其繁殖。',
      symptoms: '婴儿肉毒中毒：便秘、吮吸无力、肌肉松弛、呼吸衰竭',
      prevention: '1岁以下婴儿禁止食用任何形式的蜂蜜（包括含蜂蜜的食品）。1岁以上儿童和成人可正常食用。',
      crowd: ['1岁以下婴儿'],
    },
  ],
}

// ─── 食材相克库 ──────────────────────────────────────────

const ANTAGONISTIC_PAIRS: { a: string[]; b: string[]; reason: string; level: string }[] = [
  {
    a: ['螃蟹', '柿子'],
    b: ['螃蟹', '柿子'],
    reason: '螃蟹富含蛋白质，柿子含鞣酸，两者结合形成不易消化的硬块，引起肠胃不适。',
    level: '警告',
  },
  {
    a: ['菠菜', '豆腐'],
    b: ['菠菜', '豆腐'],
    reason: '菠菜含草酸，豆腐含钙，形成草酸钙沉淀，影响钙吸收。（但不会中毒，偶尔食用问题不大）',
    level: '注意',
  },
  {
    a: ['羊肉', '醋'],
    b: ['羊肉', '醋'],
    reason: '羊肉性温热，醋性寒凉，一温一寒可能引起胃部不适。',
    level: '注意',
  },
]

// ─── 工具实现 ─────────────────────────────────────────────

type SafetyArgs = { ingredient: string; context?: string }

export const safety_impl: ToolImpl<SafetyArgs> = async ({ ingredient, context }) => {
  const startTime = Date.now()

  const name = ingredient.trim()

  // ── 查询食材安全条目 ──
  const safetyEntries = SAFETY_DB[name] ?? []

  // ── 检查相克搭配 ──
  const conflicts: typeof ANTAGONISTIC_PAIRS = []
  if (context) {
    for (const pair of ANTAGONISTIC_PAIRS) {
      const aMatch = pair.a.some((a) => name.includes(a) || a.includes(name))
      const bMatch = pair.b.some((b) => context.includes(b) || b.includes(context))
      if (aMatch && bMatch) {
        conflicts.push(pair)
      }
    }
  }

  // ── 通用保存建议（未在数据库中的食材）───
  const defaultStorage = {
    '肉类': '2-4℃冷藏最多3天，冷冻可保存3-6个月',
    '蔬菜': '2-4℃冷藏，叶菜用湿纸巾包裹根部，3-5天内食用',
    '鱼类': '2-4℃冷藏1-2天，冷冻3-6个月',
    '禽类': '2-4℃冷藏2天内，冷冻9-12个月',
  }

  let generalStorage: string | null = null
  for (const [category, advice] of Object.entries(defaultStorage)) {
    if (name.includes(category)) {
      generalStorage = advice
      break
    }
  }

  if (safetyEntries.length === 0 && conflicts.length === 0) {
    return {
      success: true,
      data: {
        found: false,
        ingredient: name,
        general_advice: generalStorage ?? '请参考食材包装上的保存说明，新鲜食材尽快食用。',
        tip: `未在数据库中找到"${name}"的专项安全记录，如有疑虑建议查阅权威资料或咨询专业人士。`,
      },
      duration: Date.now() - startTime,
    }
  }

  return {
    success: true,
    data: {
      found: true,
      ingredient: name,
      safety_entries: safetyEntries,
      antagonistic_warnings: conflicts.map((c) => ({
        pair: `${name} + ${context ?? '未知食材'}`,
        reason: c.reason,
        level: c.level,
      })),
      general_storage: generalStorage,
    },
    duration: Date.now() - startTime,
  }
}
