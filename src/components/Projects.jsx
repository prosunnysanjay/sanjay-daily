import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, escapeHtml, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'
import Modal from './Modal'

const undoStack = makeUndoStack(20)
const BLANK_PROJECT = { name: '', description: '', tools: '', concepts: '', architecture: '' }

export default function Projects({ flashSaved }) {
  const [data, setData] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newProj, setNewProj] = useState({ ...BLANK_PROJECT })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded = { projects: [] }
    try {
      const result = await storageGet(STORAGE_KEYS.projects)
      if (result && result.value) loaded = JSON.parse(result.value)
      else await persist(loaded)
    } catch {
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.projects, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Projects save failed', e)
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
    setNewProj({ ...BLANK_PROJECT })
    setShowAddModal(true)
  }

  function closeAddModal() {
    setShowAddModal(false)
  }

  function saveNewProject() {
    if (!newProj.name.trim()) {
      alert('Give the project a name first.')
      return
    }
    update((d) => {
      d.projects.push({ id: uid('proj'), ...newProj })
    })
    setNewProj({ ...BLANK_PROJECT })
    setShowAddModal(false)
  }

  function deleteProject(id, name) {
    if (!confirm(`Delete "${name || 'this project'}"?`)) return
    update((d) => {
      d.projects = d.projects.filter((p) => p.id !== id)
    })
  }

  function startEdit(id) {
    undoStack.push(data)
    setEditingId(id)
  }

  function cancelEdit() {
    setEditingId(null)
    load() // discard unsaved edits by reloading from storage
  }

  function saveEdit() {
    setEditingId(null)
    persist(data)
  }

  function patchProject(id, patch) {
    setData((prev) => {
      const next = structuredClone(prev)
      const proj = next.projects.find((p) => p.id === id)
      Object.assign(proj, patch)
      return next
    })
  }

  function reorderProjects(fromIdx, toIdx) {
    update((d) => {
      d.projects = reorderArray(d.projects, fromIdx, toIdx)
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
          + Add Project
        </button>
      </div>

      {showAddModal && (
        <Modal title="New Project" onClose={closeAddModal}>
          <div className="project-field">
            <label className="field-label">Project Name</label>
            <input
              type="text"
              className="text-input"
              value={newProj.name}
              onChange={(e) => setNewProj((p) => ({ ...p, name: e.target.value }))}
              placeholder="Project name..."
            />
          </div>
          <div className="project-field">
            <label className="field-label">Description</label>
            <textarea
              className="ginput"
              rows={3}
              value={newProj.description}
              onChange={(e) => setNewProj((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Tools Used</label>
            <textarea
              className="ginput"
              rows={2}
              value={newProj.tools}
              onChange={(e) => setNewProj((p) => ({ ...p, tools: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Concepts Covered</label>
            <textarea
              className="ginput"
              rows={2}
              value={newProj.concepts}
              onChange={(e) => setNewProj((p) => ({ ...p, concepts: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Architecture Detail</label>
            <textarea
              className="ginput"
              rows={3}
              value={newProj.architecture}
              onChange={(e) => setNewProj((p) => ({ ...p, architecture: e.target.value }))}
            />
          </div>
          <div className="add-zone-save-row">
            <button className="btn-outline" onClick={closeAddModal}>
              Cancel
            </button>
            <button className="btn" onClick={saveNewProject}>
              Save Project
            </button>
          </div>
        </Modal>
      )}

      {data.projects.length > 0 && <div className="saved-entries-label">Saved Projects</div>}

      {data.projects.length === 0 && (
        <div className="empty-state-sm">No projects yet — tap "+ Add Project" above.</div>
      )}

      {data.projects.map((proj, idx) =>
        editingId === proj.id ? (
          <ProjectEditCard
            key={proj.id}
            proj={proj}
            onPatch={(patch) => patchProject(proj.id, patch)}
            onCancel={cancelEdit}
            onSave={saveEdit}
          />
        ) : (
          <ProjectViewCard
            key={proj.id}
            proj={proj}
            index={idx}
            onModify={() => startEdit(proj.id)}
            onDelete={() => deleteProject(proj.id, proj.name)}
            onReorder={reorderProjects}
          />
        ),
      )}
    </div>
  )
}

function ProjectViewCard({ proj, index, onModify, onDelete, onReorder }) {
  return (
    <div className="saved-card" {...dragHandlers(index, onReorder)}>
      <div className="saved-card-view">
        <span className="drag-handle">⠿</span>
        <div className="saved-card-body">
          <div className="saved-card-title">{proj.name || '(untitled project)'}</div>
          <div
            className="saved-card-meta"
            dangerouslySetInnerHTML={{
              __html:
                [
                  proj.description
                    ? escapeHtml(proj.description.slice(0, 120)) + (proj.description.length > 120 ? '…' : '')
                    : '',
                  proj.tools ? '<strong>Tools:</strong> ' + escapeHtml(proj.tools.slice(0, 80)) : '',
                  proj.architecture
                    ? '<strong>Architecture:</strong> ' +
                      escapeHtml(proj.architecture.slice(0, 120)) +
                      (proj.architecture.length > 120 ? '…' : '')
                    : '',
                ]
                  .filter(Boolean)
                  .join('<br>') || '<em>No description yet</em>',
            }}
          />
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

function ProjectEditCard({ proj, onPatch, onCancel, onSave }) {
  return (
    <div className="saved-card" style={{ border: '1.5px solid var(--accent)' }}>
      <label className="field-label">Project Name</label>
      <input
        className="text-input"
        style={{ marginBottom: '10px', fontWeight: 700 }}
        value={proj.name || ''}
        onChange={(e) => onPatch({ name: e.target.value })}
      />
      <div className="project-field">
        <label className="field-label">Description</label>
        <textarea className="ginput" rows={3} value={proj.description || ''} onChange={(e) => onPatch({ description: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Tools Used</label>
        <textarea className="ginput" rows={3} value={proj.tools || ''} onChange={(e) => onPatch({ tools: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Concepts Covered</label>
        <textarea className="ginput" rows={3} value={proj.concepts || ''} onChange={(e) => onPatch({ concepts: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Architecture Detail</label>
        <textarea
          className="ginput"
          rows={3}
          value={proj.architecture || ''}
          onChange={(e) => onPatch({ architecture: e.target.value })}
        />
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
