/**
 * ============================================================
 * tools/recipe.ts — 菜谱查询工具
 * ============================================================
 *
 * 功能：根据菜名查询详细做法，支持按难度筛选。
 * 数据来源：内置菜谱数据库（生产环境可替换为数据库查询）。
 */

import type { Tool, ToolImpl } from './types'

// ─── 工具元信息 ───────────────────────────────────────────

export const recipe_tool: Tool = {
  name: 'search_recipe',
  description:
    '当用户询问某个菜名的具体做法、配方、步骤时使用。例如："红烧肉怎么做"、"宫保鸡丁的配方"、"番茄炒蛋步骤"。也适用于用户提供了部分食材，想了解这些食材能做什么菜的情况。',
  parameters: {
    type: 'object',
    properties: {
      dish_name: {
        type: 'string',
        description: '要查询的菜名，如：红烧肉、宫保鸡丁、番茄炒蛋、酸辣土豆丝',
      },
      difficulty: {
        type: 'string',
        enum: ['简单', '中等', '困难'],
        description: '用户期望的难度级别（可选，不填则返回所有难度的匹配结果）',
      },
    },
    required: ['dish_name'],
  },
}

// ─── 内置菜谱数据库（示例数据）───────────────────────────────

interface Recipe {
  name: string
  alias?: string[]
  difficulty: '简单' | '中等' | '困难'
  prep_time: string
  cook_time: string
  servings: string
  ingredients: string[]
  seasonings: string[]
  steps: string[]
  tips: string[]
  tags: string[]
}

