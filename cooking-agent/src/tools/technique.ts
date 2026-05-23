/**
 * ============================================================
 * tools/technique.ts — 烹饪技法解释工具
 * ============================================================
 *
 * 功能：解释各种烹饪技法的原理、要领和适用场景。
 * 当用户询问"XX 怎么做"、"什么是XX技法"时触发。
 */

import type { Tool, ToolImpl } from './types'

export const technique_tool: Tool = {
  name: 'explain_technique',
  description:
    '当用户询问某种烹饪技法的原理、要领、诀窍，或想知道如何正确使用某种技法时使用。' +
    '例如："炒菜怎么才不粘锅"、"蒸鱼为什么腥"、"煎牛排的技巧"等。',
  parameters: {
    type: 'object',
    properties: {
      technique: {
        type: 'string',
        description: '烹饪技法名称，如：炒、红烧、清蒸、煎、炸、炖、煮、烤、溜、爆、焖、卤、拌、炝、腌',
      },
      ingredient: {
        type: 'string',
        description: '要处理的食材类型（可选），如：鱼、肉、蔬菜、豆腐',
      },
    },
    required: ['technique'],
  },
}

// ─── 烹饪技法知识库 ───────────────────────────────────────

interface TechniqueEntry {
  category: string
  alias?: string[]
  principle: string
  key_points: string[]
  common_mistakes: string[]
  suitable_for: string[]
  temperature: string
}

