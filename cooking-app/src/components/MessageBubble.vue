<template>
  <div class="message" :class="message.role">
    <!--
      头像设计 — SVG 矢量图标，替代原来的 emoji 👤/👨‍🍳
        用户：圆形人物剪影（person icon），琥珀渐变背景
        助手：五角星剪影（star icon），暖灰白渐变背景
        助手生成中：外围叠加 avatarPulse 呼吸光晕，提示用户 AI 正在工作
    -->
    <div class="avatar" :class="`${message.role}-avatar`">
      <svg v-if="message.role === 'user'" class="avatar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6" />
        <path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <svg v-else class="avatar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="m12 2 2.4 5.2L20 9.5l-4 3.6 1 5.4L12 16l-5 2.5 1-5.4L4 9.5l5.6-2.3L12 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      </svg>
      <div v-if="message.role === 'assistant' && message.streaming" class="avatar-pulse" />
    </div>

    <div class="bubble-wrapper">
      <div class="bubble" :class="[message.role, { thinking: isThinking }]">
        <template v-if="message.role === 'user'">
          <img v-if="message.image" :src="message.image" class="user-image" alt="用户上传图片" />
          <span v-if="message.content" class="user-text">{{ message.content }}</span>
        </template>
        <template v-else>
          <!--
            思考中指示器 — AI 开始生成但尚无内容时的过渡 UI
              显示 "思考中" 文字 + 三个弹跳点动画
              每个点的动画错开 0.2s，产生波浪式弹跳效果
              气泡边框在 thinking 状态下变为琥珀色（accent）
          -->
          <div v-if="isThinking" class="thinking-indicator">
            <span class="thinking-label">思考中</span>
            <span class="thinking-dots">
              <span class="dot" /><span class="dot" /><span class="dot" />
            </span>
          </div>
          <div v-if="message.content" class="markdown-body" v-html="renderedContent" />
          <span v-if="message.streaming && message.content" class="typing-cursor" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { marked } from 'marked'
import type { ChatMessage } from '@/types'

const props = defineProps<{ message: ChatMessage }>()

const isThinking = computed(
  () => props.message.role === 'assistant' && props.message.streaming && !props.message.content,
)

const renderedContent = ref<string>('')
let parseTimer: ReturnType<typeof setTimeout> | null = null
let lastParsedLength = 0

const parseMarkdown = () => {
  const text = props.message.content
  if (!text) {
    renderedContent.value = ''
    lastParsedLength = 0
    return
  }
  const len = text.length
  if (len !== lastParsedLength) {
    renderedContent.value = marked.parse(text) as string
    lastParsedLength = len
  }
}

parseMarkdown()

watch(
  () => props.message.content,
  () => {
    if (props.message.streaming) {
      if (!parseTimer) {
        parseTimer = setTimeout(() => {
          parseTimer = null
          parseMarkdown()
        }, 60)
      }
    } else {
      if (parseTimer) {
        clearTimeout(parseTimer)
        parseTimer = null
      }
      parseMarkdown()
    }
  },
)

onUnmounted(() => {
  if (parseTimer) clearTimeout(parseTimer)
})
</script>

<style scoped>
.message {
  display: flex;
  gap: clamp(10px, 2vw, 14px);
  animation: messageSlideIn var(--duration-slow) var(--ease-out-back) both;
  max-width: min(860px, 100%);
  /**
   * CSS 虚拟滚动 — content-visibility: auto
   *
   * 原理：浏览器跳过视口外元素的渲染（paint + layout），
   *      仅在元素接近视口时才渲染。对 DOM 树本身无影响，
   *      因此 v-for 不需要修改。
   *
   * contain-intrinsic-size 提供预估高度，防止滚动条跳动。
   * 每条消息大约 80-300px，取 120px 作为估算基准。
   *
   * 兼容性：Chrome 85+, Edge 85+。Firefox 不支持但会忽略。
   */
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}

