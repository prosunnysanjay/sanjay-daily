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
  if (!Array.isArray(arr) || fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) {
    return Array.isArray(arr) ? arr.slice() : arr
  }
  const copy = arr.slice()
  const [item] = copy.splice(fromIndex, 1)
  copy.splice(toIndex, 0, item)
  return copy
}

// React-friendly drag handlers: spread these onto a row element along with
// a .drag-handle child, and pass index + a reorder callback. Pass a listId
// when multiple separate lists can be visible/draggable at once (e.g. tasks
// in different sections) so a drag started in one list is ignored if dropped
// onto another — otherwise the dropped-on list reorders using an index that
// belongs to a different list, which can silently corrupt data.
export function dragHandlers(index, onReorder, listId = null) {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', JSON.stringify({ index, listId }))
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
      let payload
      try {
        payload = JSON.parse(e.dataTransfer.getData('text/plain'))
      } catch {
        return
      }
      if (!payload || typeof payload.index !== 'number') return
      if ((payload.listId ?? null) !== listId) return
      const fromIndex = payload.index
      const toIndex = index
      if (fromIndex === toIndex) return
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
