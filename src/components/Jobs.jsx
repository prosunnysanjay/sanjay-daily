import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, escapeHtml, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'
import Modal from './Modal'

const undoStack = makeUndoStack(20)
const BLANK_CO = { company: '', role: '', link: '', notes: '', jd: '', steps: '' }

export default function Jobs({ flashSaved }) {
  const [data, setData] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCo, setNewCo] = useState({ ...BLANK_CO })
  const [flName, setFlName] = useState('')
  const [flLink, setFlLink] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded = { companies: [], freelance: [] }
    try {
      const result = await storageGet(STORAGE_KEYS.jobs)
      if (result && result.value) loaded = JSON.parse(result.value)
      else await persist(loaded)
    } catch {
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.jobs, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Jobs save failed', e)
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

  function openAddModal() {
    setNewCo({ ...BLANK_CO })
    setShowAddModal(true)
  }

  function closeAddModal() {
    setShowAddModal(false)
  }

  function saveNewCompany() {
    if (!newCo.company.trim()) {
      alert('Give the company a name first.')
      return
    }
    update((d) => d.companies.push({ id: uid('co'), ...newCo }))
    setNewCo({ ...BLANK_CO })
    setShowAddModal(false)
  }

  function deleteCompany(id, name) {
    if (!confirm(`Delete "${name || 'this company'}"?`)) return
    update((d) => {
      d.companies = d.companies.filter((c) => c.id !== id)
    })
  }

  function startEdit(id) {
    undoStack.push(data)
    setEditingId(id)
  }
  function cancelEdit() {
    setEditingId(null)
    load()
  }
  function saveEdit() {
    setEditingId(null)
    persist(data)
  }
  function patchCompany(id, patch) {
    setData((prev) => {
      const next = structuredClone(prev)
      const co = next.companies.find((c) => c.id === id)
      Object.assign(co, patch)
      return next
    })
  }
  function reorderCompanies(fromIdx, toIdx) {
    update((d) => {
      d.companies = reorderArray(d.companies, fromIdx, toIdx)
    })
  }

  function addFreelance() {
    if (!flName.trim()) return
    update((d) => d.freelance.push({ id: uid('fl'), name: flName.trim(), link: flLink.trim() }))
    setFlName('')
    setFlLink('')
  }
  function removeFreelance(id) {
    update((d) => {
      d.freelance = d.freelance.filter((f) => f.id !== id)
    })
  }
  function patchFreelance(id, patch) {
    update(
      (d) => {
        const f = d.freelance.find((x) => x.id === id)
        Object.assign(f, patch)
      },
      { snapshot: false },
    )
  }
  function reorderFreelance(fromIdx, toIdx) {
    update((d) => {
      d.freelance = reorderArray(d.freelance, fromIdx, toIdx)
    })
  }

  function handleUndo() {
    if (!undoStack.canUndo()) {
      alert('Nothing to undo yet.')
      return
    }
    const prev = undoStack.pop()
    setEditingId(null)
    setData(prev)
    persist(prev)
  }

  return (
    <div>
      <div className="tab-toolbar">
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
        <button className="add-trigger-btn" onClick={openAddModal}>
          + Add Company
        </button>
      </div>

      {showAddModal && (
        <Modal title="New Dream Company" onClose={closeAddModal}>
          <div className="company-grid">
            <div className="project-field">
              <label className="field-label">Company</label>
              <input className="text-input" value={newCo.company} onChange={(e) => setNewCo((c) => ({ ...c, company: e.target.value }))} />
            </div>
            <div className="project-field">
              <label className="field-label">Target Role</label>
              <input className="text-input" value={newCo.role} onChange={(e) => setNewCo((c) => ({ ...c, role: e.target.value }))} />
            </div>
            <div className="project-field">
              <label className="field-label">Link</label>
              <input className="text-input" value={newCo.link} onChange={(e) => setNewCo((c) => ({ ...c, link: e.target.value }))} />
            </div>
            <div className="project-field">
              <label className="field-label">Notes</label>
              <input className="text-input" value={newCo.notes} onChange={(e) => setNewCo((c) => ({ ...c, notes: e.target.value }))} />
            </div>
          </div>
          <div className="project-field">
            <label className="field-label">Job Description (notes)</label>
            <textarea className="ginput" rows={3} value={newCo.jd} onChange={(e) => setNewCo((c) => ({ ...c, jd: e.target.value }))} />
          </div>
          <div className="project-field">
            <label className="field-label">Steps to Reach There</label>
            <textarea className="ginput" rows={3} value={newCo.steps} onChange={(e) => setNewCo((c) => ({ ...c, steps: e.target.value }))} />
          </div>
          <div className="add-zone-save-row">
            <button className="btn-outline" onClick={closeAddModal}>
              Cancel
            </button>
            <button className="btn" onClick={saveNewCompany}>
              Save Company
            </button>
          </div>
        </Modal>
      )}

      {data.companies.length > 0 && <div className="saved-entries-label">Saved Companies</div>}

      {data.companies.length === 0 && (
        <div className="empty-state-sm">No dream companies yet — tap "+ Add Company" above.</div>
      )}

      {data.companies.map((co, idx) =>
        editingId === co.id ? (
          <CompanyEditCard key={co.id} co={co} onPatch={(patch) => patchCompany(co.id, patch)} onCancel={cancelEdit} onSave={saveEdit} />
        ) : (
          <CompanyViewCard
            key={co.id}
            co={co}
            index={idx}
            onModify={() => startEdit(co.id)}
            onDelete={() => deleteCompany(co.id, co.company)}
            onReorder={reorderCompanies}
          />
        ),
      )}

      <div className="gcard" style={{ marginTop: '18px' }}>
        <h2>Freelancing</h2>
        <div className="gsub">Platforms and leads worth checking.</div>
        {data.freelance.length === 0 && <div className="empty-state-sm">No freelancing leads yet.</div>}
        {data.freelance.map((f, idx) => (
          <div className="freelance-row" key={f.id} {...dragHandlers(idx, reorderFreelance)}>
            <span className="drag-handle">⠿</span>
            <input
              className="fl-name"
              value={f.name}
              onChange={(e) => patchFreelance(f.id, { name: e.target.value })}
            />
            <input
              className="fl-link"
              placeholder="Link"
              value={f.link}
              onChange={(e) => patchFreelance(f.id, { link: e.target.value })}
            />
            <button className="del-x" onClick={() => removeFreelance(f.id)}>
              ✕
            </button>
          </div>
        ))}
        <div className="add-row" style={{ marginTop: '10px' }}>
          <input
            type="text"
            placeholder="Platform / lead name..."
            value={flName}
            onChange={(e) => setFlName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Link (optional)"
            style={{ flex: 1.2 }}
            value={flLink}
            onChange={(e) => setFlLink(e.target.value)}
          />
          <button className="btn" onClick={addFreelance}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function CompanyViewCard({ co, index, onModify, onDelete, onReorder }) {
  const bits = []
  if (co.role) bits.push('<strong>Role:</strong> ' + escapeHtml(co.role))
  if (co.link) bits.push('<strong>Link:</strong> ' + escapeHtml(co.link))
  if (co.steps) bits.push('<strong>Steps:</strong> ' + escapeHtml(co.steps.slice(0, 100)) + (co.steps.length > 100 ? '…' : ''))

  return (
    <div className="saved-card" {...dragHandlers(index, onReorder)}>
      <div className="saved-card-view">
        <span className="drag-handle">⠿</span>
        <div className="saved-card-body">
          <div className="saved-card-title">{co.company || '(unnamed company)'}</div>
          <div className="saved-card-meta" dangerouslySetInnerHTML={{ __html: bits.join('<br>') || '<em>No details yet</em>' }} />
        </div>
        <div className="saved-card-actions">
          <button onClick={onModify}>✎ Modify</button>
          <button className="danger" onClick={onDelete}>
            ✕ Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function CompanyEditCard({ co, onPatch, onCancel, onSave }) {
  return (
    <div className="saved-card" style={{ border: '1.5px solid var(--accent)' }}>
      <div className="company-grid">
        <div className="project-field">
          <label className="field-label">Company</label>
          <input className="text-input" value={co.company || ''} onChange={(e) => onPatch({ company: e.target.value })} />
        </div>
        <div className="project-field">
          <label className="field-label">Target Role</label>
          <input className="text-input" value={co.role || ''} onChange={(e) => onPatch({ role: e.target.value })} />
        </div>
        <div className="project-field">
          <label className="field-label">Link</label>
          <input className="text-input" value={co.link || ''} onChange={(e) => onPatch({ link: e.target.value })} />
        </div>
        <div className="project-field">
          <label className="field-label">Notes</label>
          <input className="text-input" value={co.notes || ''} onChange={(e) => onPatch({ notes: e.target.value })} />
        </div>
      </div>
      <div className="project-field">
        <label className="field-label">Job Description (notes)</label>
        <textarea className="ginput" rows={3} value={co.jd || ''} onChange={(e) => onPatch({ jd: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Steps to Reach There</label>
        <textarea className="ginput" rows={3} value={co.steps || ''} onChange={(e) => onPatch({ steps: e.target.value })} />
      </div>
      <div className="add-zone-save-row">
        <button className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" onClick={onSave}>
          Save Changes
        </button>
      </div>
    </div>
  )
}
