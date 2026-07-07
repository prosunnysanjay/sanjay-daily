import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, escapeHtml, dragHandlers, reorderArray, makeUndoStack } from '../lib/utils'
import Modal from './Modal'

const undoStack = makeUndoStack(20)
const BLANK_PROJECT = { name: '', description: '', tools: '', concepts: '', architecture: '', notes: '' }

const SEED_PROJECTS = [
  {
    name: 'MindBridge AI Auditor — KPMG Clara Analytics (KCA AITS)',
    description:
      "AI Transaction Scoring system built for KPMG (Big 4) — scores financial transactions from 0 to 1 for risk and anomaly detection, the higher the score the more unusual the transaction. Ran on multi-region AKS across 5 regions (US, UK, CA, EMA, Pilot), each with primary + DR clusters, maintaining 99.9% uptime SLA with cost optimization.",
    tools:
      'Azure, AKS, Azure DevOps, Azure Application Gateway (WAF), Azure Log Analytics/KQL, Azure Key Vault, Azure CLI, MongoDB, SCOM, Bash, ServiceNow',
    concepts:
      'Multi-region HA architecture, DR/failover, RBAC, Conditional Access, Azure Policy, Zero Trust security, ITIL incident/change management, WAF/OWASP CRS tuning, secrets rotation',
    architecture:
      '- Provisioned and operated the full Azure/DevOps platform on multi-region AKS (10 clusters: primary + DR across US/UK/CA/EMA/Pilot), building CI/CD pipelines in Azure DevOps.\n- Managed cluster health, scaling, node pools, and high availability across regions.\n- Diagnosed and resolved Azure Application Gateway WAF 403 incidents via KQL queries against Azure Diagnostics firewall logs in Log Analytics; identified triggered OWASP CRS rules and applied targeted WAF exclusions.\n- Ran daily operational monitoring via custom SCOM-integrated Bash scripts — MongoDB snapshot health, collider job queuing, pgsusan shard states, node disk utilization across primary and DR clusters.\n- Managed secrets, TLS certificates, and MongoDB credentials across primary/DR Azure Key Vaults; synced secrets cross-region using Azure CLI scripting.\n- Handled incidents and change requests via ServiceNow under ITIL; implemented Zero Trust controls (RBAC, Conditional Access, Azure Policy) across identity, network, and workload layers.',
    notes: '',
  },
  {
    name: 'Cloud-Native E-Commerce Platform (100+ Microservices)',
    description:
      'A reference cloud-native e-commerce platform simulating a real online retail business (browse products, add to cart, place orders, track deliveries) selling general consumer goods — modeled on large-scale microservices architectures like Amazon/Flipkart, built to replicate real-world enterprise patterns rather than a real business.',
    tools:
      'Go, Java, Python, Docker, Docker Compose, Terraform, Kubernetes, AKS, GitHub Actions, Argo CD, OpenFeature (flagd), OpenTelemetry, Prometheus, Grafana, EFK',
    concepts:
      'Polyglot microservices architecture, multi-stage builds, GitOps, feature flagging, SAST/DAST, remote state locking, observability (metrics/logs/traces), custom DNS per environment',
    architecture:
      '- Architected end-to-end DevOps infrastructure for 100+ microservices across Go, Java, and Python; collaborated with multiple dev teams each owning 4-5 microservices.\n- Containerized polyglot microservices with multi-stage Dockerfiles; orchestrated local dev environments with Docker Compose.\n- Provisioned AKS infrastructure using Terraform with remote state locking and modular design.\n- Deployed workloads to AKS via Kubernetes manifests with RBAC-scoped Service Accounts; integrated OpenFeature flagd for feature flag management; configured custom DNS across dev/staging/production.\n- Built GitHub Actions CI pipelines with integrated SAST/DAST security scanning.\n- Implemented GitOps-based CD using Argo CD, cutting deployment cycle time by 20%.\n- Deployed a full observability stack: OpenTelemetry, Prometheus, Grafana, and EFK.',
    notes: '',
  },
  {
    name: 'Monolithic Go Web App DevOps Modernisation',
    description:
      'Internal Order Management System used by warehouse and operations teams — handled order processing, inventory updates, shipment creation, invoice generation, and customer order tracking. Originally a single Go monolith deployed on VMs; modernized with full containerization and delivery automation without changing application code.',
    tools:
      'Go, Docker, Kubernetes, Helm, AKS, GitHub Actions, Argo CD, Nginx Ingress, Jenkins, Azure DevOps, Terraform, Terragrunt, Prometheus, Grafana, Nagios, ServiceNow',
    concepts:
      'Monolith containerization without code changes, GitOps, SAST/DAST scanning, IaC, ITIL incident management, DevSecOps practices',
    architecture:
      '- Modernised the monolith with complete containerization — multi-stage Dockerfile, Kubernetes manifests, Helm charts for AKS — without altering application code.\n- Built a GitHub Actions CI pipeline for automated build, test, and container registry push.\n- Implemented Argo CD for GitOps-based CD with automated sync to AKS; configured Nginx Ingress for traffic routing.\n- Designed and maintained CI/CD pipelines using Jenkins and Azure DevOps with integrated SAST/DAST security scanning.\n- Provisioned infrastructure using Terraform and Terragrunt.\n- Monitored system performance using Prometheus, Grafana, and Nagios; responded to incidents per ITIL via ServiceNow.\n- Collaborated with dev teams to enforce DevSecOps practices across delivery pipelines.',
    notes: '',
  },
]

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
    let needsPersist = false
    try {
      const result = await storageGet(STORAGE_KEYS.projects)
      if (result && result.value) loaded = JSON.parse(result.value)
      else needsPersist = true
    } catch {
      needsPersist = true
    }

    // One-time seed: add each resume project once (matched by name), leaving any
    // projects the user already added or edited untouched.
    for (const seed of SEED_PROJECTS) {
      if (!loaded.projects.some((p) => p.name === seed.name)) {
        loaded.projects.push({ id: uid('proj'), ...seed })
        needsPersist = true
      }
    }

    if (needsPersist) await persist(loaded)
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
            <label className="field-label">What I've Done</label>
            <textarea
              className="ginput"
              rows={3}
              value={newProj.architecture}
              onChange={(e) => setNewProj((p) => ({ ...p, architecture: e.target.value }))}
            />
          </div>
          <div className="project-field">
            <label className="field-label">Additional Notes (optional)</label>
            <textarea
              className="ginput"
              rows={3}
              value={newProj.notes}
              onChange={(e) => setNewProj((p) => ({ ...p, notes: e.target.value }))}
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
                    ? "<strong>What I've Done:</strong> " +
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
        <label className="field-label">What I've Done</label>
        <textarea
          className="ginput"
          rows={3}
          value={proj.architecture || ''}
          onChange={(e) => onPatch({ architecture: e.target.value })}
        />
      </div>
      <div className="project-field">
        <label className="field-label">Additional Notes (optional)</label>
        <textarea className="ginput" rows={3} value={proj.notes || ''} onChange={(e) => onPatch({ notes: e.target.value })} />
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
