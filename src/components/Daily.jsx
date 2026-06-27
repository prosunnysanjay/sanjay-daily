import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray } from '../lib/utils'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DEFAULT_TIMETABLE = [
  { time: '5:30', activity: 'Wake up' },
  { time: '6:00', activity: 'Running or walk' },
  { time: '6:30', activity: 'Water, then meditation + short workout' },
  { time: '7:00', activity: 'Start studying' },
  { time: '10:30', activity: 'Proper meal (rice/roti and curry)' },
  { time: '11:00', activity: 'Start studying' },
  { time: '1:00', activity: 'Break (videos, movies, songs)' },
  { time: '2:00', activity: 'Start studying' },
  { time: '5:00', activity: 'Break' },
  { time: '7:30', activity: 'Dinner' },
  { time: '9:00', activity: 'Plan for the next day' },
]

function buildDefaultData() {
  const timetable = {}
  DAYS.forEach((d) => {
    timetable[d] = DEFAULT_TIMETABLE.map((slot) => ({ id: uid('s'), time: slot.time, activity: slot.activity }))
  })
  return {
    focus: [],
    sections: [
      {
        id: 'work',
        label: 'Work & Career',
        color: '#5C7A99',
        tasks: [
          { id: uid('t'), text: 'Apply to jobs/portals (morning routine)', done: false, starred: false },
          { id: uid('t'), text: 'AI DevOps project — next step', done: false, starred: false },
        ],
      },
      {
        id: 'study',
        label: "Study (pick today's focus)",
        color: '#6E5A8C',
        tasks: [
          { id: uid('t'), text: 'Revision', done: false, starred: false },
          { id: uid('t'), text: 'Python', done: false, starred: false },
          { id: uid('t'), text: 'AZ-305', done: false, starred: false },
          { id: uid('t'), text: 'AI-900', done: false, starred: false },
          { id: uid('t'), text: 'AI-102', done: false, starred: false },
          { id: uid('t'), text: 'AZ-104 renewal', done: false, starred: false },
          { id: uid('t'), text: 'SC-500 (replacing AZ-500)', done: false, starred: false },
        ],
      },
      {
        id: 'health',
        label: 'Health & Rehab',
        color: '#8A9A7E',
        tasks: [
          { id: uid('t'), text: 'Left knee physio exercises', done: false, starred: false },
          { id: uid('t'), text: 'Track muscle/size progress (left vs right leg)', done: false, starred: false },
        ],
      },
      {
        id: 'food',
        label: 'Food',
        color: '#B08A3E',
        tasks: [
          { id: uid('t'), text: "Check today's meal plan / batch-cook status", done: false, starred: false },
          { id: uid('t'), text: '4pm snack/fruit', done: false, starred: false },
        ],
      },
      {
        id: 'other',
        label: 'Other',
        color: '#B6562F',
        tasks: [
          { id: uid('t'), text: 'English speaking practice', done: false, starred: false },
          { id: uid('t'), text: 'Prayer before sleep', done: false, starred: false },
        ],
      },
    ],
    timetable,
    activeDay: DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1],
  }
}

