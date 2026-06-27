import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, todayStr, makeUndoStack } from '../lib/utils'

const DEFAULT_HABITS = ['Morning routine', 'Study session', 'Physio exercises']
const DEFAULT_METRICS = [
  { id: 'weight', label: 'Weight', unit: 'kg' },
  { id: 'bp', label: 'Blood Pressure', unit: 'mmHg', isBP: true },
  { id: 'sugar', label: 'Sugar', unit: 'mg/dL' },
  { id: 'kneeGap', label: 'Knee — Thigh Gap (R - L)', unit: 'cm' },
]

function buildDefault() {
  return {
    habits: DEFAULT_HABITS.map((name) => ({ id: uid('h'), name, log: {} })),
    metrics: DEFAULT_METRICS.map((m) => ({ ...m, entries: [] })),
  }
}

function last30Dates() {
  const dates = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

const undoStack = makeUndoStack(20)

export default function Progress({ flashSaved }) {
  const [data, setData] = useState(null)
  const [habitInput, setHabitInput] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded
    try {
      const result = await storageGet(STORAGE_KEYS.progress)
      if (result && result.value) loaded = JSON.parse(result.value)
      else {
        loaded = buildDefault()
        await persist(loaded)
      }
    } catch {
      loaded = buildDefault()
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.progress, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Progress save failed', e)
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

  const today = todayStr()
  const dates = last30Dates()

  function toggleHabitToday(habitId) {
    update((d) => {
      const habit = d.habits.find((h) => h.id === habitId)
      if (habit.log[today]) delete habit.log[today]
      else habit.log[today] = true
    })
  }

  function removeHabit(habitId) {
    update((d) => {
      d.habits = d.habits.filter((h) => h.id !== habitId)
    })
  }

  function addHabit() {
    const val = habitInput.trim()
    if (!val) return
    update((d) => d.habits.push({ id: uid('h'), name: val, log: {} }))
    setHabitInput('')
  }

  function addMetricEntry(metricId, entry) {
    update((d) => {
      const metric = d.metrics.find((m) => m.id === metricId)
      metric.entries.push(entry)
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

  function handleReset() {
    if (!confirm('Reset Progress back to default habits and clear all logged data? (You can still hit Undo right after if you change your mind.)'))
      return
    undoStack.push(data)
    const fresh = buildDefault()
    setData(fresh)
    persist(fresh)
  }

  return (
    <div>
      <div className="tab-toolbar">
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
        <button className="btn-outline" onClick={handleReset}>
          ⟲ Reset to defaults
        </button>
      </div>

      <div className="gcard">
        <h2>Habit Streaks</h2>
        <div className="gsub">Tap "Log today" on any habit you completed. Grid shows the last 30 days.</div>
        {data.habits.map((habit) => {
          const doneCount = dates.filter((d) => habit.log[d]).length
          return (
            <div className="streak-row" key={habit.id}>
              <div className="streak-name">{habit.name}</div>
              <div className="streak-grid">
                {dates.map((d) => (
                  <div key={d} className={`streak-cell ${habit.log[d] ? 'done' : ''}`} title={d}></div>
                ))}
              </div>
              <div className="streak-count">{doneCount}/30 days</div>
              <button className="btn" onClick={() => toggleHabitToday(habit.id)}>
                {habit.log[today] ? '✓ Today' : 'Log today'}
              </button>
              <button className="del-x" onClick={() => removeHabit(habit.id)}>
                ✕
              </button>
            </div>
          )
        })}
        <div className="add-row" style={{ marginTop: '10px' }}>
          <input
            type="text"
            placeholder="Add a new habit to track..."
            value={habitInput}
            onChange={(e) => setHabitInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHabit()}
          />
          <button className="btn" onClick={addHabit}>
            Add
          </button>
        </div>
      </div>

      <div className="gcard">
        <h2>Health Trends</h2>
        <div className="gsub">Log a reading whenever you check — chart updates automatically.</div>
        {data.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} onAddEntry={(entry) => addMetricEntry(metric.id, entry)} />
        ))}
      </div>
    </div>
  )
}

function MetricCard({ metric, onAddEntry }) {
  const [date, setDate] = useState(todayStr())
  const [val1, setVal1] = useState('')
  const [val2, setVal2] = useState('')

  const sorted = [...metric.entries].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  let latestText = 'No entries yet'
  if (latest) {
    latestText = metric.isBP ? `${latest.sys}/${latest.dia} on ${latest.date}` : `${latest.value} ${metric.unit} on ${latest.date}`
  }

  function handleLog() {
    if (metric.isBP) {
      const sys = parseFloat(val1)
      const dia = parseFloat(val2)
      if (isNaN(sys) || isNaN(dia)) return
      onAddEntry({ date: date || todayStr(), sys, dia })
    } else {
      const v = parseFloat(val1)
      if (isNaN(v)) return
      onAddEntry({ date: date || todayStr(), value: v })
    }
    setVal1('')
    setVal2('')
  }

  return (
    <div className="metric-card">
      <div className="metric-head">
        <span className="mtitle">{metric.label}</span>
        <span className="mlatest">{latestText}</span>
      </div>
      <div className="metric-entry-row">
        <input type="date" className="mdate" value={date} onChange={(e) => setDate(e.target.value)} />
        {metric.isBP ? (
          <>
            <input type="number" placeholder="Sys" value={val1} onChange={(e) => setVal1(e.target.value)} />
            <input type="number" placeholder="Dia" value={val2} onChange={(e) => setVal2(e.target.value)} />
          </>
        ) : (
          <input type="number" step="0.1" placeholder={metric.unit} value={val1} onChange={(e) => setVal1(e.target.value)} />
        )}
        <button className="btn" onClick={handleLog}>
          Log
        </button>
      </div>

      {sorted.length >= 1 && <MetricChart metric={metric} sorted={sorted} />}

      <div className="metric-history">
        {sorted
          .slice(-6)
          .reverse()
          .map((e, i) => (
            <span key={i}>{metric.isBP ? `${e.date}: ${e.sys}/${e.dia}` : `${e.date}: ${e.value}`}</span>
          ))}
      </div>
    </div>
  )
}

function MetricChart({ metric, sorted }) {
  const w = 600,
    h = 90,
    pad = 10

  function buildPath(points, color) {
    if (points.length === 0) return null
    const vals = points.map((p) => p.v)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min || 1
    const stepX = points.length > 1 ? (w - 2 * pad) / (points.length - 1) : 0
    const coords = points.map((p, i) => {
      const x = pad + i * stepX
      const y = h - pad - ((p.v - min) / range) * (h - 2 * pad)
      return [x, y]
    })
    const d = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')
    return (
      <g key={color}>
        <path d={d} fill="none" stroke={color} strokeWidth="2" />
        {coords.map((c, i) => (
          <circle key={i} cx={c[0]} cy={c[1]} r="2.5" fill={color} />
        ))}
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="metric-chart" preserveAspectRatio="none">
      {metric.isBP ? (
        <>
          {buildPath(sorted.map((e) => ({ v: e.sys })), '#BD4F36')}
          {buildPath(sorted.map((e) => ({ v: e.dia })), '#C98A2E')}
        </>
      ) : (
        buildPath(sorted.map((e) => ({ v: e.value })), '#6E5A8C')
      )}
    </svg>
  )
}
