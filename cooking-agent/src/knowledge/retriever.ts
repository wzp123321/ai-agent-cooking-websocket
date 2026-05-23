/**
 * ============================================================
 * TF-IDF 检索器 — 基于词频-逆文档频率的知识检索
 * ============================================================
 *
 * 原理：
 *   - TF（Term Frequency）：词在文档中出现的频率
 *   - IDF（Inverse Document Frequency）：词在整个语料库中的稀有度
 *   - TF-IDF = TF × IDF，值越高表示词对该文档越重要
 *
 * 流程：
 *   1. 分词（中文按字符 n-gram + 去停用词）
 *   2. 构建倒排索引（term → {docFreq, postings}）
 *   3. 查询时计算每个文档的 TF-IDF 得分
 *   4. 按得分排序，返回 topK 结果
 *
 * 使用场景：
 *   - Agent 需要检索菜谱知识时，先查知识库再调用 LLM
 *   - 减少 LLM 幻觉，提高回答准确性
 */

import type { KnowledgeDocument, SearchResult, KnowledgeBase } from './types'

/** 倒排索引条目 */
interface TermIndex {
  [term: string]: {
    docFreq: number
    postings: { docId: string; termFreq: number }[]
  }
}

export class TFIDFRetriever implements KnowledgeBase {
  private documents: Map<string, KnowledgeDocument> = new Map()
  private index: TermIndex = {}
  private totalDocs = 0

  /** 添加单个文档到索引 */
  addDocument(doc: KnowledgeDocument): void {
    this.documents.set(doc.id, doc)
    this.totalDocs++

    const terms = this.tokenize(doc.title + ' ' + doc.content + ' ' + doc.tags.join(' '))
    const termCounts: Record<string, number> = {}
    for (const t of terms) {
      termCounts[t] = (termCounts[t] || 0) + 1
    }

    for (const [term, freq] of Object.entries(termCounts)) {
      if (!this.index[term]) {
        this.index[term] = { docFreq: 0, postings: [] }
      }
      this.index[term].docFreq++
      this.index[term].postings.push({ docId: doc.id, termFreq: freq })
    }
  }

  /** 批量添加文档 */
  addDocuments(docs: KnowledgeDocument[]): void {
    for (const doc of docs) {
      this.addDocument(doc)
    }
  }

  /**
   * 搜索知识库
   *
   * @param query - 查询文本
   * @param topK  - 返回前 K 个结果（默认 5）
   * @returns 按 TF-IDF 得分降序排列的搜索结果
   */
  search(query: string, topK: number = 5): SearchResult[] {
    const queryTerms = this.tokenize(query)
    if (queryTerms.length === 0) return []

    const scores: Map<string, number> = new Map()

    for (const term of queryTerms) {
      const entry = this.index[term]
      if (!entry) continue

      const idf = Math.log((this.totalDocs + 1) / (entry.docFreq + 1)) + 1

      for (const posting of entry.postings) {
        const tf = Math.log(posting.termFreq + 1)
        const current = scores.get(posting.docId) || 0
        scores.set(posting.docId, current + tf * idf)
      }
    }

    const results: SearchResult[] = []
    for (const [docId, score] of scores) {
      const doc = this.documents.get(docId)
      if (!doc) continue

      const highlights = this.extractHighlights(doc.content, queryTerms, 3)

      results.push({
        document: doc,
        score: Math.round(score * 100) / 100,
        highlights,
      })
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  /** 按 ID 获取文档 */
  getById(id: string): KnowledgeDocument | undefined {
    return this.documents.get(id)
  }

  /** 按分类获取文档列表 */
  getByCategory(category: string): KnowledgeDocument[] {
    const results: KnowledgeDocument[] = []
    for (const doc of this.documents.values()) {
      if (doc.category === category) {
        results.push(doc)
      }
    }
    return results
  }

  /** 获取索引统计信息 */
  stats(): { totalDocuments: number; categories: Record<string, number> } {
    const categories: Record<string, number> = {}
    for (const doc of this.documents.values()) {
      categories[doc.category] = (categories[doc.category] || 0) + 1
    }
    return { totalDocuments: this.totalDocs, categories }
  }

  /**
   * 分词器
   *
   * 策略：
   *   - 转小写 + 去除 Markdown 符号和中文标点
   *   - 按空格分词（英文） + n-gram 子串（中文）
   *   - 过滤停用词和长度 < 2 的词
   */
  private tokenize(text: string): string[] {
    const cleaned = text
      .toLowerCase()
      .replace(/[#*_`~>|\[\](){}]/g, ' ')
      .replace(/[，。！？；：""''、《》【】\n\r]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const words = cleaned.split(' ')
    const result: string[] = []

    for (const word of words) {
      if (word.length < 2) continue

      const stopWords = new Set([
        'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
        'in', 'with', 'for', 'of', 'to', 'from', 'by', 'as', 'be', 'are',
        'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
        'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
        'shall', 'you', 'your', 'we', 'our', 'they', 'them', 'their',
        'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'so',
        'if', 'then', 'than', 'too', 'very', 'just', 'about', 'also',
        '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
        '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
        '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
        '什么', '怎么', '如何', '哪个', '为什么', '可以', '这个', '那个',
      ])

      if (!stopWords.has(word)) {
        result.push(word)

        // n-gram 子串：对长度 > 3 的词生成前缀子串，提高中文检索召回率
        if (word.length > 3) {
          for (let i = 2; i <= word.length; i++) {
            result.push(word.substring(0, i))
          }
        }
      }
    }

    return [...new Set(result)]
  }

  /**
   * 提取高亮片段
   *
   * 从文档内容中找出包含查询词的句子，按匹配度排序返回
   */
  private extractHighlights(
    content: string,
    queryTerms: string[],
    maxHighlights: number,
  ): string[] {
    const sentences = content.split(/[。！？\n]/)
    const highlights: { sentence: string; score: number }[] = []

    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (trimmed.length < 5) continue

      let score = 0
      const lower = trimmed.toLowerCase()
      for (const term of queryTerms) {
        if (lower.includes(term)) score++
      }

      if (score > 0) {
        highlights.push({ sentence: trimmed, score })
      }
    }

    highlights.sort((a, b) => b.score - a.score)
    return highlights.slice(0, maxHighlights).map((h) => h.sentence)
  }
}