export default function Daily({ flashSaved }) {
  const [data, setData] = useState(null)
  const [collapsedSections, setCollapsedSections] = useState({})
  const [focusInput, setFocusInput] = useState('')
  const [sectionInputs, setSectionInputs] = useState({})
  const [ttTimeInput, setTtTimeInput] = useState('')
  const [ttActivityInput, setTtActivityInput] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded
    try {
      const result = await storageGet(STORAGE_KEYS.daily)
      loaded = result && result.value ? JSON.parse(result.value) : buildDefaultData()
      if (!result || !result.value) await persist(loaded)
    } catch {
      loaded = buildDefaultData()
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.daily, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Daily save failed', e)
    }
  }

  function update(mutator) {
    setData((prev) => {
      const next = structuredClone(prev)
      mutator(next)
      persist(next)
      return next
    })
  }

  if (!data) return <div className="empty-state-sm">Loading…</div>

  function addFocus() {
    const val = focusInput.trim()
    if (!val) return
    update((d) => d.focus.push({ id: uid('f'), text: val, done: false }))
    setFocusInput('')
  }

  function toggleFocusDone(id) {
    update((d) => {
      const item = d.focus.find((f) => f.id === id)
      if (item) item.done = !item.done
    })
  }

  function removeFocus(id) {
    update((d) => {
      d.focus = d.focus.filter((f) => f.id !== id)
    })
  }

  function editFocusText(id, newText) {
    update((d) => {
      const item = d.focus.find((f) => f.id === id)
      if (item && newText.trim()) item.text = newText.trim()
    })
  }

  function addSectionTask(sectionId) {
    const val = (sectionInputs[sectionId] || '').trim()
    if (!val) return
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      section.tasks.push({ id: uid('t'), text: val, done: false, starred: false })
    })
    setSectionInputs((prev) => ({ ...prev, [sectionId]: '' }))
  }

  function toggleTaskDone(sectionId, taskId) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      const task = section.tasks.find((t) => t.id === taskId)
      if (task) task.done = !task.done
    })
  }

  function editTaskText(sectionId, taskId, newText) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      const task = section.tasks.find((t) => t.id === taskId)
      if (task && newText.trim()) task.text = newText.trim()
    })
  }

  function removeTask(sectionId, taskId) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      section.tasks = section.tasks.filter((t) => t.id !== taskId)
    })
  }

  function starTask(sectionId, taskId) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      const task = section.tasks.find((t) => t.id === taskId)
      const alreadyInFocus = d.focus.some((f) => f.id === 'star_' + taskId)
      if (!alreadyInFocus) {
        d.focus.push({ id: 'star_' + taskId, text: task.text, done: false })
        task.starred = true
      }
    })
  }

  function toggleSectionCollapse(sectionId) {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }

  // ---- Timetable ----
  function setActiveDay(day) {
    update((d) => {
      d.activeDay = day
    })
  }

  function editSlotTime(slotId, newTime) {
    update((d) => {
      const slot = d.timetable[d.activeDay].find((s) => s.id === slotId)
      if (slot && newTime.trim()) slot.time = newTime.trim()
    })
  }

  function editSlotActivity(slotId, newActivity) {
    update((d) => {
      const slot = d.timetable[d.activeDay].find((s) => s.id === slotId)
      if (slot && newActivity.trim()) slot.activity = newActivity.trim()
    })
  }

  function removeSlot(slotId) {
    update((d) => {
      d.timetable[d.activeDay] = d.timetable[d.activeDay].filter((s) => s.id !== slotId)
    })
  }

  function addSlot() {
    if (!ttTimeInput.trim() || !ttActivityInput.trim()) return
    update((d) => {
      d.timetable[d.activeDay].push({ id: uid('s'), time: ttTimeInput.trim(), activity: ttActivityInput.trim() })
    })
    setTtTimeInput('')
    setTtActivityInput('')
  }

  function resetDay() {
    update((d) => {
      d.timetable[d.activeDay] = DEFAULT_TIMETABLE.map((slot) => ({
        id: uid('s'),
        time: slot.time,
        activity: slot.activity,
      }))
    })
  }

  function reorderSlots(fromIdx, toIdx) {
    update((d) => {
      d.timetable[d.activeDay] = reorderArray(d.timetable[d.activeDay], fromIdx, toIdx)
    })
  }

  const slots = data.timetable[data.activeDay] || []

  return (
    <div className="columns">
      <div>
        <div className="focus-zone">
          <ul className="focus-list">
            {data.focus.length === 0 && (
              <li className="focus-empty">No top priorities set for today. Add one below.</li>
            )}
            {data.focus.map((item) => (
              <FocusRow
                key={item.id}
                item={item}
                onToggle={() => toggleFocusDone(item.id)}
                onEdit={(text) => editFocusText(item.id, text)}
                onRemove={() => removeFocus(item.id)}
              />
            ))}
          </ul>
          <div className="add-row">
            <input
              type="text"
              placeholder="Add a top priority for today..."
              maxLength={140}
              value={focusInput}
              onChange={(e) => setFocusInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFocus()}
            />
            <button onClick={addFocus}>Add</button>
          </div>
        </div>

        {data.sections.map((section) => {
          const collapsed = !!collapsedSections[section.id]
          const openCount = section.tasks.filter((t) => !t.done).length
          return (
            <div key={section.id} className={`section ${collapsed ? 'collapsed' : ''}`}>
              <div className="section-head" onClick={() => toggleSectionCollapse(section.id)}>
                <span className="dot" style={{ background: section.color }}></span>
                <h2>{section.label}</h2>
                <span className="count">{openCount} open</span>
                <span className="chevron">▾</span>
              </div>
              <div className="section-body">
                {section.tasks.length === 0 && <div className="empty-section">Nothing here yet.</div>}
                {section.tasks.length > 0 && (
                  <ul className="task-list">
                    {section.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onToggle={() => toggleTaskDone(section.id, task.id)}
                        onEdit={(text) => editTaskText(section.id, task.id, text)}
                        onStar={() => starTask(section.id, task.id)}
                        onRemove={() => removeTask(section.id, task.id)}
                      />
                    ))}
                  </ul>
                )}
                <div className="section-add">
                  <input
                    type="text"
                    placeholder={`Add to ${section.label}...`}
                    maxLength={140}
                    value={sectionInputs[section.id] || ''}
                    onChange={(e) => setSectionInputs((prev) => ({ ...prev, [section.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addSectionTask(section.id)}
                  />
                  <button onClick={() => addSectionTask(section.id)}>Add</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div>
        <div className="timetable-card">
          <div className="tt-head">
            <h2>Timetable</h2>
            <div className="day-tabs">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className={`day-tab ${d === data.activeDay ? 'active' : ''}`}
                  onClick={() => setActiveDay(d)}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div className="tt-body">
            {slots.map((slot, idx) => (
              <TimetableRow
                key={slot.id}
                slot={slot}
                index={idx}
                onEditTime={(val) => editSlotTime(slot.id, val)}
                onEditActivity={(val) => editSlotActivity(slot.id, val)}
                onRemove={() => removeSlot(slot.id)}
                onReorder={reorderSlots}
              />
            ))}
            <div className="tt-add-row">
              <input
                className="tt-add-time"
                placeholder="Time"
                maxLength={12}
                value={ttTimeInput}
                onChange={(e) => setTtTimeInput(e.target.value)}
              />
              <input
                className="tt-add-activity"
                placeholder="Activity..."
                maxLength={140}
                value={ttActivityInput}
                onChange={(e) => setTtActivityInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSlot()}
              />
              <button onClick={addSlot}>Add slot</button>
            </div>
            <span className="tt-reset" onClick={resetDay}>
              Reset {data.activeDay} to default routine
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FocusRow({ item, onToggle, onEdit, onRemove }) {
  const [editing, setEditing] = useState(false)
  return (
    <li>
      <input type="checkbox" checked={item.done} onChange={onToggle} />
      <span
        className={`task-text ${item.done ? 'done' : ''}`}
        contentEditable={editing}
        suppressContentEditableWarning
        onBlur={(e) => {
          setEditing(false)
          onEdit(e.target.textContent)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.target.blur()
          }
        }}
      >
        {item.text}
      </span>
      <button className="edit-btn" title="Edit" onClick={() => setEditing(true)}>
        ✎
      </button>
      <button className="del-btn" title="Remove" onClick={onRemove}>
        ✕
      </button>
    </li>
  )
}

function TaskRow({ task, onToggle, onEdit, onStar, onRemove }) {
  const [editing, setEditing] = useState(false)
  return (
    <li>
      <input type="checkbox" checked={task.done} onChange={onToggle} />
      <span
        className={`task-text ${task.done ? 'done' : ''}`}
        contentEditable={editing}
        suppressContentEditableWarning
        onBlur={(e) => {
          setEditing(false)
          onEdit(e.target.textContent)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.target.blur()
          }
        }}
      >
        {task.text}
      </span>
      <button className="edit-btn" title="Edit" onClick={() => setEditing(true)}>
        ✎
      </button>
      <button className={`star-btn ${task.starred ? 'active' : ''}`} title="Add to Today" onClick={onStar}>
        ★
      </button>
      <button className="del-btn" title="Remove" onClick={onRemove}>
        ✕
      </button>
    </li>
  )
}

function TimetableRow({ slot, index, onEditTime, onEditActivity, onRemove, onReorder }) {
  return (
    <div className="tt-row" {...dragHandlers(index, onReorder)}>
      <span className="drag-handle" title="Drag to reorder">
        ⠿
      </span>
      <span
        className="tt-time"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onEditTime(e.target.textContent)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.target.blur()
          }
        }}
      >
        {slot.time}
      </span>
      <span
        className="tt-activity"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onEditActivity(e.target.textContent)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.target.blur()
          }
        }}
      >
        {slot.activity}
      </span>
      <button className="tt-del" title="Remove this slot" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}
