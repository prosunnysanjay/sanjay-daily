import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'

const undoStack = makeUndoStack(20)

const LISTS = [
  { key: 'personal', title: 'Personal Channel — Content Ideas' },
  { key: 'study', title: 'Study Channel — Content Ideas' },
  { key: 'business', title: 'Other Business Ideas' },
]

export default function Earning({ flashSaved }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded = { personal: [], study: [], business: [] }
    try {
      const result = await storageGet(STORAGE_KEYS.earning)
      if (result && result.value) loaded = JSON.parse(result.value)
      else await persist(loaded)
    } catch {
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.earning, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Earning save failed', e)
    }
  }

  function update(mutator, { snapshot = true } = {}) {
    setData((prev) => {
      if (snapshot) undoStack.push(prev)
      const next = structuredClone(prev)
      mutator(next)
      persist(next)
      return next
    })
  }

  if (!data) return <div className="empty-state-sm">Loading…</div>

  function addIdea(listKey) {
    undoStack.push(data)
    update((d) => d[listKey].push({ id: uid('idea'), title: '', desc: '' }), { snapshot: false })
  }

  function patchIdea(listKey, id, patch) {
    update(
      (d) => {
        const idea = d[listKey].find((i) => i.id === id)
        Object.assign(idea, patch)
      },
      { snapshot: false },
    )
  }

  function removeIdea(listKey, id) {
    update((d) => {
      d[listKey] = d[listKey].filter((i) => i.id !== id)
    })
  }

  function reorderIdeas(listKey, fromIdx, toIdx) {
    update((d) => {
      d[listKey] = reorderArray(d[listKey], fromIdx, toIdx)
    })
  }

  function handleUndo() {
    if (!undoStack.canUndo()) {
      alert('Nothing to undo yet.')
      return
    }
    const prev = undoStack.pop()
    setData(prev)
    persist(prev)
  }

  return (
    <div>
      <div className="tab-toolbar">
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
      </div>

      {LISTS.map(({ key, title }) => (
        <div className="gcard" key={key}>
          <h2>{title}</h2>
          {data[key].length === 0 && <div className="empty-state-sm">No ideas yet.</div>}
          {data[key].map((idea, idx) => (
            <div className="idea-row" key={idea.id} {...dragHandlers(idx, (from, to) => reorderIdeas(key, from, to))}>
              <span className="drag-handle">⠿</span>
              <input
                className="idea-title"
                placeholder="Idea"
                value={idea.title}
                onChange={(e) => patchIdea(key, idea.id, { title: e.target.value })}
              />
              <textarea
                className="idea-desc"
                placeholder="Description..."
                value={idea.desc}
                onChange={(e) => patchIdea(key, idea.id, { desc: e.target.value })}
              />
              <button className="del-x" title="Delete" onClick={() => removeIdea(key, idea.id)}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn-outline" style={{ marginTop: '8px' }} onClick={() => addIdea(key)}>
            + Add Idea
          </button>
        </div>
      ))}
    </div>
  )
}
