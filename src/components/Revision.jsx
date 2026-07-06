import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'
import Modal from './Modal'

const undoStack = makeUndoStack(20)
const BLANK_SUBJECT = { name: '', icon: '🗂️' }
const BLANK_MODULE = { title: '', notes: '', usefulness: '', interviewTips: '' }

function mod(title) {
  return { id: uid('mod'), title, notes: '', usefulness: '', interviewTips: '' }
}

function subject(icon, name, moduleTitles) {
  return { id: uid('subj'), icon, name, modules: moduleTitles.map(mod) }
}

function defaultData() {
  return {
    subjects: [
      subject('🐧', 'Linux', [
        'Overview',
        'Boot process',
        'Filesystem & permissions',
        'Process management',
        'Networking (ip, netstat, ss)',
        'Systemd & services',
        'Package management',
        'Shell scripting basics',
        'Performance troubleshooting (top, iostat, vmstat)',
        'Logs (journalctl, /var/log)',
        'SSH & security hardening',
      ]),
      subject('🐳', 'Docker', [
        'Overview',
        'Images & layers',
        'Multistage builds',
        'Volumes',
        'Networking',
        'Docker Compose',
        'Registries',
        'Resource limits & security',
      ]),
      subject('☸️', 'Kubernetes', [
        'Overview',
        'Pods',
        'Deployments',
        'StatefulSets',
        'DaemonSets',
        'Services',
        'Ingress',
        'ConfigMaps & Secrets',
        'RBAC',
        'NetworkPolicies',
        'HPA/VPA',
        'CRDs & Operators',
        'Scheduling & affinity',
        'Troubleshooting',
      ]),
      subject('⎈', 'Helm', [
        'Overview',
        'Charts',
        'Values',
        'Templates',
        'Hooks',
        'Repositories',
        'Alternatives (Kustomize, Helmfile)',
      ]),
      subject('🌍', 'Terraform & Terragrunt', [
        'Overview',
        'State management',
        'Modules',
        'Providers',
        'Workspaces',
        'DRY patterns (Terragrunt)',
        'Import & drift detection',
      ]),
      subject('🕸️', 'Service Mesh', ['Overview', 'Sidecars', 'Traffic management', 'mTLS', 'Observability integration']),
      subject('📊', 'Observability', [
        'Overview',
        'Metrics (Prometheus)',
        'Logs (ELK/EFK)',
        'Traces',
        'Alerting',
        'SLOs & dashboards (Grafana)',
      ]),
      subject('☁️', 'Azure', ['Overview', 'Compute', 'Networking', 'Identity (Entra ID)', 'Storage', 'Governance (CAF/ALZ)']),
      subject('🛡️', 'Azure Security', [
        'Overview',
        'Defender for Cloud',
        'Sentinel',
        'Key Vault',
        'Policy',
        'RBAC',
        'Conditional Access',
      ]),
      subject('🔁', 'CI/CD & SCM', ['Overview', 'Git', 'GitHub Actions', 'Jenkins', 'Azure DevOps', 'ArgoCD/GitOps']),
      subject('🤖', 'AI DevOps Tools', ['Overview', 'Coding assistants', 'AI infra/ops tools', 'Vector DBs']),
      subject('🔐', 'DevSecOps', [
        'Overview',
        'OWASP Top 10',
        'SAST (SonarQube, Semgrep)',
        'SCA (Snyk, Dependabot)',
        'DAST (OWASP ZAP)',
        'Container scanning (Trivy)',
        'IaC scanning (Checkov, tfsec)',
        'K8s security (Kube-bench, Falco)',
      ]),
      subject('📜', 'Scripting', ['Overview', 'Bash', 'Python', 'PowerShell']),
      subject('🏗️', 'System Design', ['Overview', 'Scalability', 'Load balancing', 'Caching', 'CAP theorem', 'Database sharding']),
      subject('🏛️', 'Azure Solutions Architect', [
        'Overview',
        'Well-architected framework',
        'Landing zones',
        'DR/HA design',
      ]),
      subject('🛠️', 'Platform Engineering', ['Overview', 'Internal developer platforms', 'Golden paths', 'Backstage']),
      subject('🚨', 'SRE', ['Overview', 'SLI/SLO/SLA', 'Error budgets', 'Incident management', 'Chaos engineering']),
    ],
  }
}