.message.user {
  flex-direction: row-reverse;
  margin-inline-start: auto;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.avatar {
  --avatar-size: clamp(34px, 5vw, 40px);
  width: var(--avatar-size);
  height: var(--avatar-size);
  border-radius: var(--radius-full);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  align-self: flex-end;
  position: relative;
  transition:
    transform var(--duration-fast) var(--ease-out-back),
    box-shadow var(--duration-fast) var(--ease-out-expo);
}

.avatar-icon {
  width: 52%;
  height: 52%;
}

.user-avatar {
  background: linear-gradient(145deg, #f0a030, #e88a1a);
  color: #fff;
  box-shadow:
    0 2px 8px rgba(232, 138, 26, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.assistant-avatar {
  background: linear-gradient(145deg, #f5f3ef, #eae7e0);
  color: var(--accent-cool);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.avatar-pulse {
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  border: 2px solid var(--accent);
  opacity: 0;
  animation: avatarPulse 2s ease-in-out infinite;
}

@keyframes avatarPulse {
  0%, 100% { opacity: 0; transform: scale(1); }
  50%      { opacity: 0.35; transform: scale(1.08); }
}

.bubble-wrapper {
  max-width: calc(100% - var(--avatar-size) - clamp(10px, 2vw, 14px));
  display: flex;
  flex-direction: column;
}

.bubble {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.72;
  overflow-wrap: break-word;
  word-break: break-word;
  transition:
    box-shadow var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo);
  position: relative;
}

.bubble.user {
  background: linear-gradient(145deg, #f0a030, #e07b1e);
  color: #fff;
  border-end-end-radius: 5px;
  box-shadow: 0 4px 16px rgba(232, 138, 26, 0.2);
}

.bubble.assistant {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-end-start-radius: 5px;
  box-shadow: var(--shadow-xs);
}

.bubble.assistant:hover {
  border-color: var(--border-light);
}

.bubble.assistant.thinking {
  border-color: var(--border-accent);
  background: linear-gradient(145deg, #fffefb, #faf8f4);
  box-shadow: 0 0 20px rgba(232, 138, 26, 0.06);
}

.user-image {
  max-width: 240px;
  max-height: 240px;
  border-radius: var(--radius-xs);
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.user-text {
  word-break: break-word;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.thinking-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.thinking-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.thinking-dots .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.4;
  animation: dotBounce 1.4s ease-in-out infinite;
}

.thinking-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotBounce {
  0%, 80%, 100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 0.9;
    transform: translateY(-5px);
  }
}

:deep(.markdown-body) {
  font-size: inherit;
  line-height: inherit;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  font-weight: 700;
  color: var(--text-primary);
  margin: 16px 0 8px;
  letter-spacing: -0.01em;
}

:deep(.markdown-body h1) { font-size: 1.4em; }
:deep(.markdown-body h2) {
  font-size: 1.2em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}
:deep(.markdown-body h3) { font-size: 1.05em; }

:deep(.markdown-body code) {
  background: var(--bg-elevated);
  color: var(--accent-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}

:deep(.markdown-body pre) {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  overflow-x: auto;
  margin: 10px 0;
}

:deep(.markdown-body pre code) {
  background: transparent;
  color: var(--text-secondary);
  padding: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-inline-start: 20px;
  margin: 6px 0;
}

:deep(.markdown-body li) { margin: 3px 0; }

:deep(.markdown-body p) { margin: 6px 0; }

:deep(.markdown-body strong) {
  color: var(--accent-light);
  font-weight: 600;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid var(--accent);
  padding: 4px 14px;
  margin: 10px 0;
  color: var(--text-secondary);
  background: var(--accent-soft);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 0.9em;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
}

:deep(.markdown-body th) {
  background: var(--bg-elevated);
  font-weight: 600;
}

:deep(.markdown-body tr:nth-child(even)) {
  background: rgba(0, 0, 0, 0.015);
}

:deep(.markdown-body a) {
  color: var(--accent-light);
  text-decoration: none;
}

:deep(.markdown-body a:hover) {
  text-decoration: underline;
}

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.15em;
  background: linear-gradient(to bottom, var(--accent), var(--accent-light));
  margin-inline-start: 3px;
  vertical-align: text-bottom;
  border-radius: 1px;
  animation: cursorBlink 0.7s step-end infinite;
}

@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}

@media (width < 640px) {
  .bubble {
    padding: 10px 14px;
  }
}
</style>