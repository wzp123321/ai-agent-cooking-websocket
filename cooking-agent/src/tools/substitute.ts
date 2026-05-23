import type { Tool, ToolImpl } from './types'

export const substitute_tool: Tool = {
  name: 'suggest_substitute',
  description:
    '当用户询问某个食材或调料的替代方案时使用。例如："没有料酒能用什么代替"、"不吃鸡蛋能用什么替代"、"家里没有生抽了怎么办"。也适用于用户有饮食限制需要替换特定食材的场景。',
  parameters: {
    type: 'object',
    properties: {
      ingredient: {
        type: 'string',
        description: '需要被替换的食材或调料名称，如：料酒、鸡蛋、生抽、黄油、牛奶',
      },
      reason: {
        type: 'string',
        description: '替换原因（可选），如：过敏、没有、不喜欢、素食、生酮。不填则返回所有替代方案。',
      },
    },
    required: ['ingredient'],
  },
}

interface Substitute {
  name: string
  ratio: string
  note: string
  best_for: string[]
}

interface SubstituteEntry {
  ingredient: string
  category: string
  substitutes: Substitute[]
}

const SUBSTITUTE_DB: SubstituteEntry[] = [
  {
    ingredient: '料酒',
    category: '调料',
    substitutes: [
      { name: '啤酒', ratio: '1:1', note: '去腥效果相近，略带麦香，适合红烧类', best_for: ['红烧', '炖煮'] },
      { name: '黄酒', ratio: '1:1', note: '最接近料酒，去腥增香效果更好', best_for: ['所有'] },
      { name: '白葡萄酒', ratio: '1:1', note: '适合海鲜和白肉，去腥同时增添果香', best_for: ['海鲜', '鸡肉'] },
      { name: '姜汁+水', ratio: '1:2', note: '无酒精替代，去腥效果稍弱，需多加姜', best_for: ['清淡菜'] },
    ],
  },
  {
    ingredient: '生抽',
    category: '调料',
    substitutes: [
      { name: '普通酱油', ratio: '1:1', note: '咸度相近，颜色稍深，不影响口味', best_for: ['所有'] },
      { name: '蒸鱼豉油', ratio: '1:1', note: '更鲜美，但咸度略低，需适量加盐', best_for: ['蒸菜', '凉拌'] },
      { name: '椰子酱油', ratio: '1:1', note: '无大豆配方，适合大豆过敏者，微甜', best_for: ['过敏替代'] },
    ],
  },
  {
    ingredient: '老抽',
    category: '调料',
    substitutes: [
      { name: '生抽+焦糖色', ratio: '2:1', note: '生抽加少量焦糖色（或炒糖色）可模拟老抽上色效果', best_for: ['红烧'] },
      { name: '蚝油', ratio: '1:1', note: '颜色相近但更鲜，咸度不同需调整盐量', best_for: ['炒菜'] },
    ],
  },
  {
    ingredient: '蚝油',
    category: '调料',
    substitutes: [
      { name: '生抽+糖+香菇粉', ratio: '1:0.5:0.5', note: '模拟蚝油的鲜甜，素食可用', best_for: ['素食', '炒菜'] },
      { name: '鱼露', ratio: '1:0.5', note: '鲜味更浓但偏咸，用量减半', best_for: ['海鲜', '炒菜'] },
    ],
  },
  {
    ingredient: '醋',
    category: '调料',
    substitutes: [
      { name: '柠檬汁', ratio: '1:1', note: '酸味清新，适合凉拌和海鲜', best_for: ['凉拌', '海鲜'] },
      { name: '白葡萄酒醋', ratio: '1:1', note: '酸度相近，风味更柔和', best_for: ['沙拉', '西餐'] },
      { name: '苹果醋', ratio: '1:1', note: '略带果香，适合糖醋类菜品', best_for: ['糖醋', '凉拌'] },
    ],
  },
  {
    ingredient: '鸡蛋',
    category: '食材',
    substitutes: [
      { name: '豆腐', ratio: '100g:1个', note: '口感接近，适合炒蛋类菜品，素食可用', best_for: ['炒蛋', '素食'] },
      { name: '香蕉泥', ratio: '半根:1个', note: '烘焙中替代鸡蛋，增加甜味和湿度', best_for: ['烘焙'] },
      { name: '亚麻籽粉+水', ratio: '1汤匙+3汤匙水:1个', note: '静置5分钟成胶状，烘焙专用替代', best_for: ['烘焙', '素食'] },
      { name: '鹰嘴豆水', ratio: '3汤匙:1个', note: '打发后可替代蛋白，适合烘焙', best_for: ['烘焙', '素食'] },
    ],
  },
  {
    ingredient: '牛奶',
    category: '食材',
    substitutes: [
      { name: '豆浆', ratio: '1:1', note: '最接近牛奶，蛋白质含量高，适合日常替代', best_for: ['所有', '素食'] },
      { name: '椰奶', ratio: '1:1', note: '口感浓郁，适合咖喱和甜品，热量较高', best_for: ['咖喱', '甜品'] },
      { name: '杏仁奶', ratio: '1:1', note: '低卡路里，适合减脂人群，口感偏淡', best_for: ['低卡', '烘焙'] },
      { name: '燕麦奶', ratio: '1:1', note: '口感醇厚，适合咖啡和烘焙', best_for: ['咖啡', '烘焙'] },
      { name: '水+黄油', ratio: '1杯水+2汤匙黄油', note: '紧急替代，口感会差一些', best_for: ['紧急'] },
    ],
  },
  {
    ingredient: '黄油',
    category: '食材',
    substitutes: [
      { name: '植物油', ratio: '1:0.8', note: '炒菜可用，烘焙会影响口感', best_for: ['炒菜'] },
      { name: '椰子油', ratio: '1:1', note: '烘焙中替代黄油，略带椰香', best_for: ['烘焙', '素食'] },
      { name: '猪油', ratio: '1:1', note: '中式烹饪最佳替代，起酥效果好', best_for: ['中式', '烘焙'] },
      { name: '牛油果泥', ratio: '1:1', note: '健康替代，适合烘焙，会带绿色', best_for: ['烘焙', '健康'] },
    ],
  },
  {
    ingredient: '淀粉',
    category: '调料',
    substitutes: [
      { name: '面粉', ratio: '1:1.5', note: '勾芡效果稍差，汤汁略浑浊', best_for: ['勾芡'] },
      { name: '藕粉', ratio: '1:1', note: '勾芡效果极好，汤汁清亮', best_for: ['勾芡', '汤羹'] },
      { name: '玉米淀粉', ratio: '1:1', note: '最常用替代，效果几乎一致', best_for: ['所有'] },
      { name: '土豆淀粉', ratio: '1:1', note: '勾芡效果更好，但放凉后会变稀', best_for: ['热菜'] },
    ],
  },
  {
    ingredient: '白糖',
    category: '调料',
    substitutes: [
      { name: '冰糖', ratio: '1:1', note: '甜度略低但更纯正，适合红烧和炖品', best_for: ['红烧', '炖品'] },
      { name: '蜂蜜', ratio: '1:0.7', note: '甜度更高，带有花香，不适合高温烹饪', best_for: ['饮品', '凉拌'] },
      { name: '代糖（赤藓糖醇）', ratio: '1:1', note: '零卡路里，适合生酮和糖尿病人群', best_for: ['生酮', '低卡'] },
      { name: '红糖', ratio: '1:1', note: '颜色深，有焦香味，适合红烧肉', best_for: ['红烧', '甜品'] },
    ],
  },
  {
    ingredient: '味精',
    category: '调料',
    substitutes: [
      { name: '鸡精', ratio: '1:1', note: '鲜味更复合，含有盐分需减少盐量', best_for: ['所有'] },
      { name: '蚝油', ratio: '1:2', note: '鲜味来源不同，适合炒菜', best_for: ['炒菜'] },
      { name: '香菇粉', ratio: '1:1', note: '天然鲜味，素食可用，无添加剂', best_for: ['素食', '健康'] },
      { name: '虾皮粉', ratio: '1:1', note: '海鲜鲜味，适合汤和炒菜', best_for: ['汤', '炒菜'] },
    ],
  },
  {
    ingredient: '五花肉',
    category: '食材',
    substitutes: [
      { name: '梅花肉', ratio: '1:1', note: '肥瘦相间，口感接近，略瘦一些', best_for: ['红烧', '炒菜'] },
      { name: '前腿肉', ratio: '1:1', note: '肉质较嫩，肥瘦适中', best_for: ['红烧', '炖煮'] },
      { name: '鸡腿肉', ratio: '1:1', note: '低脂替代，口感不同但同样美味', best_for: ['低脂', '健康'] },
      { name: '杏鲍菇', ratio: '1:1', note: '素食替代，口感有嚼劲，吸味能力强', best_for: ['素食'] },
    ],
  },
  {
    ingredient: '辣椒',
    category: '食材',
    substitutes: [
      { name: '甜椒', ratio: '1:1', note: '不辣替代，保留颜色和口感', best_for: ['不辣需求'] },
      { name: '花椒', ratio: '1:0.3', note: '麻味替代辣味，川菜常用', best_for: ['川菜'] },
      { name: '黑胡椒', ratio: '1:0.5', note: '辛辣感不同但同样提味', best_for: ['西餐', '炒菜'] },
      { name: '辣椒粉', ratio: '1:0.5', note: '辣味更均匀，但缺少口感', best_for: ['调味'] },
    ],
  },
  {
    ingredient: '葱',
    category: '食材',
    substitutes: [
      { name: '洋葱', ratio: '1:1', note: '香味更浓郁，适合炖煮和炒菜', best_for: ['炖煮', '炒菜'] },
      { name: '蒜苗', ratio: '1:1', note: '清香替代，适合炒菜', best_for: ['炒菜'] },
      { name: '韭菜', ratio: '1:1', note: '味道更重，适合馅料和炒蛋', best_for: ['馅料', '炒蛋'] },
      { name: '香菜', ratio: '1:0.5', note: '风味完全不同，仅作点缀替代', best_for: ['点缀'] },
    ],
  },
  {
    ingredient: '姜',
    category: '食材',
    substitutes: [
      { name: '姜粉', ratio: '1:3', note: '干姜粉用量约为鲜姜的1/3', best_for: ['所有'] },
      { name: '沙姜', ratio: '1:1', note: '风味独特，两广地区常用', best_for: ['白切', '蒸菜'] },
      { name: '柠檬皮', ratio: '1:1', note: '去腥效果不同，适合海鲜', best_for: ['海鲜'] },
    ],
  },
  {
    ingredient: '蒜',
    category: '食材',
    substitutes: [
      { name: '蒜粉', ratio: '1:4', note: '干蒜粉用量约为鲜蒜的1/4', best_for: ['所有'] },
      { name: '洋葱', ratio: '1:1.5', note: '香味不同但同样提味', best_for: ['炒菜'] },
      { name: '蒜苗', ratio: '1:2', note: '清香替代，适合炒菜', best_for: ['炒菜'] },
    ],
  },
  {
    ingredient: '番茄',
    category: '食材',
    substitutes: [
      { name: '番茄罐头', ratio: '1:1', note: '味道更浓郁，适合炖煮', best_for: ['炖煮', '意面'] },
      { name: '番茄酱', ratio: '1:0.3', note: '浓缩风味，需加水稀释', best_for: ['调味'] },
      { name: '红椒+柠檬汁', ratio: '1个红椒+1汤匙柠檬汁', note: '模拟番茄的酸甜', best_for: ['沙拉'] },
    ],
  },
  {
    ingredient: '香菜',
    category: '食材',
    substitutes: [
      { name: '芹菜叶', ratio: '1:1', note: '清香替代，适合汤和凉拌', best_for: ['汤', '凉拌'] },
      { name: '薄荷', ratio: '1:0.5', note: '清凉风味，适合东南亚菜', best_for: ['东南亚'] },
      { name: '葱花', ratio: '1:1', note: '最常用替代，风味不同但同样提香', best_for: ['所有'] },
    ],
  },
  {
    ingredient: '虾',
    category: '食材',
    substitutes: [
      { name: '蟹棒', ratio: '1:1', note: '海鲜风味替代，价格更低', best_for: ['炒菜', '汤'] },
      { name: '鱿鱼', ratio: '1:1', note: '口感不同但同样鲜美', best_for: ['炒菜'] },
      { name: '豆腐', ratio: '1:1', note: '素食替代，吸收汤汁后口感好', best_for: ['素食'] },
      { name: '鸡胸肉', ratio: '1:1', note: '非海鲜替代，口感接近', best_for: ['过敏替代'] },
    ],
  },
]

