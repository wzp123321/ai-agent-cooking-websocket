<template>
  <Transition name="fade">
    <div v-if="visible" class="welcome-screen">
      <div class="welcome-emoji">👨‍🍳</div>
      <h2 class="welcome-title">你好！我是<span>{{ appName }}</span></h2>
      <p class="welcome-desc">
        我可以帮你解答各种烹饪问题，从家常小炒到复杂大菜，<br />
        从食材选购到烹饪技法，都难不倒我！
      </p>
      <div class="welcome-tags">
        <el-tag
          v-for="tag in tags"
          :key="tag.label"
          type="warning"
          effect="plain"
          round
        >
          {{ tag.label }}
        </el-tag>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { APP_NAME, WELCOME_TAGS } from '@/constants'

defineProps<{ visible: boolean }>()

const appName = APP_NAME
const tags = WELCOME_TAGS
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   WelcomeScreen — 清爽欢迎页
   光晕 · 渐变文字 · 悬浮标签 · 淡入淡出
   ══════════════════════════════════════════════════════════ */

.welcome-screen {
  text-align: center;
  padding: 64px 24px;
  max-width: 540px;
  margin: auto;
  position: relative;
}

.welcome-screen::before {
  content: '';
  position: absolute;
  top: -60px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(232,138,26,0.05) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
  animation: pulseGlow 4s ease-in-out infinite;
}

.welcome-emoji {
  font-size: 72px;
  margin-block-end: 20px;
  filter: drop-shadow(0 4px 16px rgba(232,138,26,0.2));
  animation: float 3s ease-in-out infinite;
  display: inline-block;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25%      { transform: translateY(-6px) rotate(-3deg); }
  75%      { transform: translateY(-12px) rotate(3deg); }
}

.welcome-title {
  font-size: 28px;
  font-weight: 800;
  margin-block-end: 12px;
  color: var(--text-primary);
  line-height: 1.3;
  letter-spacing: -0.03em;
}

.welcome-title span {
  background: var(--accent-gradient-soft);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-desc {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.8;
  margin-block-end: 32px;
}

.welcome-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.welcome-tags :deep(.el-tag) {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-secondary) !important;
  font-weight: 500;
  padding: 6px 16px;
  font-size: 13px;
  transition:
    border-color var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo),
    background var(--duration-fast) var(--ease-out-expo),
    transform var(--duration-fast) var(--ease-out-back);
}

.welcome-tags :deep(.el-tag:hover) {
  border-color: var(--border-accent) !important;
  color: var(--accent-light) !important;
  background: var(--bg-card-hover) !important;
  transform: translateY(-2px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s var(--ease-out-expo);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>