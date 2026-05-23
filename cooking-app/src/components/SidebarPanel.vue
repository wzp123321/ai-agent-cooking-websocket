<template>
  <!--
    ═══════════════════════════════════════════════════════
    SidebarPanel — 侧边栏组件
    ═══════════════════════════════════════════════════════
    组成模块：
      ① Logo 区域（品牌展示）
      ② 新建对话按钮
      ③ 历史会话列表（滚动）
      ④ 快捷提问按钮（引导用户快速开始）
      ⑤ 底部 Agent 在线状态指示灯

    响应式：
      - 桌面端：直接嵌入 ChatView 左侧（display: flex column）
      - 移动端：作为 el-drawer 的 body 内容使用
  -->
  <div class="sidebar">

    <!-- ══ ① Logo 区域 ══ -->
    <div class="sidebar-header">
      <div class="logo">
        <!-- 品牌图标 + 名称 -->
        <span class="logo-icon">🍳</span>
        <span class="logo-text">{{ APP_NAME }}</span>
      </div>
      <p class="logo-sub">{{ APP_SUBTITLE }}</p>
    </div>

    <!-- ══ ② 新建对话按钮 ══ -->
    <el-button
      type="primary"
      class="new-chat-btn"
      :icon="Plus"
      @click="handleNewChat"
    >
      新建对话
    </el-button>

    <!-- ══ ③ 历史会话列表 ══ -->
    <div class="session-section">
      <p class="section-title">历史对话</p>

      <div class="session-list">
        <!-- 遍历当前所有会话，active 状态高亮当前会话 -->
        <div
          v-for="session in chatStore.sessions"
          :key="session.id"
          class="session-item"
          :class="{ active: session.id === chatStore.currentSessionId }"
          @click="handleSwitchSession(session.id)"
        >
          <!-- 会话图标 -->
          <el-icon class="session-icon"><ChatLineRound /></el-icon>
          <!-- 会话标题（最多 20 字，超出省略） -->
          <span class="session-title">{{ session.title }}</span>
          <!-- 删除按钮（hover 时显示，阻止冒泡避免误触发切换） -->
          <el-button
            class="session-del"
            :icon="Close"
            text
            size="small"
            @click.stop="handleDeleteSession(session.id)"
          />
        </div>
      </div>
    </div>

    <!-- ══ ④ 快捷提问 ══ -->
    <div class="quick-section">
      <p class="section-title">🌟 快捷提问</p>
      <div class="quick-list">
        <!-- 点击后直接发送对应问题 -->
        <div
          v-for="q in QUICK_QUESTIONS"
          :key="q"
          class="quick-btn"
          @click="handleQuickQuestion(q)"
        >
          {{ q }}
        </div>
      </div>
    </div>

    <!-- ══ ⑤ 底部状态指示器 ══ -->
    <div class="sidebar-footer">
      <!-- 状态指示灯（绿=在线，红=离线） -->
      <span
        class="status-dot"
        :class="chatStore.agentOnline ? 'online' : 'offline'"
      />
      <span class="status-text">
        {{ chatStore.agentOnline ? 'Agent 已连接' : 'Agent 未连接' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SidebarPanel
 *
 * 职责：
 *   - 展示会话列表（支持切换/删除）
 *   - 提供新建对话入口
 *   - 内置快捷问题引导
 *   - 实时显示 Agent 在线状态
 *
 * 生命周期：
 *   - onMounted：立即执行健康检查 + 启动定时轮询
 *   - onUnmounted：组件销毁时清理定时器（防止内存泄漏）
 */
import { Plus, Close, ChatLineRound } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { QUICK_QUESTIONS, APP_NAME, APP_SUBTITLE } from '@/constants'
import { useHealthCheck, useConversation } from '@/hooks'

/**
 * emit 定义
 * close：关闭抽屉（移动端点击会话后触发）
 */
const emit = defineEmits<{ close: [] }>()

const chatStore = useChatStore()
const { sendMessage } = useConversation()

useHealthCheck()

// ── 事件处理 ──────────────────────────────────────────────

/** 新建对话 */
const handleNewChat = () => {
  chatStore.newSession()
  emit('close')
}

/** 切换会话并加载历史 */
const handleSwitchSession = (id: string) => {
  chatStore.switchSession(id)
  chatStore.loadHistory(id)
  emit('close')
}

/** 删除指定会话 */
const handleDeleteSession = async (id: string) => {
  await ElMessageBox.confirm(
    '确定要删除这条对话吗？删除后无法恢复。',
    '提示',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
  await chatStore.deleteSession(id)
}

/** 点击快捷问题，直接作为首条消息发送 */
const handleQuickQuestion = (q: string) => {
  sendMessage(q)
  emit('close')
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   SidebarPanel — 奢华侧边栏
   渐变品牌区 · 流光分割线 · 悬浮卡片 · 精致状态灯
   ══════════════════════════════════════════════════════════ */

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: clamp(16px, 2.5vw, 24px) clamp(14px, 2vw, 20px);
  gap: clamp(14px, 2vw, 20px);
  overflow: hidden;
}

/* ── 品牌区 ───────────────────────────────────────────── */
.sidebar-header {
  text-align: center;
  padding-block-end: clamp(12px, 2vw, 18px);
  border-bottom: 1px solid var(--border);
  position: relative;
}

.sidebar-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-accent), transparent);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.logo-icon {
  font-size: 32px;
  filter: drop-shadow(0 2px 8px rgba(232,138,26,0.25));
  transition: transform var(--duration-fast) var(--ease-out-back);
}

.logo-icon:hover {
  transform: scale(1.1) rotate(-5deg);
}

.logo-text {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: var(--accent-gradient-soft);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.logo-sub {
  color: var(--text-muted);
  font-size: 12px;
  margin-block-start: 6px;
  font-weight: 400;
}

/* ── 新建按钮 ─────────────────────────────────────────── */
:deep(.new-chat-btn) {
  width: 100%;
  height: 44px;
  border-radius: var(--radius-md) !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  letter-spacing: 0.01em;
  background: var(--accent-gradient-soft) !important;
  border: none !important;
  box-shadow: 0 2px 12px rgba(232,138,26,0.18) !important;
  transition:
    transform var(--duration-fast) var(--ease-out-back),
    box-shadow var(--duration-normal) var(--ease-out-expo) !important;
}

:deep(.new-chat-btn:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(232,138,26,0.28) !important;
}

:deep(.new-chat-btn:active) {
  transform: scale(0.97);
}

/* ── 区块标题 ─────────────────────────────────────────── */
.section-title {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-block-end: 10px;
  font-weight: 600;
}

/* ── 会话列表 ─────────────────────────────────────────── */
.session-section {
  flex-shrink: 0;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: clamp(140px, 22vh, 200px);
  overflow-y: auto;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo),
    transform var(--duration-fast) var(--ease-out-back);
  font-size: 13px;
  color: var(--text-secondary);
  position: relative;
}

.session-item::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid transparent;
  transition: border-color var(--duration-fast) var(--ease-out-expo);
  pointer-events: none;
}

