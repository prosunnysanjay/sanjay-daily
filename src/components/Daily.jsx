import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'

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

const undoStack = makeUndoStack(20)

function buildDefaultData() {
  const timetable = {}
  DAYS.forEach((d) => {
    timetable[d] = DEFAULT_TIMETABLE.map((slot) => ({ id: uid('s'), time: slot.time, activity: slot.activity }))
  })
  return {
    focusLabel: 'TODAY',
    timetableLabel: 'Timetable',
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

// Focus items are refs ({sectionId, taskId}) into a section's task list, so a
// "today" item and its section task are the same underlying object — editing
// or checking off one updates the other everywhere it's shown.
function migrateData(loaded) {
  if (!loaded.focusLabel) loaded.focusLabel = 'TODAY'
  if (!loaded.timetableLabel) loaded.timetableLabel = 'Timetable'
  loaded.sections = Array.isArray(loaded.sections) ? loaded.sections : []
  // A past drag-and-drop bug could splice a hole into a tasks array, which
  // serializes as null — strip those out before anything reads task.id/text.
  loaded.sections.forEach((s) => {
    s.tasks = Array.isArray(s.tasks) ? s.tasks.filter((t) => t && typeof t === 'object' && t.id) : []
  })
  const defaultSectionId = loaded.sections[0] && loaded.sections[0].id

  loaded.focus = (Array.isArray(loaded.focus) ? loaded.focus : [])
    .map((f) => {
      if (!f || typeof f !== 'object') return null
      if (f.sectionId && f.taskId) {
        const section = loaded.sections.find((s) => s.id === f.sectionId)
        const task = section && section.tasks.find((t) => t.id === f.taskId)
        return task ? f : null
      }
      // legacy shape: a standalone {id, text, done}, possibly linked via a
      // "star_<taskId>" id convention used by the old one-way star feature.
      let section = null
      let taskId = null
      if (typeof f.id === 'string' && f.id.startsWith('star_')) {
        const candidateId = f.id.slice(5)
        for (const s of loaded.sections) {
          if (s.tasks.some((t) => t.id === candidateId)) {
            section = s
            taskId = candidateId
            break
          }
        }
      }
      if (section) {
        const task = section.tasks.find((t) => t.id === taskId)
        if (task) task.starred = true
      } else {
        // freeform "today" item with no section — file it under the first
        // section so it's always part of one of the segregated lists below.
        section = loaded.sections.find((s) => s.id === defaultSectionId)
        if (!section) return null
        taskId = uid('t')
        section.tasks.push({ id: taskId, text: f.text || '', done: !!f.done, starred: true })
      }
      return { sectionId: section.id, taskId }
    })
    .filter(Boolean)

  loaded.timetable = loaded.timetable && typeof loaded.timetable === 'object' ? loaded.timetable : {}
  DAYS.forEach((d) => {
    if (!Array.isArray(loaded.timetable[d])) {
      loaded.timetable[d] = DEFAULT_TIMETABLE.map((slot) => ({ id: uid('s'), time: slot.time, activity: slot.activity }))
    } else {
      loaded.timetable[d] = loaded.timetable[d].filter((s) => s && typeof s === 'object' && s.id)
    }
  })
  if (!DAYS.includes(loaded.activeDay)) {
    loaded.activeDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  }
}

export default function Daily({ flashSaved }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({})
  const [focusInput, setFocusInput] = useState('')
  const [focusSection, setFocusSection] = useState('')
  const [sectionInputs, setSectionInputs] = useState({})
  const [ttTimeInput, setTtTimeInput] = useState('')
  const [ttActivityInput, setTtActivityInput] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let result
    try {
      result = await storageGet(STORAGE_KEYS.daily)
    } catch {
      // Nothing stored yet (or a transient read error) — seed defaults.
      // Never fall through to this on a parse/migration failure below, since
      // that would mean real saved data exists and must not be overwritten.
      const fresh = buildDefaultData()
      await persist(fresh)
      setData(fresh)
      return
    }
    try {
      const loaded = result && result.value ? JSON.parse(result.value) : buildDefaultData()
      const before = JSON.stringify(loaded)
      migrateData(loaded)
      if (!result || !result.value || JSON.stringify(loaded) !== before) await persist(loaded)
      setData(loaded)
    } catch (e) {
      console.error('Daily: failed to parse/migrate saved data, leaving it untouched in storage', e)
      setLoadError(true)
    }
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.daily, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Daily save failed', e)
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

  function handleUndo() {
    if (!undoStack.canUndo()) {
      alert('Nothing to undo yet.')
      return
    }
    const prev = undoStack.pop()
    setData(prev)
    persist(prev)
  }

  if (loadError) {
    return (
      <div className="empty-state-sm">
        Couldn't load your saved data. Nothing has been changed or overwritten — try reloading the page.
      </div>
    )
  }
  if (!data) return <div className="empty-state-sm">Loading…</div>

  const focusSectionId = focusSection || (data.sections[0] && data.sections[0].id) || ''

  function addFocus() {
    const val = focusInput.trim()
    const sectionId = focusSectionId
    const section = data.sections.find((s) => s.id === sectionId)
    if (!val || !section) return
    update((d) => {
      const sec = d.sections.find((s) => s.id === sectionId)
      const taskId = uid('t')
      sec.tasks.push({ id: taskId, text: val, done: false, starred: true })
      d.focus.push({ sectionId, taskId })
    })
    setFocusInput('')
  }

  function renameFocusLabel(newLabel) {
    update((d) => {
      d.focusLabel = newLabel
    })
  }

  function renameTimetableLabel(newLabel) {
    update((d) => {
      d.timetableLabel = newLabel
    })
  }

  function renameSection(sectionId, newLabel) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      if (section) section.label = newLabel
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
      d.focus = d.focus.filter((f) => !(f.sectionId === sectionId && f.taskId === taskId))
    })
  }

  // Toggling the star pins/unpins a section task into the Today list. Since
  // Today renders the very same task object, edits and done-state stay in sync
  // wherever the task is shown.
  function toggleStar(sectionId, taskId) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      const task = section.tasks.find((t) => t.id === taskId)
      const idx = d.focus.findIndex((f) => f.sectionId === sectionId && f.taskId === taskId)
      if (idx >= 0) {
        d.focus.splice(idx, 1)
        if (task) task.starred = false
      } else {
        d.focus.push({ sectionId, taskId })
        if (task) task.starred = true
      }
    })
  }

  function reorderSectionTasks(sectionId, fromIdx, toIdx) {
    update((d) => {
      const section = d.sections.find((s) => s.id === sectionId)
      section.tasks = reorderArray(section.tasks, fromIdx, toIdx)
    })
  }

  function reorderFocus(fromIdx, toIdx) {
    update((d) => {
      d.focus = reorderArray(d.focus, fromIdx, toIdx)
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
    <div>
      <div className="tab-toolbar">
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
      </div>

      <div className="columns">
        <div>
          <div className="focus-zone">
            <EditableHeading
              as="span"
              className="focus-zone-ribbon"
              text={data.focusLabel}
              onSave={renameFocusLabel}
            />
            <ul className="focus-list">
              {data.focus.length === 0 && (
                <li className="focus-empty">No top priorities set for today. Add one below.</li>
              )}
              {data.focus.map((ref, idx) => {
                const section = data.sections.find((s) => s.id === ref.sectionId)
                const task = section && section.tasks.find((t) => t.id === ref.taskId)
                if (!section || !task) return null
                return (
                  <FocusRow
                    key={task.id}
                    item={task}
                    index={idx}
                    sectionLabel={section.label}
                    onToggle={() => toggleTaskDone(section.id, task.id)}
                    onEdit={(text) => editTaskText(section.id, task.id, text)}
                    onRemove={() => toggleStar(section.id, task.id)}
                    onReorder={reorderFocus}
                  />
                )
              })}
            </ul>
            <div className="add-row">
              <select value={focusSectionId} onChange={(e) => setFocusSection(e.target.value)}>
                {data.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
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
                  <EditableHeading
                    as="h2"
                    text={section.label}
                    onSave={(val) => renameSection(section.id, val)}
                  />
                  <span className="count">{openCount} open</span>
                  <span className="chevron">▾</span>
                </div>
                <div className="section-body">
                  {section.tasks.length === 0 && <div className="empty-section">Nothing here yet.</div>}
                  {section.tasks.length > 0 && (
                    <ul className="task-list">
                      {section.tasks.map((task, idx) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          index={idx}
                          listId={section.id}
                          onToggle={() => toggleTaskDone(section.id, task.id)}
                          onEdit={(text) => editTaskText(section.id, task.id, text)}
                          onStar={() => toggleStar(section.id, task.id)}
                          onRemove={() => removeTask(section.id, task.id)}
                          onReorder={(fromIdx, toIdx) => reorderSectionTasks(section.id, fromIdx, toIdx)}
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
              <EditableHeading as="h2" text={data.timetableLabel} onSave={renameTimetableLabel} />
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
    </div>
  )
}

// Any heading in the Daily tab (the "TODAY" ribbon, section titles, the
// timetable title) can be renamed in place: click in, type, blur or Enter to save.
function EditableHeading({ as: Tag, className, text, onSave }) {
  return (
    <Tag
      className={className}
      contentEditable
      suppressContentEditableWarning
      title="Click to rename"
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const val = e.target.textContent.trim()
        if (val && val !== text) onSave(val)
        else e.target.textContent = text
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.target.blur()
        }
      }}
    >
      {text}
    </Tag>
  )
}

function FocusRow({ item, index, sectionLabel, onToggle, onEdit, onRemove, onReorder }) {
  const [editing, setEditing] = useState(false)
  return (
    <li {...dragHandlers(index, onReorder, 'focus')}>
      <span className="drag-handle" title="Drag to reorder">
        ⠿
      </span>
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
      <span className="focus-section-tag">{sectionLabel}</span>
      <button className="edit-btn" title="Edit" onClick={() => setEditing(true)}>
        ✎
      </button>
      <button className="del-btn" title="Unpin from Today" onClick={onRemove}>
        ✕
      </button>
    </li>
  )
}

function TaskRow({ task, index, listId, onToggle, onEdit, onStar, onRemove, onReorder }) {
  const [editing, setEditing] = useState(false)
  return (
    <li {...dragHandlers(index, onReorder, listId)}>
      <span className="drag-handle" title="Drag to reorder">
        ⠿
      </span>
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
      <button
        className={`star-btn ${task.starred ? 'active' : ''}`}
        title={task.starred ? 'Remove from Today' : 'Add to Today'}
        onClick={onStar}
      >
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
    <div className="tt-row" {...dragHandlers(index, onReorder, 'timetable')}>
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
