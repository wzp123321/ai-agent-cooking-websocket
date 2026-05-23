# cooking-agent

> 🍳 厨神小助 — 基于 DeepSeek 的做菜智能体 Agent（TypeScript）

## 技术栈

| 技术 | 用途 |
|------|------|
| **TypeScript** | 全程类型安全 |
| **OpenAI SDK** | DeepSeek API 调用（含 Function Calling） |
| **Express** | HTTP REST API |
| **ws** | WebSocket 流式通信（心跳检测 + 自动重连） |
| **dotenv** | 环境变量管理 |

## 架构：真正的 Agent（ReAct + Function Calling）

```
用户: "我有鸡胸肉和西兰花，热量多少？推荐什么菜？"

          ↓

┌─────────────────────────────────────────────────────────────┐
│                    ReAct 推理循环                              │
│                                                             │
│  步1: Thought → 我需要先推荐菜品，再计算热量                │
│       Action  → suggest_dishes                             │
│       Observe → 推荐了"蒜蓉西兰花"、"宫保鸡丁"...         │
│                                                             │
│  步2: Thought → 用户问热量，我计算推荐菜品的营养           │
│       Action  → calculate_nutrition                        │
│       Observe → 蒜蓉西兰花约 120kcal/份                    │
│                                                             │
│  步3: LLM 综合结果 → 给出完整推荐回答                       │
└─────────────────────────────────────────────────────────────┘
```

## 工具体系

| 工具 | 功能 | 数据来源 |
|------|------|---------|
| `search_recipe` | 查询菜谱详细做法 | 内置8道经典菜数据库 |
| `calculate_nutrition` | 计算营养成分 | 内置20+种食材营养库 |
| `check_food_safety` | 食品安全检测 | 内置危险食材知识库 |
| `explain_technique` | 烹饪技法解释 | 内置10种技法知识库 |
| `suggest_dishes` | 食材推荐菜品 | 内置15+道菜数据库 |
| `suggest_substitute` | 食材替代建议 | 内置替代食材知识库 |
| `filter_by_diet` | 膳食限制过滤 | 膳食类型知识库 |
| `search_knowledge` | 烹饪知识搜索 | 技能文档知识库 |

## API 接口

```
HTTP:
  GET    /health              健康检查
  POST   /api/chat           普通对话（工具调用 + ReAct）
  POST   /api/vision/chat    图片识别对话
  GET    /api/sessions       会话列表
  GET    /api/history/:id    获取对话历史
  DELETE /api/session/:id   清除会话
  GET    /api/profile        获取用户画像
  PUT    /api/profile        更新用户画像

WebSocket:
  /api/chat/ws               流式对话（打字机效果 + 心跳检测）
```

## WebSocket 消息格式

### 客户端发送

```json
// 聊天消息
{ "type": "chat", "message": "用户消息", "sessionId": "会话ID", "messageId": "消息ID" }

// 心跳响应
{ "type": "pong" }
```

### 服务端发送

```json
// 流式片段
{ "type": "chunk", "content": "部分文本" }

// 传输完成
{ "type": "done", "content": "完整文本", "sessionId": "xxx" }

// 错误
{ "type": "error", "error": "错误描述" }

// 心跳检测
{ "type": "ping" }

// 消息确认
{ "type": "ack", "messageId": "消息ID" }

// 欢迎消息
{ "type": "welcome", "message": "连接成功，准备接收消息" }
```

## WebSocket 高级特性

### 心跳检测机制

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 心跳间隔 | 30 秒 | 服务端每 30 秒发送一次 ping |
| ping 超时 | 10 秒 | 超过 10 秒未收到 pong 响应则断开连接 |
| 空闲超时 | 10 分钟 | 长时间无活动自动断开连接 |

### 消息可靠性保障

- **ACK 机制**：服务端收到消息后返回确认，确保消息已接收
- **错误处理**：完善的错误捕获和日志记录
- **优雅关闭**：支持服务端关闭时通知所有客户端

## 启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY=sk-xxxxxxxx

# 3. 开发模式（热更新）
npm run dev

# 4. 生产构建
npm run build
npm start
```

## 目录结构

```
src/
├── index.ts          # Express + WebSocket 服务入口（含心跳检测）
├── agent.ts          # CookingAgent 核心（ReAct + Function Calling）
├── prompts.ts        # 系统提示词（含工具描述 + 推理指令）
├── types.ts          # 核心类型定义
├── llm/              # LLM 接口层
│   ├── index.ts      # LLM 工厂
│   ├── deepseek.ts   # DeepSeek SDK 封装
│   └── types.ts      # LLM 类型定义
├── db/               # 数据库层（MySQL）
│   ├── index.ts      # 数据库连接
│   ├── migrate.ts    # 数据库迁移
│   ├── message.repository.ts
│   ├── session.repository.ts
│   └── user-profile.repository.ts
├── knowledge/        # 知识库检索
│   ├── index.ts
│   ├── indexer.ts    # 文档索引
│   ├── retriever.ts  # 向量检索
│   └── types.ts
└── tools/            # 工具集
    ├── types.ts      # 工具类型定义
    ├── index.ts      # 工具注册表
    ├── recipe.ts     # 菜谱查询工具
    ├── nutrition.ts  # 营养计算工具
    ├── safety.ts     # 食品安全工具
    ├── technique.ts  # 烹饪技法工具
    ├── suggest.ts    # 食材推荐工具
    ├── substitute.ts # 食材替代工具
    ├── diet.ts       # 膳食过滤工具
    └── knowledge.ts  # 知识搜索工具
```

## 运行日志示例

```
═══════════════════════════════════════════════
   🍳 厨神小助 Agent 服务启动中…
═══════════════════════════════════════════════
[Middleware] ✅ CORS 已启用
[Middleware] ✅ JSON 解析中间件已启用（限制 20MB）
[Middleware] ✅ 请求限流已启用（每 IP 每秒最多 10 次）
[DB] ✅ 迁移检查完成
[LLM:DeepSeek] ✅ 模型：deepseek-chat | 地址：https://api.deepseek.com
[CookingAgent] ✅ 已注册工具：search_recipe, calculate_nutrition, check_food_safety...
[WebSocket] ✅ WebSocket 服务器已启用（路径：/api/chat/ws）
[WebSocket] ⚡ 心跳检测已启用（间隔：30s，超时：10s）
[WebSocket] ⏰ 空闲超时已启用（10分钟）
═══════════════════════════════════════════════
   🍳 厨神小助 Agent 服务已启动！
   🌐 访问地址：http://localhost:9002
═══════════════════════════════════════════════
📋 可用接口：
   GET    /health               健康检查
   POST   /api/chat             普通对话
   WS     /api/chat/ws          流式对话（WebSocket）
   POST   /api/vision/chat      图片识别对话
   GET    /api/sessions         会话列表
   GET    /api/history/:id      获取对话历史
   DELETE /api/session/:id      清除会话
   GET    /api/profile          获取用户画像
   PUT    /api/profile          更新用户画像
📱 服务就绪，等待请求…
```

## Nginx 部署配置参考

如需使用 Nginx 反向代理 WebSocket，需添加以下配置：

```nginx
location /api/chat/ws {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```