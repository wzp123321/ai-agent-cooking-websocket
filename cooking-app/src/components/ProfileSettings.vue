<template>
  <div class="profile-overlay" v-if="visible" @click.self="$emit('close')">
    <div class="profile-panel">
      <div class="profile-header">
        <h2 class="profile-title">⚙️ 个人偏好设置</h2>
        <p class="profile-desc">设置后，Agent 会根据你的偏好调整回答</p>
        <button class="close-btn" @click="$emit('close')" title="关闭">✕</button>
      </div>

      <div class="profile-body">
        <div class="form-group">
          <label class="form-label">烹饪水平</label>
          <div class="radio-group">
            <label
              v-for="opt in skillOptions"
              :key="opt.value"
              class="radio-item"
              :class="{ active: form.skill_level === opt.value }"
            >
              <input
                type="radio"
                :value="opt.value"
                v-model="form.skill_level"
                hidden
              />
              <span class="radio-dot"></span>
              <span class="radio-text">{{ opt.label }}</span>
              <span class="radio-hint">{{ opt.hint }}</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">膳食模式</label>
          <select class="form-select" v-model="form.diet_type">
            <option value="">无特殊要求</option>
            <option v-for="d in dietOptions" :key="d.value" :value="d.value">
              {{ d.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">过敏食材</label>
          <div class="tag-input">
            <span
              v-for="(item, i) in form.allergies"
              :key="i"
              class="tag"
            >
              {{ item }}
              <button class="tag-remove" @click="removeAllergy(i)">✕</button>
            </span>
            <input
              class="tag-input-field"
              v-model="allergyInput"
              placeholder="输入后回车添加…"
              @keydown.enter.prevent="addAllergy"
            />
          </div>
          <span class="form-hint">如：花生、海鲜、牛奶</span>
        </div>

        <div class="form-group">
          <label class="form-label">不喜欢</label>
          <div class="tag-input">
            <span
              v-for="(item, i) in form.disliked"
              :key="i"
              class="tag tag-dislike"
            >
              {{ item }}
              <button class="tag-remove" @click="removeDisliked(i)">✕</button>
            </span>
            <input
              class="tag-input-field"
              v-model="dislikeInput"
              placeholder="输入后回车添加…"
              @keydown.enter.prevent="addDisliked"
            />
          </div>
          <span class="form-hint">如：香菜、苦瓜、肥肉</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            每日热量目标
            <span class="form-hint-inline">（0 = 不限制）</span>
          </label>
          <div class="calorie-input-wrap">
            <input
              type="number"
              class="form-input"
              v-model.number="form.calorie_goal"
              min="0"
              max="5000"
              step="100"
              placeholder="如：1800"
            />
            <span class="calorie-unit">大卡/天</span>
          </div>
        </div>
      </div>

      <div class="profile-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="save" :disabled="saving">
          {{ saving ? '保存中…' : '保存设置' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { getProfile, updateProfile } from '@/api/chat'
import type { UserProfile } from '@/types'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  close: []
  saved: [profile: UserProfile]
}>()

const skillOptions = [
  { value: 'beginner', label: '新手', hint: '需要详细步骤' },
  { value: 'intermediate', label: '中级', hint: '有一定基础' },
  { value: 'expert', label: '高手', hint: '专业级建议' },
]

const dietOptions = [
  { value: '生酮', label: '生酮饮食' },
  { value: '低卡', label: '低卡路里' },
  { value: '高蛋白', label: '高蛋白' },
  { value: '素食', label: '素食（蛋奶素）' },
  { value: '纯素', label: '纯素（Vegan）' },
  { value: '无麸质', label: '无麸质' },
  { value: '低FODMAP', label: '低FODMAP' },
  { value: '糖尿病友好', label: '糖尿病友好' },
]

const form = reactive({
  skill_level: 'intermediate' as UserProfile['skill_level'],
  diet_type: '',
  allergies: [] as string[],
  disliked: [] as string[],
  calorie_goal: 0,
})

const allergyInput = ref('')
const dislikeInput = ref('')
const saving = ref(false)

onMounted(async () => {
  try {
    const profile = await getProfile()
    form.skill_level = profile.skill_level
    form.diet_type = profile.diet_type
    form.allergies = profile.allergies
    form.disliked = profile.disliked
    form.calorie_goal = profile.calorie_goal
  } catch {
    console.warn('[Profile] 加载用户画像失败，使用默认值')
  }
})

function addAllergy() {
  const val = allergyInput.value.trim()
  if (val && !form.allergies.includes(val)) {
    form.allergies.push(val)
  }
  allergyInput.value = ''
}

function removeAllergy(i: number) {
  form.allergies.splice(i, 1)
}

function addDisliked() {
  const val = dislikeInput.value.trim()
  if (val && !form.disliked.includes(val)) {
    form.disliked.push(val)
  }
  dislikeInput.value = ''
}

function removeDisliked(i: number) {
  form.disliked.splice(i, 1)
}

async function save() {
  saving.value = true
  try {
    const profile = await updateProfile({
      skill_level: form.skill_level,
      diet_type: form.diet_type,
      allergies: form.allergies,
      disliked: form.disliked,
      calorie_goal: form.calorie_goal,
    })
    emit('saved', profile)
    emit('close')
  } catch (err) {
    console.error('[Profile] 保存失败：', err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.profile-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: fadeIn 0.25s var(--ease-out-expo);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.profile-panel {
  width: min(500px, 92vw);
  max-height: 85vh;
  background: var(--bg-secondary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s var(--ease-out-back);
  overflow: hidden;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.profile-header {
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--border);
  position: relative;
}

.profile-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 24px;
  right: 24px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-accent), transparent);
}

.profile-title {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
  letter-spacing: -0.01em;
}

.profile-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.close-btn {
  position: absolute;
  top: 18px;
  right: 20px;
  width: 34px;
  height: 34px;
  border: none;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.close-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  border-color: var(--border-light);
}

.profile-body {
  padding: 24px 28px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.form-hint-inline {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 400;
}

.radio-group {
  display: flex;
  gap: 8px;
}

.radio-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
  background: var(--bg-card);
}

.radio-item:hover {
  border-color: var(--border-accent);
  background: var(--bg-card-hover);
}

.radio-item.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--border-light);
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.radio-item.active .radio-dot {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-glow);
}

.radio-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.radio-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.form-select {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out-expo), box-shadow var(--duration-fast) var(--ease-out-expo);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.form-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.form-input {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out-expo), box-shadow var(--duration-fast) var(--ease-out-expo);
  width: 120px;
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.calorie-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.calorie-unit {
  font-size: 13px;
  color: var(--text-muted);
}

.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  min-height: 42px;
  align-items: center;
  transition: border-color var(--duration-fast) var(--ease-out-expo), box-shadow var(--duration-fast) var(--ease-out-expo);
}

.tag-input:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
}

.tag-dislike {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
}

.tag-remove {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  opacity: 0.6;
  transition: opacity var(--duration-fast);
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input-field {
  border: none;
  background: none;
  outline: none;
  color: var(--text-primary);
  font-size: 13px;
  flex: 1;
  min-width: 100px;
}

.tag-input-field::placeholder {
  color: var(--text-muted);
}

.profile-footer {
  padding: 18px 28px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: var(--bg-glass);
}

.btn {
  padding: 10px 22px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  border: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-light);
}

.btn-primary {
  background: var(--accent-gradient-soft);
  color: #fff;
  box-shadow: 0 2px 12px rgba(232,138,26,0.22);
}

.btn-primary:hover {
  box-shadow: 0 4px 20px rgba(232,138,26,0.35);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>