export function countModules(subjects) {
  return (subjects || []).reduce((sum, s) => sum + (s.modules ? s.modules.length : 0), 0)
}

export default function Revision({ flashSaved }) {
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useState('')
  const [editingModuleId, setEditingModuleId] = useState(null)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [editingSubjectId, setEditingSubjectId] = useState(null)
  const [subjectForm, setSubjectForm] = useState({ ...BLANK_SUBJECT })
  const [showAddModuleModal, setShowAddModuleModal] = useState(false)
  const [moduleForm, setModuleForm] = useState({ ...BLANK_MODULE })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded = defaultData()
    try {
      const result = await storageGet(STORAGE_KEYS.revision)
      if (result && result.value) loaded = JSON.parse(result.value)
      else await persist(loaded)
    } catch {
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.revision, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Revision save failed', e)
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
    setEditingModuleId(null)
    setData(prev)
    persist(prev)
  }

  if (!data) return <div className="empty-state-sm">Loading…</div>

  const selectedSubject = data.subjects.find((s) => s.id === selectedId) || null

  function openAddSubjectModal() {
    setEditingSubjectId(null)
    setSubjectForm({ ...BLANK_SUBJECT })
    setShowSubjectModal(true)
  }

  function openEditSubjectModal(s) {
    setEditingSubjectId(s.id)
    setSubjectForm({ name: s.name, icon: s.icon })
    setShowSubjectModal(true)
  }

  function closeSubjectModal() {
    setShowSubjectModal(false)
  }

  function saveSubjectForm() {
    if (!subjectForm.name.trim()) {
      alert('Give the subject a name first.')
      return
    }
    if (editingSubjectId) {
      update((d) => {
        const s = d.subjects.find((x) => x.id === editingSubjectId)
        Object.assign(s, subjectForm)
      })
    } else {
      update((d) => {
        d.subjects.push({ id: uid('subj'), ...subjectForm, modules: [] })
      })
    }
    setShowSubjectModal(false)
  }

  function deleteSubject(id, name) {
    if (!confirm(`Delete "${name || 'this subject'}" and all its modules?`)) return
    update((d) => {
      d.subjects = d.subjects.filter((s) => s.id !== id)
    })
    if (selectedId === id) setSelectedId(null)
  }

  function reorderSubjects(fromIdx, toIdx) {
    update((d) => {
      d.subjects = reorderArray(d.subjects, fromIdx, toIdx)
    })
  }

  function openSubject(id) {
    setSelectedId(id)
    setSearch('')
    setExpanded({})
  }

  function openAddModuleModal() {
    setModuleForm({ ...BLANK_MODULE })
    setShowAddModuleModal(true)
  }

  function closeAddModuleModal() {
    setShowAddModuleModal(false)
  }

  function saveNewModule() {
    if (!moduleForm.title.trim()) {
      alert('Give the module a title first.')
      return
    }
    update((d) => {
      const s = d.subjects.find((x) => x.id === selectedId)
      s.modules.push({ id: uid('mod'), ...moduleForm })
    })
    setShowAddModuleModal(false)
  }

  function startEditModule(id) {
    undoStack.push(data)
    setEditingModuleId(id)
    setExpanded((e) => ({ ...e, [id]: true }))
  }

  function cancelEditModule() {
    setEditingModuleId(null)
    load() // discard unsaved edits by reloading from storage
  }

  function saveEditModule() {
    setEditingModuleId(null)
    persist(data)
  }

  function patchModule(moduleId, patch) {
    setData((prev) => {
      const next = structuredClone(prev)
      const s = next.subjects.find((x) => x.id === selectedId)
      const m = s.modules.find((x) => x.id === moduleId)
      Object.assign(m, patch)
      return next
    })
  }

  function deleteModule(id, title) {
    if (!confirm(`Delete "${title || 'this module'}"?`)) return
    update((d) => {
      const s = d.subjects.find((x) => x.id === selectedId)
      s.modules = s.modules.filter((m) => m.id !== id)
    })
  }

  function reorderModules(fromIdx, toIdx) {
    update((d) => {
      const s = d.subjects.find((x) => x.id === selectedId)
      s.modules = reorderArray(s.modules, fromIdx, toIdx)
    })
  }

  function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }))
  }

  if (!selectedSubject) {
    return (
      <div>
        <div className="tab-toolbar">
          <button className="btn-outline" onClick={handleUndo}>
            ↺ Undo
          </button>
          <button className="add-trigger-btn" onClick={openAddSubjectModal}>
            + Add Subject
          </button>
        </div>

        {showSubjectModal && (
          <Modal title={editingSubjectId ? 'Rename Subject' : 'New Subject'} onClose={closeSubjectModal}>
            <div className="project-field">
              <label className="field-label">Icon (emoji)</label>
              <input
                type="text"
                className="text-input"
                style={{ maxWidth: 80 }}
                value={subjectForm.icon}
                onChange={(e) => setSubjectForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </div>
            <div className="project-field">
              <label className="field-label">Subject Name</label>
              <input
                type="text"
                className="text-input"
                value={subjectForm.name}
                onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ansible"
              />
            </div>
            <div className="add-zone-save-row">
              <button className="btn-outline" onClick={closeSubjectModal}>
                Cancel
              </button>
              <button className="btn" onClick={saveSubjectForm}>
                Save
              </button>
            </div>
          </Modal>
        )}

        {data.subjects.length === 0 && (
          <div className="empty-state-sm">No subjects yet — tap "+ Add Subject" above.</div>
        )}

        <div className="revision-subject-grid">
          {data.subjects.map((s, idx) => (
            <div key={s.id} className="revision-subject-card" {...dragHandlers(idx, reorderSubjects)} onClick={() => openSubject(s.id)}>
              <div className="revision-subject-card-top">
                <span className="drag-handle">⠿</span>
                <div className="revision-subject-actions">
                  <button
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      openEditSubjectModal(s)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="danger"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSubject(s.id, s.name)
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="revision-subject-icon">{s.icon}</div>
              <div className="revision-subject-name">{s.name}</div>
              <div className="revision-subject-count">
                {s.modules.length} module{s.modules.length === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const filteredModules = selectedSubject.modules
    .map((m, idx) => ({ m, idx }))
    .filter(({ m }) => !search.trim() || m.title.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div>
      <div className="revision-header">
        <button className="btn-outline" onClick={() => setSelectedId(null)}>
          ← Subjects
        </button>
        <div className="revision-subject-title">
          <span>{selectedSubject.icon}</span>
          <span>{selectedSubject.name}</span>
        </div>
        <input
          type="text"
          className="text-input revision-search"
          placeholder="Filter modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
        <button className="add-trigger-btn" onClick={openAddModuleModal}>
          + Add Module
        </button>
      </div>

      {showAddModuleModal && (
        <Modal title="New Module" onClose={closeAddModuleModal}>
          <div className="project-field">
            <label className="field-label">Title</label>
            <input
              type="text"
              className="text-input"
              value={moduleForm.title}
              onChange={(e) => setModuleForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Ingress"
            />
          </div>
          <div className="project-field">
            <label className="field-label">Notes</label>
            <textarea
              className="ginput"
              rows={4}
              value={moduleForm.notes}
              onChange={(e) => setModuleForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Why it's useful</label>
            <textarea
              className="ginput"
              rows={3}
              value={moduleForm.usefulness}
              onChange={(e) => setModuleForm((f) => ({ ...f, usefulness: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Interview tips</label>
            <textarea
              className="ginput"
              rows={3}
              value={moduleForm.interviewTips}
              onChange={(e) => setModuleForm((f) => ({ ...f, interviewTips: e.target.value }))}
            />
          </div>
          <div className="add-zone-save-row">
            <button className="btn-outline" onClick={closeAddModuleModal}>
              Cancel
            </button>
            <button className="btn" onClick={saveNewModule}>
              Save Module
            </button>
          </div>
        </Modal>
      )}

      {selectedSubject.modules.length === 0 && (
        <div className="empty-state-sm">No modules yet — tap "+ Add Module" above.</div>
      )}
      {selectedSubject.modules.length > 0 && filteredModules.length === 0 && (
        <div className="empty-state-sm">No modules match "{search}".</div>
      )}

      {filteredModules.map(({ m, idx }) =>
        editingModuleId === m.id ? (
          <ModuleEditCard key={m.id} mod={m} onPatch={(patch) => patchModule(m.id, patch)} onCancel={cancelEditModule} onSave={saveEditModule} />
        ) : (
          <ModuleCard
            key={m.id}
            mod={m}
            index={idx}
            expanded={!!expanded[m.id]}
            onToggle={() => toggleExpand(m.id)}
            onModify={() => startEditModule(m.id)}
            onDelete={() => deleteModule(m.id, m.title)}
            onReorder={reorderModules}
          />
        ),
      )}
    </div>
  )
}

function ModuleCard({ mod, index, expanded, onToggle, onModify, onDelete, onReorder }) {
  const hasContent = mod.notes || mod.usefulness || mod.interviewTips
  return (
    <div className="revision-module" {...dragHandlers(index, onReorder)}>
      <div className="revision-module-head" onClick={onToggle}>
        <span className="drag-handle" onClick={(e) => e.stopPropagation()}>
          ⠿
        </span>
        <span className={`revision-module-chevron ${expanded ? 'open' : ''}`}>▸</span>
        <span className="revision-module-title">{mod.title}</span>
        <div className="revision-module-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={onModify}>✎</button>
          <button className="danger" onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>
      {expanded && (
        <div className="revision-module-body">
          {!hasContent && <div className="empty-state-sm">No notes yet — tap ✎ to add some.</div>}
          {mod.notes && (
            <div className="revision-field-block">
              <div className="revision-field-label">Notes</div>
              <div className="revision-field-text">{mod.notes}</div>
            </div>
          )}
          {mod.usefulness && (
            <div className="revision-field-block">
              <div className="revision-field-label">Why it's useful</div>
              <div className="revision-field-text">{mod.usefulness}</div>
            </div>
          )}
          {mod.interviewTips && (
            <div className="revision-field-block revision-tip-block">
              <div className="revision-field-label">Interview tips</div>
              <div className="revision-field-text">{mod.interviewTips}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModuleEditCard({ mod, onPatch, onCancel, onSave }) {
  return (
    <div className="revision-module" style={{ border: '1.5px solid var(--accent)', padding: '14px' }}>
      <div className="project-field">
        <label className="field-label">Title</label>
        <input className="text-input" style={{ fontWeight: 700 }} value={mod.title || ''} onChange={(e) => onPatch({ title: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Notes</label>
        <textarea className="ginput" rows={4} value={mod.notes || ''} onChange={(e) => onPatch({ notes: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Why it's useful</label>
        <textarea className="ginput" rows={3} value={mod.usefulness || ''} onChange={(e) => onPatch({ usefulness: e.target.value })} />
      </div>
      <div className="project-field">
        <label className="field-label">Interview tips</label>
        <textarea className="ginput" rows={3} value={mod.interviewTips || ''} onChange={(e) => onPatch({ interviewTips: e.target.value })} />
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
