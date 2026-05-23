import 'dotenv/config'
import OpenAI from 'openai'

let client: OpenAI | null = null
let visionModel: string | null = null

function getVisionClient(): { client: OpenAI; model: string } | null {
  if (client && visionModel) return { client, model: visionModel }

  const apiKey = process.env.VISION_API_KEY ?? process.env.OPENAI_API_KEY
  const baseURL = process.env.VISION_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
  const model = process.env.VISION_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o'

  if (!apiKey) {
    console.warn('[Vision] ⚠️ 未配置 VISION_API_KEY 或 OPENAI_API_KEY，图片识别功能不可用')
    return null
  }

  client = new OpenAI({ apiKey, baseURL })
  visionModel = model

  console.info(`[Vision] 👁️ 已初始化 Vision Provider：${model} @ ${baseURL}`)
  return { client, model }
}

export interface VisionRequest {
  imageBase64: string
  message?: string
}

export interface VisionResult {
  success: boolean
  content: string
  error?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export async function analyzeImage(req: VisionRequest): Promise<VisionResult> {
  const provider = getVisionClient()
  if (!provider) {
    return {
      success: false,
      content: '',
      error: '图片识别功能未配置。请在 .env 中设置 VISION_API_KEY（或 OPENAI_API_KEY）。',
    }
  }

  const { client, model } = provider
  const { imageBase64, message } = req

  const userPrompt = message
    ? `用户说："${message}"\n\n请结合图片中的食材/菜品进行分析，然后回答用户的问题。`
    : `请仔细观察这张图片，识别其中所有的食材和菜品。然后：
1. 列出图片中出现的所有食材
2. 如果用户手头有这些食材，推荐 2-3 道可以做的菜品
3. 每道菜简要说明做法要点

请用亲切热情的语气回答，像一位厨神在帮朋友看冰箱。`

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: userPrompt },
    {
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${imageBase64}`,
        detail: 'auto',
      },
    },
  ]

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是【小厨神】，一位热情、专业、幽默的中华料理大师。你善于通过图片识别食材，并给出创意菜谱建议。回答时亲切自然，善用 emoji，简洁有力。',
        },
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    })

    const msg = response.choices[0]?.message

    return {
      success: true,
      content: msg?.content ?? '抱歉，未能识别图片内容，请换一张清晰的照片试试。',
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    }
  } catch (err) {
    console.error('[Vision] ❌ 图片识别调用失败：', err)
    return {
      success: false,
      content: '',
      error: `图片识别失败：${(err as Error).message}`,
    }
  }
}