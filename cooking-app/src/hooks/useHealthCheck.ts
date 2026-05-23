import { onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { HEALTH_CHECK_INTERVAL } from '@/constants'

export const useHealthCheck = () => {
  const chatStore = useChatStore()
  let timer: ReturnType<typeof setInterval>

  onMounted(() => {
    chatStore.checkHealth()
    timer = setInterval(() => {
      chatStore.checkHealth()
    }, HEALTH_CHECK_INTERVAL)
  })

  onUnmounted(() => {
    clearInterval(timer)
  })
}