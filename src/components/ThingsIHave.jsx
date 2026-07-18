import { useEffect, useRef, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, reorderArray, makeUndoStack } from '../lib/utils'

const undoStack = makeUndoStack(20)

function makeRow(cells) {
  return { id: uid('row'), cells }
}
function tableSection(title, columns, rows) {
  return { id: uid('sec'), title, type: 'table', columns, rows: rows.map(makeRow) }
}
function textSection(title, text) {
  return { id: uid('sec'), title, type: 'text', text }
}

function defaultData() {
  return {
    sections: [
      tableSection('Official Certificates', ['Certificate', 'Status'], [
        ['AZ-900 — Azure Fundamentals', 'Passed'],
        ['AZ-104 — Azure Administrator', 'Passed'],
        ['HashiCorp Terraform Associate', 'Passed'],
      ]),
      tableSection('Non-Official Certificates (TG)', ['Certificate', 'Source'], [
        ['DevOps Certification', 'TG'],
      ]),
      tableSection('Purchased Courses', ['Course', 'Institute / Portal'], [['', '']]),
      tableSection('Certificates — Good to Have', ['Certificate', 'Why'], [
        ['AZ-305 — Azure Solutions Architect Expert', 'Natural next step after AZ-104'],
        ['CKA — Certified Kubernetes Administrator', 'Deepens Kubernetes credibility'],
        ['AWS Solutions Architect Associate', 'Multi-cloud breadth'],
      ]),
      textSection(
        'Career Gap — Explanation',
        'Write a clear, honest explanation of any career gap here — what you did during it, what you learned, and how it makes you stronger now.',
      ),
      tableSection('Completed Projects', ['Project'], [
        ['MindBridge AI Auditor — KPMG Clara Analytics (KCA AITS)'],
        ['Cloud-Native E-Commerce Platform (100+ Microservices)'],
        ['Monolithic Go Web App DevOps Modernisation'],
      ]),
    ],
  }
}

function normalizeSection(s) {
  if (s.type === 'text') {
    return { id: s.id || uid('sec'), title: s.title || '', type: 'text', text: s.text || '' }
  }
  const columns = Array.isArray(s.columns) && s.columns.length ? s.columns : ['Column 1']
  const rows = (Array.isArray(s.rows) ? s.rows : []).map((r) => ({
    id: r.id || uid('row'),
    cells: columns.map((_, i) => (Array.isArray(r.cells) ? r.cells[i] || '' : '')),
  }))
  return { id: s.id || uid('sec'), title: s.title || '', type: 'table', columns, rows }
}