.session-item:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.session-item:hover::before {
  border-color: var(--border-light);
}

.session-item:active {
  transform: scale(0.98);
}

.session-item.active {
  background: var(--accent-soft);
  color: var(--accent-light);
  font-weight: 600;
}

.session-item.active::before {
  border-color: var(--border-accent);
}

.session-item.active::after {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
}

.session-icon { flex-shrink: 0; font-size: 14px; }

.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-del {
  opacity: 0;
  flex-shrink: 0;
  transition: opacity var(--duration-fast) var(--ease-out-expo);
}

.session-item:hover .session-del { opacity: 1; }

:deep(.session-item .session-del:hover) {
  color: var(--danger) !important;
}

/* ── 快捷问题 ─────────────────────────────────────────── */
.quick-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.quick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.quick-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: start;
  transition:
    background var(--duration-fast) var(--ease-out-expo),
    color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo),
    transform var(--duration-fast) var(--ease-out-back),
    box-shadow var(--duration-fast) var(--ease-out-expo);
  line-height: 1.5;
  position: relative;
  overflow: hidden;
}

.quick-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-gradient-soft);
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-expo);
}

.quick-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--border-accent);
  box-shadow: var(--shadow-sm);
  transform: translateX(2px);
}

.quick-btn:active {
  transform: scale(0.98);
}

/* ── 底部状态 ─────────────────────────────────────────── */
.sidebar-footer {
  margin-block-start: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  padding-block-start: 14px;
  border-block-start: 1px solid var(--border);
  position: relative;
}

.sidebar-footer::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-accent), transparent);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}

.status-dot.online {
  background: var(--success);
  box-shadow: 0 0 10px rgba(16,185,129,0.5);
  animation: pulseGlow 3s ease-in-out infinite;
}

.status-dot.offline {
  background: var(--danger);
  box-shadow: 0 0 6px rgba(239,68,68,0.25);
}

.status-text {
  font-weight: 500;
}
</style>
