import { useEffect, useRef, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'

const undoStack = makeUndoStack(20)

function makeRow(cells) {
  return { id: uid('row'), cells }
}
function makeTable(title, columns, rows) {
  return { id: uid('tbl'), title, columns, rows: rows.map(makeRow) }
}
function makeCategory(icon, name, tables) {
  return { id: uid('cat'), icon, name, tables }
}

function defaultData() {
  return {
    categories: [
      makeCategory('📍', 'Notes — Subject & Location', [
        makeTable('Notes Location', ['Subject', 'Where it lives'], [['', '']]),
      ]),
      makeCategory('💰', 'Money Management', [
        makeTable('Balance Tracking', ['Account', 'Balance', 'As of'], [['', '', '']]),
        makeTable(
          'Insurance & Recharge Tracking',
          ['Item', 'Provider', 'Amount', 'Due / Renewal Date'],
          [['', '', '', '']],
        ),
        makeTable('Investment', ['Investment', 'Type', 'Amount', 'Notes'], [['', '', '', '']]),
        makeTable('Growing', ['Goal', 'Current', 'Target', 'Notes'], [['', '', '', '']]),
        makeTable('Liabilities', ['Liability', 'Amount Owed', 'Due Date', 'Notes'], [['', '', '', '']]),
        makeTable('Assets', ['Asset', 'Estimated Value', 'Notes'], [['', '', '']]),
      ]),
      makeCategory('🗄️', 'Important Documents Backup', [
        makeTable('Documents Backup', ['Document', 'Backup Location'], [['', '']]),
      ]),
    ],
  }
}

function normalizeTable(t) {
  const columns = Array.isArray(t.columns) && t.columns.length ? t.columns : ['Column 1']
  const rows = (Array.isArray(t.rows) ? t.rows : []).map((r) => ({
    id: r.id || uid('row'),
    cells: columns.map((_, i) => (Array.isArray(r.cells) ? r.cells[i] || '' : '')),
  }))
  return { id: t.id || uid('tbl'), title: t.title || '', columns, rows }
}
function normalizeCategory(c) {
  return {
    id: c.id || uid('cat'),
    icon: c.icon || '📁',
    name: c.name || '',
    tables: (Array.isArray(c.tables) ? c.tables : []).map(normalizeTable),
  }
}

export default function Tracking({ flashSaved }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const beforeEditRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  // Open the first category by default once data is available and nothing is selected.
  useEffect(() => {
    if (data && !selectedId && data.categories.length) {
      setSelectedId(data.categories[0].id)
    }
  }, [data, selectedId])

  async function load() {
    let result
    try {
      result = await storageGet(STORAGE_KEYS.tracking)
    } catch (e) {
      if (e.message !== 'not found') {
        console.error('Tracking: could not reach storage, leaving any saved data untouched', e)
        setLoadError(true)
        return
      }
      result = null
    }
    try {
      const loaded = result && result.value ? JSON.parse(result.value) : defaultData()
      loaded.categories = (Array.isArray(loaded.categories) ? loaded.categories : []).map(normalizeCategory)
      if (!result || !result.value) await persist(loaded)
      setData(loaded)
    } catch (e) {
      console.error('Tracking: saved data exists but failed to parse, leaving it untouched', e)
      setLoadError(true)
    }
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.tracking, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Tracking save failed', e)
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

  if (loadError) {
    return (
      <div className="empty-state-sm">
        Couldn't load your saved data. Nothing has been changed or overwritten — try reloading the page.
      </div>
    )
  }
  if (!data) return <div className="empty-state-sm">Loading…</div>

  const selectedCategory = data.categories.find((c) => c.id === selectedId) || null

  // ----- category ops -----
  function addCategory() {
    const cat = makeCategory('📁', 'New Category', [makeTable('New Table', ['Column 1', 'Column 2'], [['', '']])])
    update((d) => d.categories.push(cat))
    setSelectedId(cat.id)
  }
  function deleteCategory(id, name) {
    if (!confirm(`Delete "${name || 'this category'}" and everything in it?`)) return
    update((d) => {
      d.categories = d.categories.filter((c) => c.id !== id)
    })
    if (selectedId === id) setSelectedId(null)
  }
  function reorderCategories(from, to) {
    update((d) => {
      d.categories = reorderArray(d.categories, from, to)
    })
  }
  function editCategoryName(id, value) {
    setLocal((d) => {
      d.categories.find((c) => c.id === id).name = value
    })
  }

  // ----- table ops (only one category's tables are ever on screen, so a plain
  // index-based reorder is safe — no cross-list scoping needed) -----
  function addTable(categoryId) {
    update((d) => {
      const c = d.categories.find((x) => x.id === categoryId)
      c.tables.push(makeTable('New Table', ['Column 1', 'Column 2'], [['', '']]))
    })
  }
  function deleteTable(categoryId, tableId, title) {
    if (!confirm(`Delete "${title || 'this table'}"?`)) return
    update((d) => {
      const c = d.categories.find((x) => x.id === categoryId)
      c.tables = c.tables.filter((t) => t.id !== tableId)
    })
  }
  function reorderTables(categoryId, from, to) {
    update((d) => {
      const c = d.categories.find((x) => x.id === categoryId)
      c.tables = reorderArray(c.tables, from, to)
    })
  }
  function editTableTitle(tableId, value) {
    setLocal((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) t.title = value
      }
    })
  }

  // ----- row ops: multiple tables' rows can be visible at once (e.g. Money
  // Management), so drops are scoped to the table they started in. -----
  function rowSource(tableId, index) {
    return {
      draggable: true,
      onDragStart: (e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', `row:${tableId}:${index}`)
      },
    }
  }
  function rowTarget(tableId, index) {
    return {
      onDragOver: (e) => {
        e.preventDefault()
        e.currentTarget.classList.add('drag-over')
      },
      onDragLeave: (e) => e.currentTarget.classList.remove('drag-over'),
      onDrop: (e) => {
        e.preventDefault()
        e.currentTarget.classList.remove('drag-over')
        const [kind, tid, fi] = e.dataTransfer.getData('text/plain').split(':')
        if (kind !== 'row' || tid !== tableId) return
        const from = parseInt(fi, 10)
        if (isNaN(from) || from === index) return
        reorderRows(tableId, from, index)
      },
    }
  }
  function addRow(tableId) {
    update((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) t.rows.push({ id: uid('row'), cells: t.columns.map(() => '') })
      }
    })
  }
  function deleteRow(tableId, rowId) {
    update((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) t.rows = t.rows.filter((r) => r.id !== rowId)
      }
    })
  }
  function reorderRows(tableId, from, to) {
    update((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) t.rows = reorderArray(t.rows, from, to)
      }
    })
  }

  // ----- column ops -----
  function addColumn(tableId) {
    update((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) {
          t.columns.push('New Column')
          t.rows.forEach((r) => r.cells.push(''))
        }
      }
    })
  }
  function deleteColumn(tableId, colIdx) {
    update((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t && t.columns.length > 1) {
          t.columns.splice(colIdx, 1)
          t.rows.forEach((r) => r.cells.splice(colIdx, 1))
        }
      }
    })
  }

  // ----- inline edits -----
  function editColumn(tableId, colIdx, value) {
    setLocal((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) t.columns[colIdx] = value
      }
    })
  }
  function editCell(tableId, rowId, colIdx, value) {
    setLocal((d) => {
      for (const c of d.categories) {
        const t = c.tables.find((x) => x.id === tableId)
        if (t) t.rows.find((r) => r.id === rowId).cells[colIdx] = value
      }
    })
  }

  return (
    <div className="projects-layout">
      <aside className="projects-sidebar">
        <div className="projects-sidebar-toolbar">
          <button className="btn-outline" onClick={handleUndo}>
            ↺ Undo
          </button>
          <button className="add-trigger-btn" onClick={addCategory}>
            + Category
          </button>
        </div>

        {data.categories.length === 0 && <div className="empty-state-sm">No categories yet.</div>}

        <div className="projects-nav">
          {data.categories.map((c, idx) => (
            <div
              key={c.id}
              className={`projects-nav-item ${c.id === selectedId ? 'active' : ''}`}
              {...dragHandlers(idx, reorderCategories, 'tracking-categories')}
              onClick={() => setSelectedId(c.id)}
            >
              <span className="drag-handle" onClick={(e) => e.stopPropagation()}>
                ⠿
              </span>
              <span className="projects-nav-name">
                {c.icon} {c.name || '(untitled category)'}
              </span>
              <button
                className="things-col-del"
                title="Delete category"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteCategory(c.id, c.name)
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="projects-main">
        {!selectedCategory && <div className="empty-state-sm">Pick a category on the left.</div>}

        {selectedCategory && (
          <div>
            <div className="tracking-detail-head">
              <div className="tracking-detail-icon">{selectedCategory.icon}</div>
              <div className="tracking-detail-titlewrap">
                <input
                  className="tracking-detail-title"
                  value={selectedCategory.name}
                  placeholder="Category name"
                  onChange={(e) => editCategoryName(selectedCategory.id, e.target.value)}
                  onFocus={beginEdit}
                  onBlur={commitEdit}
                />
                <div className="tracking-detail-sub">
                  {selectedCategory.tables.length} table{selectedCategory.tables.length === 1 ? '' : 's'}
                </div>
              </div>
              <button className="add-trigger-btn" onClick={() => addTable(selectedCategory.id)}>
                + Table
              </button>
            </div>

            {selectedCategory.tables.length === 0 && (
              <div className="empty-state-sm">No tables yet — add one above.</div>
            )}

            {selectedCategory.tables.map((t, tIdx) => (
              <div key={t.id} className="things-section">
                <div
                  className="things-section-head"
                  {...dragHandlers(tIdx, (from, to) => reorderTables(selectedCategory.id, from, to), selectedCategory.id)}
                >
                  <span className="drag-handle">⠿</span>
                  <input
                    className="things-section-title"
                    value={t.title}
                    placeholder="Table title"
                    onChange={(e) => editTableTitle(t.id, e.target.value)}
                    onFocus={beginEdit}
                    onBlur={commitEdit}
                  />
                  <div className="things-section-actions">
                    <button className="things-col-add" title="Add column" onClick={() => addColumn(t.id)}>
                      + col
                    </button>
                    <button
                      className="danger"
                      title="Delete table"
                      onClick={() => deleteTable(selectedCategory.id, t.id, t.title)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="things-section-body">
                  <div className="things-table-wrap">
                    <table className="things-table">
                      <thead>
                        <tr>
                          <th className="things-th-spacer"></th>
                          {t.columns.map((col, ci) => (
                            <th key={ci}>
                              <div className="things-th-cell">
                                <input
                                  className="things-col-input"
                                  value={col}
                                  placeholder={`Column ${ci + 1}`}
                                  onChange={(e) => editColumn(t.id, ci, e.target.value)}
                                  onFocus={beginEdit}
                                  onBlur={commitEdit}
                                />
                                {t.columns.length > 1 && (
                                  <button
                                    className="things-col-del"
                                    title="Delete column"
                                    onClick={() => deleteColumn(t.id, ci)}
                                  >
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
                        {t.rows.length === 0 && (
                          <tr>
                            <td className="things-empty" colSpan={t.columns.length + 2}>
                              No rows yet — tap "+ Add row".
                            </td>
                          </tr>
                        )}
                        {t.rows.map((row, ri) => (
                          <tr key={row.id} className="things-row" {...rowTarget(t.id, ri)}>
                            <td className="things-td-handle">
                              <span className="drag-handle" {...rowSource(t.id, ri)}>
                                ⠿
                              </span>
                            </td>
                            {row.cells.map((cell, ci) => (
                              <td key={ci}>
                                <input
                                  className="things-cell-input"
                                  value={cell}
                                  onChange={(e) => editCell(t.id, row.id, ci, e.target.value)}
                                  onFocus={beginEdit}
                                  onBlur={commitEdit}
                                />
                              </td>
                            ))}
                            <td className="things-td-del">
                              <button className="danger" title="Delete row" onClick={() => deleteRow(t.id, row.id)}>
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="things-add-row" onClick={() => addRow(t.id)}>
                    + Add row
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
