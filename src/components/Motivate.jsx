import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'

const undoStack = makeUndoStack(20)

const SEED_QUOTES = [
  'Discipline is choosing between what you want now and what you want most.',
  'Small steps every day beat big plans that never start.',
  'You don\u2019t have to be great to start, but you have to start to be great.',
]

function buildSeed() {
  const quotes = SEED_QUOTES.map((q) => ({ id: uid('q'), text: q }))
  return { quotes, featuredId: quotes[0].id }
}

export default function Motivate({ flashSaved }) {
  const [data, setData] = useState(null)
  const [quoteInput, setQuoteInput] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded
    try {
      const result = await storageGet(STORAGE_KEYS.motivate)
      if (result && result.value) loaded = JSON.parse(result.value)
      else {
        loaded = buildSeed()
        await persist(loaded)
      }
    } catch {
      loaded = buildSeed()
      await persist(loaded)
    }
    if (!loaded.featuredId && loaded.quotes.length) loaded.featuredId = loaded.quotes[0].id
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.motivate, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Motivate save failed', e)
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

  const featured = data.quotes.find((q) => q.id === data.featuredId) || data.quotes[0]

  function setFeatured(id) {
    update((d) => {
      d.featuredId = id
    })
  }

  function patchQuote(id, newText) {
    update((d) => {
      const q = d.quotes.find((x) => x.id === id)
      if (newText.trim()) q.text = newText.trim()
    })
  }

  function deleteQuote(id) {
    update((d) => {
      d.quotes = d.quotes.filter((q) => q.id !== id)
      if (d.featuredId === id) d.featuredId = d.quotes.length ? d.quotes[0].id : null
    })
  }

  function addQuote() {
    const val = quoteInput.trim()
    if (!val) return
    update((d) => {
      const newQuote = { id: uid('q'), text: val }
      d.quotes.push(newQuote)
      if (!d.featuredId) d.featuredId = newQuote.id
    })
    setQuoteInput('')
  }

  function reorderQuotes(fromIdx, toIdx) {
    update((d) => {
      d.quotes = reorderArray(d.quotes, fromIdx, toIdx)
    })
  }

  function shuffle() {
    if (data.quotes.length < 2) return
    let next
    do {
      next = data.quotes[Math.floor(Math.random() * data.quotes.length)]
    } while (next.id === data.featuredId)
    setFeatured(next.id)
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

      <div className="featured-quote">
        <div className="fq-text">{featured ? featured.text : 'Add a few lines below to get started.'}</div>
        <button className="btn-outline fq-shuffle" onClick={shuffle}>
          Shuffle
        </button>
      </div>

      <div className="gcard">
        <h2>Your Collection</h2>
        {data.quotes.length === 0 && <div className="empty-state-sm">No lines yet — add one below.</div>}
        {data.quotes.map((q, idx) => (
          <QuoteRow
            key={q.id}
            quote={q}
            index={idx}
            isFeatured={q.id === data.featuredId}
            onStar={() => setFeatured(q.id)}
            onEdit={(text) => patchQuote(q.id, text)}
            onDelete={() => deleteQuote(q.id)}
            onReorder={reorderQuotes}
          />
        ))}
        <div className="add-row" style={{ marginTop: '10px' }}>
          <input
            type="text"
            placeholder="Add a line that motivates you..."
            value={quoteInput}
            onChange={(e) => setQuoteInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addQuote()}
          />
          <button className="btn" onClick={addQuote}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function QuoteRow({ quote, index, isFeatured, onStar, onEdit, onDelete, onReorder }) {
  return (
    <div className="quote-row" {...dragHandlers(index, onReorder)}>
      <span className="drag-handle">⠿</span>
      <button className={`star-btn ${isFeatured ? 'active' : ''}`} title={isFeatured ? 'Currently featured' : 'Make this the featured line'} onClick={onStar}>
        ★
      </button>
      <span
        className="qtext"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onEdit(e.target.textContent)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.target.blur()
          }
        }}
      >
        {quote.text}
      </span>
      <button className="del-x" title="Delete" onClick={onDelete}>
        ✕
      </button>
    </div>
  )
}