const TECHNIQUE_DB: Record<string, TechniqueEntry> = {
  '炒': {
    category: '旺火速成',
    alias: ['爆炒', '小炒', '生炒', '熟炒'],
    principle: '大火热油，快速翻拌，在短时间内让食材成熟并保持脆嫩或鲜嫩的口感。',
    key_points: [
      '锅要烧到足够热（微微冒烟），再下油',
      '油温七成热时下食材（筷子插入起小泡为准）',
      '食材下锅后不要急于翻动，待一面定型再翻',
      '全程大火快炒，炒制时间根据食材1-5分钟不等',
      '提前调好碗汁（生抽、醋、糖、淀粉等混合），出锅前淋入效果更好',
    ],
    common_mistakes: [
      '油温不够就下锅 → 食材出水、粘锅',
      '炒太久 → 蔬菜变黄变软，失去营养和口感',
      '火力不够 → 食材不出香，口感差',
    ],
    suitable_for: ['蔬菜', '肉片', '海鲜', '豆制品'],
    temperature: '大火，油温 150-180℃',
  },
  '红烧': {
    category: '调味着色',
    alias: ['红烧肉', '红烧鱼'],
    principle: '通过炒糖色或酱油给食材上色，以炖煮方式让调料渗入食材，达到色泽红亮、酥软入味的效果。',
    key_points: [
      '炒糖色是关键：冰糖小火炒至枣红色时下食材',
      '加开水而不是冷水，避免肉质收缩变硬',
      '大火烧开后转小火慢炖，让调料充分渗透',
      '收汁时大火，边收边晃锅，使汤汁挂在食材表面',
    ],
    common_mistakes: [
      '糖色炒糊 → 发苦',
      '中途加冷水 → 肉质收缩变柴',
      '大火一直炖 → 水分流失快，口感变硬',
      '收汁不充分 → 颜色暗淡，味道寡淡',
    ],
    suitable_for: ['五花肉', '排骨', '鱼类', '鸡块', '豆腐'],
    temperature: '先大火烧开，后小火烧制，最后大火收汁',
  },
  '清蒸': {
    category: '保留原味',
    alias: ['清蒸鱼', '清蒸蟹', '清蒸蛋'],
    principle: '利用水蒸气的热传导让食材成熟，最大程度保留食材的鲜味和营养，调味清淡。',
    key_points: [
      '水开后再放食材，大火蒸',
      '鱼/海鲜蒸制前用料酒和姜片去腥',
      '蒸制时间要准确（一般500g鱼蒸8-10分钟）',
      '蒸好后倒掉盘中的水（这是腥水，必须倒掉！）',
      '趁热浇热油和蒸鱼豉油，激发香味',
    ],
    common_mistakes: [
      '冷水上锅 → 蒸制时间延长，食材变老',
      '不倒蒸汁 → 腥味重',
      '蒸太久 → 肉质变老变柴',
      '过早浇豉油 → 香气无法激发',
    ],
    suitable_for: ['鱼类', '螃蟹', '虾', '贝类', '蛋羹', '豆腐'],
    temperature: '大火，水开后上锅蒸',
  },
  '煎': {
    category: '油脂传热',
    alias: ['香煎', '生煎', '油煎'],
    principle: '用少量油使食材与锅底接触，通过传导热量使食材表面金黄酥脆，内部保持鲜嫩。',
    key_points: [
      '锅要先烧热再放油（热锅凉油不粘锅）',
      '食材表面要干燥（用厨房纸擦干）',
      '下锅后不要急于翻动，待一面金黄再翻',
      '中小火煎，大火容易外焦里生',
      '可以轻轻晃动锅，食材能晃动说明一面已煎好',
    ],
    common_mistakes: [
      '食材带水下锅 → 严重粘锅',
      '冷锅下油下食材 → 粘锅',
      '频繁翻动 → 皮肉分离，不美观',
      '大火煎 → 外焦黑内夹生',
    ],
    suitable_for: ['牛排', '鸡排', '鱼排', '豆腐', '鸡蛋'],
    temperature: '中小火，油温 120-150℃',
  },
  '炸': {
    category: '油炸传热',
    alias: ['酥炸', '干炸', '软炸', '脆炸'],
    principle: '食材完全浸入高温油脂中，在极短时间内让表面形成酥脆外壳，内部快速成熟。',
    key_points: [
      '油温要够（筷子插入快速冒泡），否则食材会吸油',
      '大块食材先低温炸熟，再高温复炸逼出油分使外壳更酥',
      '挂糊/裹面包糠可以让外壳更酥脆',
      '分批炸，不要一次放太多（油温会骤降）',
      '捞出后放吸油纸上控油',
    ],
    common_mistakes: [
      '油温不够就下锅 → 食材吸油多，口感油腻',
      '一次放太多食材 → 油温骤降，炸不透',
      '不复炸 → 外壳不够酥脆',
    ],
    suitable_for: ['鸡翅', '里脊', '丸子', '薯条', '天妇罗'],
    temperature: '初炸 150-160℃，复炸 180-200℃',
  },
  '炖': {
    category: '文火慢煮',
    alias: ['清炖', '红炖', '隔水炖'],
    principle: '中小火长时间加热，使食材的鲜味和营养慢慢渗出，汤汁浓白或清澈，肉质软烂入味。',
    key_points: [
      '冷水下锅，慢慢加热，让血水慢慢渗出',
      '大火烧开后转小火，保持微沸状态',
      '水要一次加足，中途不揭盖',
      '盐要最后放，早放会让肉质变紧',
      '炖肉可加山楂或茶叶，使肉更快软烂',
    ],
    common_mistakes: [
      '大火一直炖 → 汤汁发浑，肉质变柴',
      '中途揭盖或加水 → 破坏香气，影响口感',
      '过早加盐 → 蛋白质凝固，不易入味',
    ],
    suitable_for: ['排骨', '牛肉', '鸡肉', '羊肉', '莲藕', '萝卜'],
    temperature: '大火烧开后转小火，保持微沸（85-95℃）',
  },
  '煮': {
    category: '水为介质',
    alias: ['白煮', '水煮'],
    principle: '以水为传热介质，食材在沸水中成熟，适合蔬菜、面条、饺子等。',
    key_points: [
      '水要大开后下食材',
      '叶菜类最后下锅，30秒-1分钟即可',
      '面条/水饺：下锅后搅动防止粘连，水开后加冷水"点水"2-3次',
      '豆类/难熟食材需冷水下锅，慢慢加热',
    ],
    common_mistakes: [
      '水不开就下面 → 粘连、糊汤',
      '煮叶菜加油可保持翠绿（但也会带走部分营养）',
    ],
    suitable_for: ['面条', '饺子', '馄饨', '绿叶菜', '鸡蛋', '玉米'],
    temperature: '沸水（100℃）',
  },
  '烤': {
    category: '热辐射',
    alias: ['烘烤', '烧烤', '焗烤'],
    principle: '通过烤箱/烤炉的热辐射让食材均匀受热，表面焦化产生香气，内部保持多汁。',
    key_points: [
      '烤箱需提前预热（一般提前10-15分钟）',
      '大块食材用低温慢烤，小块用高温快烤',
      '中途可取出刷油或酱汁，防止表面过干',
      '牛排等厚肉：高温封表面，低温烤内部',
      '肉类可在烤前腌制，入味且去腥',
    ],
    common_mistakes: [
      '不预热烤箱 → 受热不均',
      '温度过高 → 外焦里生',
      '不翻面 → 受热不均匀',
    ],
    suitable_for: ['牛排', '羊排', '鸡翅', '整鸡', '红薯', '面包'],
    temperature: '根据食材 150-250℃不等',
  },
  '拌': {
    category: '冷菜技法',
    alias: ['凉拌', '冷拌'],
    principle: '食材煮熟或生食后，加入调味料拌匀，调味是关键，讲究酸辣鲜香。',
    key_points: [
      '调味料是灵魂：生抽、醋、蒜末、辣椒油、香油、花生碎等',
      '蒜末用热油泼一下激发香味（泼蒜）',
      '凉拌汁提前调好，现拌现吃',
      '蔬菜类焯水后过凉水保持脆爽',
    ],
    common_mistakes: [
      '调味料不泼热油 → 香味不足',
      '拌好放置太久 → 蔬菜出水，不脆',
    ],
    suitable_for: ['黄瓜', '豆芽', '木耳', '腐竹', '粉丝'],
    temperature: '冷菜',
  },
  '熘': {
    category: '先炸后调味',
    alias: ['焦熘', '滑熘', '糖醋熘'],
    principle: '食材先炸或滑油至熟，再用调好的芡汁快速裹匀，酸甜或咸鲜口味。',
    key_points: [
      '食材需提前处理（腌制、上浆）',
      '芡汁提前调好（淀粉+调料）',
      '炸好或滑好油后立即回锅裹汁，动作要快',
      '糖醋类要多加油，成品色泽光亮',
    ],
    common_mistakes: [
      '芡汁太稀 → 挂不住',
      '回锅太慢 → 食材回软，不酥脆',
    ],
    suitable_for: ['里脊', '鸡丁', '鱼块', '虾仁'],
    temperature: '先炸后裹汁',
  },
}

