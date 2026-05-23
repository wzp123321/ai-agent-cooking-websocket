export interface KnowledgeDocument {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  source: string
}

export interface SearchResult {
  document: KnowledgeDocument
  score: number
  highlights: string[]
}

export interface KnowledgeBase {
  search(query: string, topK?: number): SearchResult[]
  getById(id: string): KnowledgeDocument | undefined
  getByCategory(category: string): KnowledgeDocument[]
  stats(): { totalDocuments: number; categories: Record<string, number> }
}