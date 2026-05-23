/**
 * ============================================================
 * tools/nutrition.ts — 营养成分计算工具
 * ============================================================
 *
 * 功能：根据食材估算一道菜或一餐的营养成分。
 * 数据来源：内置常见食材营养数据库（100g可食部分的平均值）。
 */

import type { Tool, ToolImpl } from './types'

// ─── 工具元信息 ───────────────────────────────────────────

export const nutrition_tool: Tool = {
  name: 'calculate_nutrition',
  description:
    '当用户询问某道菜的营养价值、热量、减肥能不能吃、增肌吃什么、孕期饮食建议时使用。' +
    '也适用于比较两道菜的营养差异，或询问某种食材的营养成分。',
  parameters: {
    type: 'object',
    properties: {
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: '食材列表，如：["鸡胸肉 100g", "西兰花 50g", "橄榄油 10g"]',
      },
      people_count: {
        type: 'number',
        description: '用餐人数（默认1人）',
      },
      purpose: {
        type: 'string',
        enum: ['减肥', '增肌', '孕期', '儿童', '普通'],
        description: '用餐目的，影响饮食建议侧重点',
      },
    },
    required: ['ingredients'],
  },
}

// ─── 营养成分数据库（每100g可食部分）───────────────────────

interface NutritionData {
  calories: number    // 千卡
  protein: number     // 克
  fat: number         // 克
  carbs: number       // 克
  fiber?: number      // 克（可选）
  note?: string
}

const NUTRITION_DB: Record<string, NutritionData> = {
  // ── 肉类 ──
  '鸡胸肉':    { calories: 133, protein: 31,   fat: 3.6,  carbs: 0,    note: '高蛋白低脂肪，增肌首选' },
  '鸡腿肉':    { calories: 209, protein: 27,   fat: 10.9, carbs: 0,    note: '比鸡胸略肥，口感更嫩' },
  '五花肉':    { calories: 395, protein: 13.5, fat: 37,   carbs: 0,    note: '脂肪含量高，少吃为宜' },
  '猪里脊':    { calories: 155, protein: 20,   fat: 7,    carbs: 0,    note: '瘦肉中较嫩的部位' },
  '牛肉':      { calories: 125, protein: 22,   fat: 4.3,  carbs: 0,    note: '红肉，补铁效果好' },
  '牛腩':      { calories: 246, protein: 18,   fat: 18,   carbs: 0,    note: '含筋，炖煮后很软烂' },
  '虾':        { calories: 93,  protein: 18.6, fat: 0.8,  carbs: 0.5,  note: '低脂肪高蛋白，过敏者慎食' },
  '鱼肉':      { calories: 90,  protein: 18,   fat: 2,    carbs: 0,    note: '白肉，易消化' },

  // ── 蛋类 ──
  '鸡蛋':      { calories: 144, protein: 13.3, fat: 8.8,  carbs: 1.5,  note: '营养全面，每天1-2个为宜' },
  '鸡蛋清':    { calories: 60,  protein: 12,   fat: 0.2,  carbs: 0.8,  note: '纯蛋白，热量极低，增肌常用' },

  // ── 蔬菜 ──
  '西兰花':    { calories: 34,  protein: 2.8,  fat: 0.4,  carbs: 6.6,  fiber: 2.6, note: '维生素C含量高，抗氧化' },
  '番茄':      { calories: 20,  protein: 0.9,  fat: 0.2,  carbs: 4.7,  fiber: 1.5, note: '富含番茄红素，加热后更易吸收' },
  '土豆':      { calories: 76,  protein: 2,    fat: 0.2,  carbs: 17.5, fiber: 2.2, note: '碳水化合物丰富，当主食吃要减量' },
  '红薯':      { calories: 99,  protein: 1.1,  fat: 0.1,  carbs: 23.6, fiber: 2.3, note: '富含膳食纤维，升糖指数比土豆低' },
  '白菜':      { calories: 18,  protein: 1.5,  fat: 0.1,  carbs: 3.4,  fiber: 1,    note: '低热量高纤维，减肥友好' },
  '菠菜':      { calories: 24,  protein: 2.9,  fat: 0.4,  carbs: 3.6,  fiber: 2.2, note: '富含铁和叶酸，孕期推荐' },
  '黄瓜':      { calories: 16,  protein: 0.8,  fat: 0.2,  carbs: 3.9,  fiber: 0.8,  note: '几乎零脂肪，补水效果好' },
  '胡萝卜':    { calories: 35,  protein: 0.9,  fat: 0.2,  carbs: 8.1,  fiber: 3.2,  note: '富含β-胡萝卜素，对视力好' },
  '青椒':      { calories: 26,  protein: 1,    fat: 0.3,  carbs: 6,    fiber: 3.3,  note: '维C含量是番茄的3倍' },
  '洋葱':      { calories: 40,  protein: 1.1,  fat: 0.1,  carbs: 9.3,  fiber: 1.7,  note: '含硫化物，可提升免疫力' },
  '豆腐':      { calories: 81,  protein: 8.1,  fat: 3.7,  carbs: 3.8,  note: '植物蛋白，过敏者可替代肉类' },
  '木耳':      { calories: 27,  protein: 1.5,  fat: 0.2,  carbs: 6,    fiber: 2.6,  note: '铁含量高，胶质丰富' },

  // ── 主食 ──
  '米饭':      { calories: 116, protein: 2.6,  fat: 0.3,  carbs: 25.9, fiber: 0.3, note: '白米饭，每碗约200g=232kcal' },
  '面条':      { calories: 284, protein: 8.3,  fat: 0.8,  carbs: 59.5, fiber: 1.8, note: '干重100g的热量，煮熟后约300g' },

  // ── 油脂 ──
  '食用油':    { calories: 900, protein: 0,   fat: 99.9, carbs: 0,    note: '纯脂肪，1g油=9kcal，每餐不超过15g' },
  '橄榄油':    { calories: 900, protein: 0,   fat: 99.9, carbs: 0,    note: '含不饱和脂肪酸，相对健康' },
  '芝麻油':    { calories: 898, protein: 0,   fat: 99.7, carbs: 0,    note: '香味浓郁，少量提味即可' },
  '黄油':      { calories: 752, protein: 0.5, fat: 81,   carbs: 0.5,  note: '饱和脂肪较高，少用' },

  // ── 调味料 ──
  '酱油':      { calories: 63,  protein: 8.1,  fat: 0,    carbs: 5.9,  note: '含盐量高，高血压患者少用' },
  '蚝油':      { calories: 78,  protein: 1.3,  fat: 0,    carbs: 17.8, note: '含糖，含钠量高' },
  '豆瓣酱':    { calories: 178, protein: 7.9, fat: 5.8,  carbs: 21.4, note: '含盐分高，少量使用' },
  '糖':        { calories: 400, protein: 0,   fat: 0,    carbs: 99.9, note: '空热量，尽量减少摄入' },
  '盐':        { calories: 0,   protein: 0,   fat: 0,    carbs: 0,    note: '每天不超过6g，高血压患者更少' },
  '醋':        { calories: 31,  protein: 0.3, fat: 0,    carbs: 6.4,  note: '开胃，醋酸有助消化' },

  // ── 坚果 ──
  '花生':      { calories: 574, protein: 21,   fat: 49,   carbs: 21,  fiber: 5,    note: '热量很高，每天一小把即可' },
  '花生米':    { calories: 574, protein: 21,   fat: 49,   carbs: 21,  fiber: 5,    note: '炒制后热量更高，注意控制量' },
}