const RECIPE_DB: Recipe[] = [
  {
    name: '红烧肉',
    alias: ['红烧五花肉', '东坡肉'],
    difficulty: '中等',
    prep_time: '20分钟',
    cook_time: '60分钟',
    servings: '4人份',
    ingredients: ['五花肉 500g', '冰糖 30g', '生姜 5片', '大葱 2段', '八角 2个', '桂皮 1小块'],
    seasonings: ['生抽 2汤匙', '老抽 1汤匙', '料酒 1汤匙', '盐 适量', '开水 适量'],
    steps: [
      '五花肉切成3cm见方的块，冷水下锅焯水，水开后撇去浮沫，捞出沥干',
      '锅中放少许油，下冰糖小火炒至焦糖色（枣红色），注意不要炒糊',
      '下入五花肉翻炒均匀，让每块肉都裹上糖色',
      '加入姜片、葱段、八角、桂皮炒香',
      '烹入料酒，加生抽、老抽，翻炒均匀',
      '加入开水没过肉块，大火烧开后转小火炖50分钟',
      '大火收汁，根据口味加盐调味，汤汁浓稠即可出锅',
    ],
    tips: [
      '炒糖色是红烧肉的关键，小火慢炒，糖色焦糖色时立即下肉',
      '五花肉要选肥瘦相间的，太瘦口感柴，太肥则油腻',
      '炖的时候一定要加开水，冷水会使肉收缩变硬',
    ],
    tags: ['硬菜', '下饭', '宴客'],
  },
  {
    name: '番茄炒蛋',
    alias: ['西红柿炒鸡蛋'],
    difficulty: '简单',
    prep_time: '5分钟',
    cook_time: '10分钟',
    servings: '2人份',
    ingredients: ['番茄 2个', '鸡蛋 3个', '小葱 1根'],
    seasonings: ['盐 适量', '糖 1小勺', '食用油 适量'],
    steps: [
      '番茄洗净，切成小块备用',
      '鸡蛋打散，加入少许盐搅匀',
      '锅中多放些油，油热后下鸡蛋液，炒至凝固后盛出',
      '锅中留底油，下番茄块翻炒出汁',
      '加入1小勺糖提鲜，中和番茄的酸味',
      '下炒好的鸡蛋，翻炒均匀',
      '加盐调味，撒葱花出锅',
    ],
    tips: [
      '番茄要炒出汁才好吃，可以加一点点水帮助出汁',
      '鸡蛋要炒嫩一些，不要炒太久',
      '加一点糖可以中和番茄的酸味，孩子更爱吃',
    ],
    tags: ['家常', '快手', '下饭'],
  },
  {
    name: '宫保鸡丁',
    alias: ['宫保鸡'],
    difficulty: '中等',
    prep_time: '15分钟',
    cook_time: '15分钟',
    servings: '3人份',
    ingredients: [
      '鸡胸肉 300g', '花生米 50g', '干辣椒 10个',
      '花椒 1小把', '大葱 2段', '姜末 5g', '蒜末 5g',
    ],
    seasonings: [
      '生抽 1汤匙', '醋 1汤匙', '糖 1汤匙',
      '料酒 半汤匙', '淀粉 1茶匙', '盐 适量',
    ],
    steps: [
      '鸡胸肉切丁，加入盐、料酒、淀粉抓匀，腌制15分钟',
      '调碗汁：生抽、醋、糖、淀粉混合均匀备用',
      '干辣椒切段，辣椒段和花椒备好',
      '锅中放油，小火炒香花生米至金黄酥脆，盛出备用',
      '锅中放油，下鸡丁滑炒至变色盛出',
      '锅中留底油，下干辣椒和花椒小火炒出香味（注意不要炒糊）',
      '下葱姜蒜末爆香，下鸡丁大火翻炒',
      '淋入碗汁快速翻炒，最后撒入花生米出锅',
    ],
    tips: [
      '干辣椒和花椒炒香即可，不要炒糊，否则发苦',
      '鸡丁腌制时加淀粉可以让肉质更嫩',
      '花生米最后放才能保持酥脆',
    ],
    tags: ['川菜', '经典', '下酒'],
  },
  {
    name: '酸辣土豆丝',
    alias: ['醋溜土豆丝'],
    difficulty: '简单',
    prep_time: '10分钟',
    cook_time: '5分钟',
    servings: '2人份',
    ingredients: ['土豆 2个', '干辣椒 5个', '花椒 10粒', '蒜末 适量', '葱花 适量'],
    seasonings: ['白醋 2汤匙', '盐 适量', '味精 少许'],
    steps: [
      '土豆去皮切成细丝（用擦丝器更方便），泡水洗去淀粉',
      '锅中烧水，水开后下土豆丝焯水30秒，捞出过凉水沥干',
      '锅中放油，下花椒和干辣椒小火炒香',
      '下蒜末爆香，下土豆丝大火快炒',
      '淋入白醋，加盐和味精调味',
      '撒葱花，出锅装盘',
    ],
    tips: [
      '土豆丝一定要泡水去淀粉，炒出来才爽脆',
      '焯水时间不要太长，30秒足够，保持脆感',
      '醋要早放，才能让土豆丝保持脆爽',
    ],
    tags: ['川菜', '家常', '素菜'],
  },
  {
    name: '可乐鸡翅',
    alias: ['可乐烧鸡翅'],
    difficulty: '简单',
    prep_time: '10分钟',
    cook_time: '25分钟',
    servings: '3人份',
    ingredients: ['鸡翅中 8个', '可乐 1罐（约330ml）', '姜片 5片', '八角 1个'],
    seasonings: ['生抽 2汤匙', '老抽 半汤匙', '料酒 1汤匙', '盐 适量'],
    steps: [
      '鸡翅洗净，两面各划两刀方便入味',
      '冷水下锅焯水，加料酒去腥，捞出沥干',
      '锅中放少许油，将鸡翅煎至两面金黄',
      '加入姜片、八角炒香',
      '加入可乐、生抽、老抽，大火烧开后转小火',
      '小火炖15分钟，期间翻面一次',
      '大火收汁，汤汁浓稠即可出锅',
    ],
    tips: [
      '可乐要用普通可乐，无糖可乐没有糖分做不出效果',
      '可乐本身有甜味，不需要额外加糖',
      '收汁时要不断翻动，避免糊锅',
    ],
    tags: ['家常', '孩子爱吃', '宴客'],
  },
  {
    name: '蒜蓉西兰花',
    alias: ['蒜蓉西兰花菜'],
    difficulty: '简单',
    prep_time: '10分钟',
    cook_time: '5分钟',
    servings: '2人份',
    ingredients: ['西兰花 1颗', '蒜末 3瓣的量', '枸杞（可选） 少量'],
    seasonings: ['盐 适量', '蚝油 1汤匙', '食用油 适量'],
    steps: [
      '西兰花掰成小朵，用盐水浸泡10分钟去农药和虫卵',
      '烧一锅水，加少许盐和几滴油，下西兰花焯水1分钟，捞出过凉水保持翠绿',
      '锅中放油，下蒜末小火炒出香味（注意不要炒糊）',
      '下西兰花快速翻炒，加蚝油和盐调味',
      '翻炒均匀后出锅装盘',
    ],
    tips: [
      '西兰花焯水时加盐和油，可以保持翠绿颜色',
      '蒜末一定要小火炒，大火容易炒糊变苦',
      '焯水不要太久，1分钟足够，保持脆嫩',
    ],
    tags: ['素菜', '健康', '快手'],
  },
  {
    name: '清蒸鲈鱼',
    alias: ['清蒸鲈鱼', '蒸鲈鱼'],
    difficulty: '中等',
    prep_time: '15分钟',
    cook_time: '12分钟',
    servings: '3人份',
    ingredients: ['鲈鱼 1条（约500g）', '葱丝 适量', '姜丝 适量', '红椒丝 少许（装饰）'],
    seasonings: ['蒸鱼豉油 2汤匙', '料酒 1汤匙', '热油 2汤匙', '盐 少许'],
    steps: [
      '鲈鱼处理干净，鱼身两面各划3刀，抹上盐和料酒腌制10分钟',
      '盘底铺上葱段和姜片，放上鲈鱼',
      '水开后放入蒸锅，大火蒸8-10分钟（根据鱼的大小调整）',
      '取出倒掉蒸出的汤汁（这一步去腥很关键）',
      '鱼身铺上葱丝、姜丝、红椒丝',
      '淋上蒸鱼豉油，浇上烧热的食用油激发香味',
    ],
    tips: [
      '蒸鱼一定要水开后再放鱼，大火蒸',
      '蒸好后倒掉汤汁是去腥的关键步骤，一定不要省',
      '判断鱼是否蒸熟：鱼眼变白凸出，用筷子能轻松穿透最厚处',
    ],
    tags: ['粤菜', '清淡', '宴客'],
  },
  {
    name: '麻婆豆腐',
    alias: ['麻婆豆腐'],
    difficulty: '中等',
    prep_time: '10分钟',
    cook_time: '10分钟',
    servings: '3人份',
    ingredients: ['嫩豆腐 1盒', '肉末 100g', '豆瓣酱 1汤匙', '花椒粉 适量', '葱姜蒜末 适量'],
    seasonings: ['生抽 1汤匙', '糖 半茶匙', '淀粉水 适量', '花椒油 少许'],
    steps: [
      '豆腐切成2cm见方的块，放入淡盐水中浸泡10分钟（去豆腥且不易碎）',
      '锅中放油，下肉末炒散炒香',
      '加入豆瓣酱小火炒出红油',
      '下葱姜蒜末炒香',
      '加入适量清水或高汤，下豆腐块，轻轻推动（不要大力翻动）',
      '加入生抽、糖调味，中火煮3分钟让豆腐入味',
      '淋入淀粉水勾芡，轻轻晃动锅使汤汁挂满豆腐',
      '出锅撒花椒粉，淋少许花椒油',
    ],
    tips: [
      '豆腐用盐水浸泡可以去豆腥，且在烹饪时不容易碎',
      '豆腐下锅后不要用铲子大力翻动，轻轻推动即可',
      '豆瓣酱是川菜的灵魂，要炒出红油香味才够正宗',
    ],
    tags: ['川菜', '下饭', '经典'],
  },
]