export const substitute_impl: ToolImpl<{ ingredient: string; reason?: string }> = async (args) => {
  const start = Date.now()
  const { ingredient, reason } = args

  const entry = SUBSTITUTE_DB.find(
    (e) =>
      e.ingredient === ingredient ||
      e.ingredient.includes(ingredient) ||
      ingredient.includes(e.ingredient),
  )

  if (!entry) {
    return {
      success: false,
      error: `暂未收录「${ingredient}」的替代方案。可尝试询问具体菜系或用途，我会基于烹饪知识给出建议。`,
      duration: Date.now() - start,
    }
  }

  let substitutes = entry.substitutes

  if (reason) {
    const reasonLower = reason.toLowerCase()
    const filtered = substitutes.filter((s) => {
      const tags = [...s.best_for, s.note].join(' ').toLowerCase()
      return (
        tags.includes(reasonLower) ||
        (reasonLower.includes('素食') && tags.includes('素食')) ||
        (reasonLower.includes('生酮') && tags.includes('生酮')) ||
        (reasonLower.includes('低卡') && tags.includes('低卡')) ||
        (reasonLower.includes('过敏') && tags.includes('过敏')) ||
        (reasonLower.includes('健康') && tags.includes('健康'))
      )
    })
    if (filtered.length > 0) {
      substitutes = filtered
    }
  }

  return {
    success: true,
    data: {
      ingredient: entry.ingredient,
      category: entry.category,
      reason: reason || '未指定',
      substitutes: substitutes.map((s) => ({
        name: s.name,
        ratio: s.ratio,
        note: s.note,
        best_for: s.best_for,
      })),
    },
    duration: Date.now() - start,
  }
}