export default function ThingsIHave({ flashSaved }) {
  const [data, setData] = useState(null)
  const beforeEditRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded = defaultData()
    try {
      const result = await storageGet(STORAGE_KEYS.things)
      if (result && result.value) loaded = JSON.parse(result.value)
      else await persist(loaded)
    } catch {
      await persist(loaded)
    }
    loaded.sections = (loaded.sections || []).map(normalizeSection)
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.things, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Things save failed', e)
    }
  }

  // Structural changes (add/delete/reorder): snapshot for undo + persist immediately.
  function update(mutator) {
    setData((prev) => {
      undoStack.push(prev)
      const next = structuredClone(prev)
      mutator(next)
      persist(next)
      return next
    })
  }

  // Inline typing: update local state only; the pre-edit state is captured on
  // focus and committed (undo snapshot + persist) on blur if anything changed.
  function setLocal(mutator) {
    setData((prev) => {
      const next = structuredClone(prev)
      mutator(next)
      return next
    })
  }

  function beginEdit() {
    setData((cur) => {
      if (!beforeEditRef.current) beforeEditRef.current = cur
      return cur
    })
  }

  function commitEdit() {
    setData((cur) => {
      const before = beforeEditRef.current
      beforeEditRef.current = null
      if (before && JSON.stringify(before) !== JSON.stringify(cur)) {
        undoStack.push(before)
        persist(cur)
      }
      return cur
    })
  }

  function handleUndo() {
    if (!undoStack.canUndo()) {
      alert('Nothing to undo yet.')
      return
    }
    const prev = undoStack.pop()
    beforeEditRef.current = null
    setData(prev)
    persist(prev)
  }

  if (!data) return <div className="empty-state-sm">Loading…</div>

  // ----- drag helpers: only the handle is the drag source, so cell inputs stay
  // fully usable and nested draggables (row inside section) never conflict. -----
  function secSource(index) {
    return {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', `sec:${index}`)
      },
    }
  }
  function secTarget(index) {
    return {
      onDragOver: (e) => {
        e.preventDefault()
        e.currentTarget.classList.add('drag-over')
      },
      onDragLeave: (e) => e.currentTarget.classList.remove('drag-over'),
      onDrop: (e) => {
        e.preventDefault()
        e.currentTarget.classList.remove('drag-over')
        const [kind, fi] = e.dataTransfer.getData('text/plain').split(':')
        if (kind !== 'sec') return
        const from = parseInt(fi, 10)
        if (isNaN(from) || from === index) return
        reorderSections(from, index)
      },
    }
  }
  function rowSource(sectionId, index) {
    return {
      draggable: true,
      onDragStart: (e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', `row:${sectionId}:${index}`)
      },
    }
  }
  function rowTarget(sectionId, index) {
    return {
      onDragOver: (e) => {
        e.preventDefault()
        e.currentTarget.classList.add('drag-over')
      },
      onDragLeave: (e) => e.currentTarget.classList.remove('drag-over'),
      onDrop: (e) => {
        e.preventDefault()
        e.currentTarget.classList.remove('drag-over')
        const [kind, sid, fi] = e.dataTransfer.getData('text/plain').split(':')
        if (kind !== 'row' || sid !== sectionId) return
        const from = parseInt(fi, 10)
        if (isNaN(from) || from === index) return
        reorderRows(sectionId, from, index)
      },
    }
  }

  // ----- section ops -----
  function addTableSection() {
    update((d) =>
      d.sections.push({
        id: uid('sec'),
        title: 'New Section',
        type: 'table',
        columns: ['Column 1', 'Column 2'],
        rows: [{ id: uid('row'), cells: ['', ''] }],
      }),
    )
  }
  function addTextSection() {
    update((d) => d.sections.push({ id: uid('sec'), title: 'New Note', type: 'text', text: '' }))
  }
  function deleteSection(id, title) {
    if (!confirm(`Delete "${title || 'this section'}"?`)) return
    update((d) => {
      d.sections = d.sections.filter((s) => s.id !== id)
    })
  }
  function reorderSections(from, to) {
    update((d) => {
      d.sections = reorderArray(d.sections, from, to)
    })
  }

  // ----- row ops -----
  function addRow(sectionId) {
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      s.rows.push({ id: uid('row'), cells: s.columns.map(() => '') })
    })
  }
  function deleteRow(sectionId, rowId) {
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      s.rows = s.rows.filter((r) => r.id !== rowId)
    })
  }
  function reorderRows(sectionId, from, to) {
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      s.rows = reorderArray(s.rows, from, to)
    })
  }

  // ----- column ops -----
  function addColumn(sectionId) {
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      s.columns.push('New Column')
      s.rows.forEach((r) => r.cells.push(''))
    })
  }
  function deleteColumn(sectionId, colIdx) {
    update((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      if (s.columns.length <= 1) return
      s.columns.splice(colIdx, 1)
      s.rows.forEach((r) => r.cells.splice(colIdx, 1))
    })
  }

  // ----- inline edits -----
  function editSectionTitle(sectionId, value) {
    setLocal((d) => {
      d.sections.find((x) => x.id === sectionId).title = value
    })
  }
  function editColumn(sectionId, colIdx, value) {
    setLocal((d) => {
      d.sections.find((x) => x.id === sectionId).columns[colIdx] = value
    })
  }
  function editCell(sectionId, rowId, colIdx, value) {
    setLocal((d) => {
      const s = d.sections.find((x) => x.id === sectionId)
      s.rows.find((r) => r.id === rowId).cells[colIdx] = value
    })
  }
  function editText(sectionId, value) {
    setLocal((d) => {
      d.sections.find((x) => x.id === sectionId).text = value
    })
  }

  return (
    <div>
      <div className="things-intro">
        Your notebook — certificates, courses, projects, and notes. Everything is editable; add rows or sections, drag the ⠿ handle to reorder.
      </div>

      <div className="tab-toolbar">
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
        <button className="btn-outline" onClick={addTextSection}>
          + Note
        </button>
        <button className="add-trigger-btn" onClick={addTableSection}>
          + Table
        </button>
      </div>

      {data.sections.length === 0 && (
        <div className="empty-state-sm">No sections yet — add a Table or Note above.</div>
      )}

      {data.sections.map((s, idx) => (
        <div key={s.id} className="things-section">
          <div className="things-section-head" {...secTarget(idx)}>
            <span className="drag-handle" {...secSource(idx)}>
              ⠿
            </span>
            <input
              className="things-section-title"
              value={s.title}
              placeholder="Section title"
              onChange={(e) => editSectionTitle(s.id, e.target.value)}
              onFocus={beginEdit}
              onBlur={commitEdit}
            />
            <div className="things-section-actions">
              {s.type === 'table' && (
                <button className="things-col-add" title="Add column" onClick={() => addColumn(s.id)}>
                  + col
                </button>
              )}
              <button className="danger" title="Delete section" onClick={() => deleteSection(s.id, s.title)}>
                ✕
              </button>
            </div>
          </div>

          {s.type === 'text' ? (
            <div className="things-section-body">
              <textarea
                className="ginput things-text"
                rows={4}
                value={s.text}
                placeholder="Write here..."
                onChange={(e) => editText(s.id, e.target.value)}
                onFocus={beginEdit}
                onBlur={commitEdit}
              />
            </div>
          ) : (
            <div className="things-section-body">
              <div className="things-table-wrap">
                <table className="things-table">
                  <thead>
                    <tr>
                      <th className="things-th-spacer"></th>
                      {s.columns.map((col, ci) => (
                        <th key={ci}>
                          <div className="things-th-cell">
                            <input
                              className="things-col-input"
                              value={col}
                              placeholder={`Column ${ci + 1}`}
                              onChange={(e) => editColumn(s.id, ci, e.target.value)}
                              onFocus={beginEdit}
                              onBlur={commitEdit}
                            />
                            {s.columns.length > 1 && (
                              <button className="things-col-del" title="Delete column" onClick={() => deleteColumn(s.id, ci)}>
                                ✕
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="things-th-spacer"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.length === 0 && (
                      <tr>
                        <td className="things-empty" colSpan={s.columns.length + 2}>
                          No rows yet — tap "+ Add row".
                        </td>
                      </tr>
                    )}
                    {s.rows.map((row, ri) => (
                      <tr key={row.id} className="things-row" {...rowTarget(s.id, ri)}>
                        <td className="things-td-handle">
                          <span className="drag-handle" {...rowSource(s.id, ri)}>
                            ⠿
                          </span>
                        </td>
                        {row.cells.map((cell, ci) => (
                          <td key={ci}>
                            <input
                              className="things-cell-input"
                              value={cell}
                              onChange={(e) => editCell(s.id, row.id, ci, e.target.value)}
                              onFocus={beginEdit}
                              onBlur={commitEdit}
                            />
                          </td>
                        ))}
                        <td className="things-td-del">
                          <button className="danger" title="Delete row" onClick={() => deleteRow(s.id, row.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="things-add-row" onClick={() => addRow(s.id)}>
                + Add row
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