// ─── 工具实现 ─────────────────────────────────────────────

type RecipeArgs = { dish_name: string; difficulty?: string }

export const recipe_impl: ToolImpl<RecipeArgs> = async ({ dish_name, difficulty }) => {
  const startTime = Date.now()

  try {
    // 模糊搜索：匹配菜名、别名、或包含关键词
    const keyword = dish_name.trim()
    const results = RECIPE_DB.filter((r) => {
      const nameMatch = r.name.includes(keyword) || keyword.includes(r.name)
      const aliasMatch = r.alias?.some((a) => a.includes(keyword) || keyword.includes(a))
      return nameMatch || aliasMatch
    })

    // 按难度筛选（如果指定了）
    const filtered = difficulty
      ? results.filter((r) => r.difficulty === difficulty)
      : results

    if (filtered.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          message: `抱歉，数据库中暂未收录"${keyword}"的菜谱。`,
          suggestions: RECIPE_DB.slice(0, 3).map((r) => r.name),
          tip: '你可以尝试：红烧肉、番茄炒蛋、宫保鸡丁、可乐鸡翅 等常见菜式',
        },
        duration: Date.now() - startTime,
      }
    }

    // 返回首个匹配结果（及其余推荐）
    return {
      success: true,
      data: {
        found: true,
        count: filtered.length,
        recipes: filtered.map((r) => ({
          name: r.name,
          difficulty: r.difficulty,
          prep_time: r.prep_time,
          cook_time: r.cook_time,
          servings: r.servings,
          ingredients: r.ingredients,
          seasonings: r.seasonings,
          steps: r.steps,
          tips: r.tips,
          tags: r.tags,
        })),
        more_available: filtered.length > 1,
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      duration: Date.now() - startTime,
    }
  }
}
