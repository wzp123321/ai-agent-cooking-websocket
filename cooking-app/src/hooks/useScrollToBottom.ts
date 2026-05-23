import { ref, watch, nextTick, onUnmounted, type Ref } from 'vue'

const SCROLL_NEAR_BOTTOM_THRESHOLD = 80
const USER_SCROLL_COOLDOWN_MS = 3000

export const useScrollToBottom = (source: Ref<unknown> | (() => unknown)) => {
  const containerRef = ref<HTMLElement | null>(null)

  let userScrolledUp = false
  let scrollCooldownTimer: ReturnType<typeof setTimeout> | null = null

  const isNearBottom = (): boolean => {
    const el = containerRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_NEAR_BOTTOM_THRESHOLD
  }

  const onScroll = (): void => {
    userScrolledUp = !isNearBottom()

    if (scrollCooldownTimer) clearTimeout(scrollCooldownTimer)
    scrollCooldownTimer = setTimeout(() => {
      userScrolledUp = false
    }, USER_SCROLL_COOLDOWN_MS)
  }

  watch(
    typeof source === 'function' ? source : () => source.value,
    async () => {
      await nextTick()
      if (containerRef.value && !userScrolledUp) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight
      }
    },
  )

  onUnmounted(() => {
    if (scrollCooldownTimer) clearTimeout(scrollCooldownTimer)
  })

  return { containerRef, onScroll }
}