// ─── 工具实现 ─────────────────────────────────────────────

type TechniqueArgs = { technique: string; ingredient?: string }

export const technique_impl: ToolImpl<TechniqueArgs> = async ({ technique, ingredient }) => {
  const startTime = Date.now()

  const keyword = technique.trim()

  // 精确或模糊匹配
  const entry = Object.entries(TECHNIQUE_DB).find(
    ([name, info]) =>
      name === keyword ||
      keyword.includes(name) ||
      name.includes(keyword) ||
      info.alias?.some((a) => keyword.includes(a) || a.includes(keyword)),
  )

  if (!entry) {
    const suggestions = Object.keys(TECHNIQUE_DB).filter((t) =>
      t.includes(keyword) || keyword.includes(t),
    )

    return {
      success: true,
      data: {
        found: false,
        technique: keyword,
        suggestions: suggestions.length > 0 ? suggestions : Object.keys(TECHNIQUE_DB),
        tip: `你可以尝试查询：${Object.keys(TECHNIQUE_DB).join('、')} 等常见技法`,
      },
      duration: Date.now() - startTime,
    }
  }

  const [name, info] = entry

  return {
    success: true,
    data: {
      found: true,
      technique: name,
      category: info.category,
      principle: info.principle,
      key_points: info.key_points,
      common_mistakes: info.common_mistakes,
      suitable_for: info.suitable_for,
      temperature: info.temperature,
      ingredient_hint: ingredient
        ? `如果处理 ${ingredient}，${name}时建议：${info.key_points[0] ?? '参考以上要点'}`
        : null,
    },
    duration: Date.now() - startTime,
  }
}
