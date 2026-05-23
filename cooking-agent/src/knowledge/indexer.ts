import * as fs from 'fs'
import * as path from 'path'
import type { KnowledgeDocument } from './types'
import { TFIDFRetriever } from './retriever'

function loadSkillDocuments(skillsDir: string): KnowledgeDocument[] {
  const docs: KnowledgeDocument[] = []

  if (!fs.existsSync(skillsDir)) {
    console.warn(`[Knowledge] ⚠️ Skills 目录不存在：${skillsDir}`)
    return docs
  }

  const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'))

  for (const file of files) {
    const filePath = path.join(skillsDir, file)
    const raw = fs.readFileSync(filePath, 'utf-8')

    const titleMatch = raw.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '')

    const triggerMatch = raw.match(/trigger:\s*(.+)$/m)
    const tags = triggerMatch
      ? triggerMatch[1].split(/[,，、]/).map((t) => t.trim())
      : []

    const content = raw
      .replace(/^---[\s\S]*?---/, '')
      .replace(/^#.*$/gm, '')
      .replace(/^\|.*\|$/gm, '')
      .replace(/^[-*]\s/gm, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()

    docs.push({
      id: `skill:${file.replace('.md', '')}`,
      title,
      content,
      category: 'skill',
      tags,
      source: filePath,
    })
  }

  return docs
}

function loadRecipeDocuments(): KnowledgeDocument[] {
  const docs: KnowledgeDocument[] = []

  const recipes: Array<{
    name: string
    category: string
    difficulty: string
    time: string
    ingredients: string[]
    steps: string[]
    tips: string[]
  }> = [
    {
      name: '红烧肉',
      category: '荤菜',
      difficulty: '中等',
      time: '90分钟',
      ingredients: ['五花肉500g', '冰糖30g', '生抽2汤匙', '老抽1汤匙', '料酒2汤匙', '八角2个', '桂皮1小块', '香叶2片', '葱姜适量'],
      steps: [
        '五花肉切3cm方块，冷水下锅焯水去浮沫，捞出洗净',
        '锅中少许油，小火炒冰糖至枣红色起泡',
        '下五花肉翻炒上色，加葱姜八角桂皮香叶炒香',
        '加料酒、生抽、老抽翻炒均匀',
        '加开水没过肉块，大火烧开转小火炖60分钟',
        '大火收汁至浓稠即可',
      ],
      tips: ['炒糖色火候最关键，枣红色即可，过深会苦', '一定要加开水，冷水会让肉质变硬', '收汁时不停翻动防止粘锅'],
    },
    {
      name: '宫保鸡丁',
      category: '荤菜',
      difficulty: '中等',
      time: '30分钟',
      ingredients: ['鸡胸肉300g', '花生米50g', '干辣椒10个', '花椒1茶匙', '葱段适量', '姜蒜末适量', '生抽1汤匙', '醋1汤匙', '糖1茶匙', '淀粉1茶匙'],
      steps: [
        '鸡胸肉切丁，加盐、料酒、淀粉腌制15分钟',
        '花生米小火炒至金黄备用',
        '调碗汁：生抽、醋、糖、淀粉、水混合',
        '热油滑炒鸡丁至变色盛出',
        '爆香花椒干辣椒，加姜蒜葱炒香',
        '倒入鸡丁和碗汁翻炒均匀，撒花生米出锅',
      ],
      tips: ['鸡丁要逆纹切，口感更嫩', '花生米提前炒好，最后放保持酥脆', '碗汁提前调好，炒菜时一气呵成'],
    },
    {
      name: '番茄炒蛋',
      category: '素菜',
      difficulty: '简单',
      time: '15分钟',
      ingredients: ['番茄2个', '鸡蛋3个', '葱花适量', '盐适量', '糖少许', '油适量'],
      steps: [
        '番茄切块，鸡蛋打散加少许盐',
        '热油炒鸡蛋至凝固盛出',
        '同锅炒番茄至出汁，加糖提鲜',
        '倒回鸡蛋翻炒均匀，加盐调味',
        '撒葱花出锅',
      ],
      tips: ['番茄选熟透的，汁水更多', '鸡蛋不要炒太老，凝固即可盛出', '加少许糖可以中和番茄酸味'],
    },
    {
      name: '清蒸鲈鱼',
      category: '海鲜',
      difficulty: '中等',
      time: '25分钟',
      ingredients: ['鲈鱼1条(约500g)', '葱丝适量', '姜丝适量', '蒸鱼豉油2汤匙', '料酒1汤匙', '盐少许', '食用油2汤匙'],
      steps: [
        '鲈鱼处理干净，两面划几刀，抹盐和料酒腌制10分钟',
        '盘底铺姜片，放上鱼，鱼身上放姜丝',
        '水开后上锅大火蒸8-10分钟',
        '倒掉盘中蒸出的腥水',
        '铺上葱丝，淋蒸鱼豉油',
        '热油浇在葱丝上激出香味',
      ],
      tips: ['蒸鱼时间根据鱼的大小调整，500g约8分钟', '一定要倒掉蒸出的腥水', '热油浇葱丝是点睛之笔'],
    },
    {
      name: '麻婆豆腐',
      category: '素菜',
      difficulty: '简单',
      time: '20分钟',
      ingredients: ['嫩豆腐1盒', '猪肉末100g', '豆瓣酱1汤匙', '花椒粉1茶匙', '辣椒面1茶匙', '豆豉少许', '蒜末适量', '葱花适量', '淀粉水适量'],
      steps: [
        '豆腐切2cm方块，盐水浸泡10分钟',
        '热油炒肉末至变色，加豆瓣酱炒出红油',
        '加蒜末、豆豉、辣椒面炒香',
        '加适量水烧开，轻轻放入豆腐',
        '小火煮5分钟入味，淀粉水勾芡',
        '撒花椒粉和葱花出锅',
      ],
      tips: ['豆腐盐水浸泡不易碎', '豆腐下锅后不要翻动，晃动锅子即可', '正宗做法用牛肉末'],
    },
    {
      name: '糖醋排骨',
      category: '荤菜',
      difficulty: '中等',
      time: '60分钟',
      ingredients: ['排骨500g', '料酒1汤匙', '生抽2汤匙', '醋3汤匙', '糖4汤匙', '水5汤匙', '姜片适量', '芝麻少许'],
      steps: [
        '排骨焯水去血沫，捞出洗净',
        '调糖醋汁：1酒2酱3醋4糖5水（黄金比例）',
        '少许油煎排骨至两面金黄',
        '倒入糖醋汁，加姜片',
        '大火烧开转小火炖30分钟',
        '大火收汁至浓稠，撒芝麻出锅',
      ],
      tips: ['糖醋汁黄金比例1:2:3:4:5', '排骨先煎后炖更香', '收汁时注意火候防止糊锅'],
    },
    {
      name: '酸辣土豆丝',
      category: '素菜',
      difficulty: '简单',
      time: '15分钟',
      ingredients: ['土豆2个', '干辣椒5个', '花椒少许', '醋2汤匙', '盐适量', '葱花适量', '油适量'],
      steps: [
        '土豆切细丝，清水浸泡去淀粉',
        '热油爆香花椒干辣椒',
        '大火快炒土豆丝1-2分钟',
        '沿锅边淋醋，加盐调味',
        '翻炒均匀撒葱花出锅',
      ],
      tips: ['土豆丝切好后泡水去淀粉，炒出来才脆', '全程大火快炒', '醋要沿锅边淋入，激出香味'],
    },
    {
      name: '水煮鱼',
      category: '海鲜',
      difficulty: '中等',
      time: '40分钟',
      ingredients: ['草鱼片300g', '豆芽200g', '干辣椒20个', '花椒2汤匙', '豆瓣酱2汤匙', '姜蒜末适量', '蛋清1个', '淀粉1汤匙', '盐适量'],
      steps: [
        '鱼片加盐、蛋清、淀粉腌制20分钟',
        '豆芽焯水铺碗底',
        '热油炒豆瓣酱出红油，加姜蒜炒香',
        '加水烧开，逐片下鱼片煮至变白',
        '连汤倒入碗中',
        '另起锅热油，爆香干辣椒花椒浇在鱼上',
      ],
      tips: ['鱼片要顺着纹理斜切', '下鱼片时水要保持微沸', '最后浇热油是灵魂步骤'],
    },
  ]

  for (const recipe of recipes) {
    const content = [
      `菜名：${recipe.name}`,
      `分类：${recipe.category}`,
      `难度：${recipe.difficulty}`,
      `耗时：${recipe.time}`,
      `食材：${recipe.ingredients.join('、')}`,
      `步骤：${recipe.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
      `小贴士：${recipe.tips.join(' ')}`,
    ].join('\n')

    docs.push({
      id: `recipe:${recipe.name}`,
      title: recipe.name,
      content,
      category: 'recipe',
      tags: [recipe.category, recipe.difficulty, ...recipe.ingredients.map((i) => i.split(/[\d]/)[0].trim())],
      source: '内置菜谱库',
    })
  }

  return docs
}

function loadCookingKnowledge(): KnowledgeDocument[] {
  const entries: Array<{ title: string; content: string; tags: string[] }> = [
    {
      title: '炒糖色技巧',
      content: '炒糖色是红烧菜的关键步骤。锅中放少许油，加入冰糖，小火慢炒。糖会经历融化→冒大泡→冒小泡→变枣红色的过程。枣红色是最佳时机，此时迅速下入食材。如果颜色过深变黑，说明糖焦了会发苦。新手建议用水炒法：糖和水1:1，小火熬至枣红色。',
      tags: ['糖色', '红烧', '技巧', '火候'],
    },
    {
      title: '肉类焯水方法',
      content: '肉类焯水要冷水下锅，这样血水才能慢慢渗出。如果开水下锅，表面蛋白质瞬间凝固，血水锁在里面出不来，肉会有腥味。焯水时加姜片和料酒去腥效果更好。焯好后用温水冲洗，不要用冷水，否则肉质收缩变硬。',
      tags: ['焯水', '去腥', '肉类', '技巧'],
    },
    {
      title: '勾芡技巧',
      content: '勾芡是中式烹饪常用技法。淀粉和水的比例通常为1:2。勾芡时火要大，芡汁要沿锅边淋入，边淋边翻动。不同菜品用不同芡汁：薄芡（汤羹类）、厚芡（爆炒类）、包芡（糖醋类）。土豆淀粉勾芡最亮，玉米淀粉最常用，红薯淀粉适合油炸。',
      tags: ['勾芡', '淀粉', '技巧'],
    },
    {
      title: '刀工基础',
      content: '切肉要逆纹切（垂直肌肉纤维），这样肉片/肉丝口感嫩滑。顺纹切会导致肉质老韧。切菜要顺纹切，保持纤维完整，口感脆爽。切片要厚薄均匀，才能保证成熟一致。切丝先切片再叠起来切丝。剁肉馅用"双刀剁法"效率更高。',
      tags: ['刀工', '切肉', '技巧', '基础'],
    },
    {
      title: '油温判断',
      content: '三四成热（90-120°C）：油面平静，插入筷子有微小气泡，适合滑炒。五六成热（150-180°C）：油面微动，有轻微油烟，适合快炒。七八成热（210-240°C）：油面明显波动，油烟较多，适合爆炒和油炸。判断方法：插入木筷，气泡密集程度代表油温高低。',
      tags: ['油温', '火候', '技巧', '基础'],
    },
    {
      title: '调味顺序',
      content: '中式烹饪调味有先后顺序：先放盐（入味）、再放糖（提鲜）、后放醋（保香）、最后放味精/鸡精（高温会破坏鲜味）。炖菜盐要后放，否则肉质变硬。凉拌菜先放油再放醋，可以锁住水分。酱油分生抽（调味）和老抽（上色），用法不同。',
      tags: ['调味', '盐', '酱油', '技巧'],
    },
    {
      title: '食材保鲜方法',
      content: '绿叶菜用湿厨房纸包裹放保鲜袋冷藏，可保鲜3-5天。肉类分装冷冻，每份一次用量，避免反复解冻。姜蒜常温通风保存，不要放冰箱（容易发霉）。豆腐泡水冷藏，每天换水可保存3天。鸡蛋大头朝上存放，保鲜期更长。',
      tags: ['保鲜', '储存', '食材', '技巧'],
    },
    {
      title: '常见烹饪误区',
      content: '误区1：炒菜油温过高产生油烟再放菜（破坏营养，产生有害物质）。误区2：炖肉中途加冷水（肉质瞬间收缩变硬）。误区3：炒鸡蛋前不打散（蛋黄蛋白分离，口感不均）。误区4：煮饺子不点水（容易破皮，加三次冷水更劲道）。误区5：所有菜都用大火（绿叶菜大火快炒，炖菜小火慢炖）。',
      tags: ['误区', '技巧', '基础'],
    },
    {
      title: '中式香料用法',
      content: '八角（大料）：去腥增香，适合红烧和卤味。桂皮：增香，适合炖肉。香叶：去腥，适合汤类和炖菜。花椒：增麻，适合川菜。丁香：香味浓烈，用量极少（1-2粒），适合卤味。草果：去腥解腻，适合牛羊肉。白芷：去腥增香，适合羊肉。陈皮：解腻增香，适合红烧肉。',
      tags: ['香料', '八角', '花椒', '卤味'],
    },
    {
      title: '厨房安全须知',
      content: '油锅起火不能用水浇（会爆溅），应盖上锅盖隔绝氧气。生熟砧板要分开，避免交叉污染。肉类中心温度达到75°C才算熟透。剩菜冷藏不超过2天，食用前彻底加热。发芽土豆含龙葵素有毒不能吃。未煮熟的四季豆含皂素有毒。发霉的花生含黄曲霉素（强致癌物）必须丢弃。',
      tags: ['安全', '卫生', '注意事项'],
    },
  ]

  return entries.map((entry, i) => ({
    id: `knowledge:${i}`,
    title: entry.title,
    content: entry.content,
    category: 'knowledge',
    tags: entry.tags,
    source: '内置烹饪知识库',
  }))
}

let instance: TFIDFRetriever | null = null

export function getKnowledgeBase(): TFIDFRetriever {
  if (instance) return instance

  instance = new TFIDFRetriever()

  const skillsDir = path.resolve(__dirname, '../../skills')
  const skillDocs = loadSkillDocuments(skillsDir)
  instance.addDocuments(skillDocs)

  const recipeDocs = loadRecipeDocuments()
  instance.addDocuments(recipeDocs)

  const knowledgeDocs = loadCookingKnowledge()
  instance.addDocuments(knowledgeDocs)

  const stats = instance.stats()
  console.info(`[Knowledge] 📚 知识库初始化完成：${stats.totalDocuments} 篇文档`)
  console.info(`[Knowledge] 📂 分类：${Object.entries(stats.categories).map(([k, v]) => `${k}(${v})`).join('、')}`)

  return instance
}