// ─── 工具实现 ─────────────────────────────────────────────

type NutritionArgs = {
  ingredients: string[]
  people_count?: number
  purpose?: '减肥' | '增肌' | '孕期' | '儿童' | '普通'
}

export const nutrition_impl: ToolImpl<NutritionArgs> = async ({
  ingredients,
  people_count = 1,
  purpose = '普通',
}) => {
  const startTime = Date.now()

  try {
    // 解析每种食材的数量（支持 "鸡胸肉 100g"、"鸡胸肉" 两种格式）
    const parsedIngredients: { name: string; grams: number }[] = []

    for (const item of ingredients) {
      // 匹配格式：食材名 + 数量 + 单位
      const match = item.match(/^([^\d]+?)\s*(\d+(?:\.\d+)?)\s*(g|克|ml|毫升)?$/)

      if (match) {
        const name = match[1].trim()
        const amount = parseFloat(match[2])
        const unit = match[3] ?? 'g'

        // 统一转为克
        const grams = unit === 'ml' || unit === '毫升' ? amount : amount
        parsedIngredients.push({ name, grams })
      } else {
        // 没有写数量，默认100g
        parsedIngredients.push({ name: item.trim(), grams: 100 })
      }
    }

    // 计算营养成分
    let totalCalories = 0
    let totalProtein = 0
    let totalFat = 0
    let totalCarbs = 0
    let totalFiber = 0
    const breakdown: { name: string; grams: number; calories: number; protein: number; fat: number; carbs: number }[] = []
    const unmatched: string[] = []

    for (const { name, grams } of parsedIngredients) {
      // 模糊匹配食材名
      const entry = Object.entries(NUTRITION_DB).find(([k]) => name.includes(k) || k.includes(name))

      if (entry) {
        const [key, nutrition] = entry
        // 按实际克数等比换算
        const factor = grams / 100
        const cal = Math.round(nutrition.calories * factor)
        const pro = Math.round(nutrition.protein * factor * 10) / 10
        const fat = Math.round(nutrition.fat * factor * 10) / 10
        const carbs = Math.round(nutrition.carbs * factor * 10) / 10

        totalCalories += cal
        totalProtein += pro
        totalFat += fat
        totalCarbs += carbs
        if (nutrition.fiber) totalFiber += Math.round(nutrition.fiber * factor * 10) / 10

        breakdown.push({ name: key, grams, calories: cal, protein: pro, fat, carbs })
      } else {
        unmatched.push(name)
      }
    }

    // 每人份
    const perPerson = {
      calories: Math.round(totalCalories / people_count),
      protein: Math.round((totalProtein / people_count) * 10) / 10,
      fat: Math.round((totalFat / people_count) * 10) / 10,
      carbs: Math.round((totalCarbs / people_count) * 10) / 10,
      fiber: Math.round((totalFiber / people_count) * 10) / 10,
    }

    // 根据用餐目的给出建议
    const adviceMap: Record<string, { calories: string; protein: string; fat: string; carbs: string; tip: string }> = {
      '减肥': {
        calories: `${perPerson.calories}kcal/人份${perPerson.calories < 400 ? ' ✅ 热量适中' : ' ⚠️ 热量偏高，建议减少油脂'}`,
        protein: `${perPerson.protein}g ✅ 充足蛋白质有饱腹感`,
        fat: `${perPerson.fat}g ⚠️ 注意控制${perPerson.fat > 15 ? '油脂用量' : '整体控制不错'}`,
        carbs: `${perPerson.carbs}g ${perPerson.carbs > 40 ? '⚠️ 主食减量' : '✅ 碳水适中'}`,
        tip: '增加蔬菜比例，减少油脂，饭前喝杯水有助减少食量',
      },
      '增肌': {
        calories: `${perPerson.calories}kcal/人份 ${perPerson.calories < 300 ? '⚠️ 热量偏低，增肌需要充足热量' : '✅ 热量充足'}`,
        protein: `${perPerson.protein}g ${perPerson.protein > 25 ? '✅ 高蛋白，非常适合增肌' : '⚠️ 蛋白质建议每餐25g+'}`,
        fat: `${perPerson.fat}g ${perPerson.fat > 10 ? '⚠️ 适量即可' : '✅ 脂肪控制得当'}`,
        carbs: `${perPerson.carbs}g ${perPerson.carbs > 30 ? '✅ 碳水供能支持训练' : '⚠️ 建议配合碳水摄入'}`,
        tip: '训练后30分钟内补充蛋白质和碳水效果最佳',
      },
      '孕期': {
        calories: `${perPerson.calories}kcal/人份 ✅ 孕期每日需+300~500kcal`,
        protein: `${perPerson.protein}g ✅ 蛋白质支持胎儿发育`,
        fat: `${perPerson.fat}g ✅ 适量健康脂肪有助胎儿大脑发育`,
        carbs: `${perPerson.carbs}g ✅ 碳水是主要能量来源`,
        tip: '食材要新鲜彻底加热，避免生食和半熟食物，补充叶酸和铁',
      },
      '儿童': {
        calories: `${perPerson.calories}kcal/人份 ✅ 营养均衡的膳食`,
        protein: `${perPerson.protein}g ✅ 促进生长发育`,
        fat: `${perPerson.fat}g ✅ 适量脂肪有助脑部发育`,
        carbs: `${perPerson.carbs}g ✅ 提供成长所需能量`,
        tip: '食物切成小块方便咀嚼，口味清淡，培养孩子对蔬菜的兴趣',
      },
      '普通': {
        calories: `${perPerson.calories}kcal/人份`,
        protein: `${perPerson.protein}g蛋白质`,
        fat: `${perPerson.fat}g脂肪`,
        carbs: `${perPerson.carbs}g碳水化合物`,
        tip: '饮食多样化，荤素搭配，粗细粮结合',
      },
    }

    return {
      success: true,
      data: {
        total: {
          calories: totalCalories,
          protein: Math.round(totalProtein * 10) / 10,
          fat: Math.round(totalFat * 10) / 10,
          carbs: Math.round(totalCarbs * 10) / 10,
          fiber: Math.round(totalFiber * 10) / 10,
        },
        per_person: perPerson,
        breakdown,
        unmatched_ingredients: unmatched,
        advice: adviceMap[purpose],
        purpose,
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
