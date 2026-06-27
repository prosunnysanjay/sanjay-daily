import { storageGet, storageSet, ALL_STORAGE_KEYS } from './supabase'

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str == null ? '' : String(str)
  return div.innerHTML
}

// Simple undo stack: keeps deep-cloned snapshots, capped to a limit.
export function makeUndoStack(limit = 20) {
  const stack = []
  return {
    push(stateObj) {
      stack.push(JSON.parse(JSON.stringify(stateObj)))
      if (stack.length > limit) stack.shift()
    },
    pop() {
      return stack.pop()
    },
    canUndo() {
      return stack.length > 0
    },
  }
}

export function reorderArray(arr, fromIndex, toIndex) {
  const copy = arr.slice()
  const [item] = copy.splice(fromIndex, 1)
  copy.splice(toIndex, 0, item)
  return copy
}

// React-friendly drag handlers: spread these onto a row element along with
// a .drag-handle child, and pass index + a reorder callback.
export function dragHandlers(index, onReorder) {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
      e.currentTarget.classList.add('dragging')
    },
    onDragEnd: (e) => {
      e.currentTarget.classList.remove('dragging')
    },
    onDragOver: (e) => {
      e.preventDefault()
      e.currentTarget.classList.add('drag-over')
    },
    onDragLeave: (e) => {
      e.currentTarget.classList.remove('drag-over')
    },
    onDrop: (e) => {
      e.preventDefault()
      e.currentTarget.classList.remove('drag-over')
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
      const toIndex = index
      if (fromIndex === toIndex || isNaN(fromIndex)) return
      onReorder(fromIndex, toIndex)
    },
  }
}

export async function exportAllData() {
  const out = {}
  for (const key of ALL_STORAGE_KEYS) {
    try {
      const result = await storageGet(key)
      out[key] = result ? JSON.parse(result.value) : null
    } catch {
      out[key] = null
    }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sanjay-daily-backup-${todayStr()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importAllData(file) {
  const text = await file.text()
  const parsed = JSON.parse(text)
  for (const key of ALL_STORAGE_KEYS) {
    if (parsed[key] !== undefined && parsed[key] !== null) {
      await storageSet(key, JSON.stringify(parsed[key]))
    }
  }
  window.location.reload()
}
