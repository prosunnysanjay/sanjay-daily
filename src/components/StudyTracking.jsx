import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, makeUndoStack } from '../lib/utils'

const undoStack = makeUndoStack(20)

function leaf(id, name) {
  return { id, name, expanded: true, children: [] }
}

const DEFAULT_TOPICS = [
  leaf('topic_linux', 'Linux'),
  {
    id: 'topic_docker',
    name: 'Docker (alternatives: Podman, containerd, rkt)',
    expanded: true,
    children: [
      leaf('topic_multistage', 'Multistage builds'),
      leaf('topic_compose', 'Docker Compose'),
      leaf('topic_volume', 'Volumes'),
      leaf('topic_network', 'Networking'),
      leaf('topic_docker_images', 'Images'),
      leaf('topic_docker_registries', 'Registries'),
    ],
  },
  {
    id: 'topic_kubernetes',
    name: 'Kubernetes (alternatives: Docker Swarm, Nomad, OpenShift, ECS)',
    expanded: true,
    children: [
      leaf('topic_k8s_pods', 'Pods'),
      leaf('topic_k8s_deployments', 'Deployments'),
      leaf('topic_k8s_statefulsets', 'StatefulSets'),
      leaf('topic_k8s_daemonsets', 'DaemonSets'),
      leaf('topic_k8s_services', 'Services'),
      leaf('topic_k8s_ingress', 'Ingress'),
      leaf('topic_k8s_configmaps', 'ConfigMaps'),
      leaf('topic_k8s_secrets', 'Secrets'),
      leaf('topic_k8s_rbac', 'RBAC'),
      leaf('topic_k8s_networkpolicies', 'NetworkPolicies'),
      leaf('topic_k8s_hpa_vpa', 'HPA/VPA'),
      leaf('topic_k8s_crds', 'CRDs'),
      leaf('topic_k8s_operators', 'Operators'),
    ],
  },
  {
    id: 'topic_helm',
    name: 'Helm (alternatives: Kustomize, Helmfile)',
    expanded: true,
    children: [
      leaf('topic_helm_charts', 'Charts'),
      leaf('topic_helm_values', 'Values'),
      leaf('topic_helm_templates', 'Templates'),
      leaf('topic_helm_hooks', 'Hooks'),
      leaf('topic_helm_repositories', 'Repositories'),
    ],
  },
  {
    id: 'topic_terraform',
    name: 'Terraform & Terragrunt (alternatives: Pulumi, CloudFormation, Bicep, Ansible)',
    expanded: true,
    children: [
      leaf('topic_tf_state', 'State'),
      leaf('topic_tf_modules', 'Modules'),
      leaf('topic_tf_providers', 'Providers'),
      leaf('topic_tf_workspaces', 'Workspaces'),
      leaf('topic_tf_dry', 'DRY patterns'),
    ],
  },
  {
    id: 'topic_service_mesh',
    name: 'Service Mesh (Istio, Linkerd, Consul)',
    expanded: true,
    children: [
      leaf('topic_sm_sidecars', 'Sidecars'),
      leaf('topic_sm_traffic', 'Traffic management'),
      leaf('topic_sm_mtls', 'mTLS'),
    ],
  },
  {
    id: 'topic_observability',
    name: 'Observability (Prometheus, Grafana, ELK/EFK, Datadog; alternatives: New Relic, Dynatrace, Splunk)',
    expanded: true,
    children: [
      leaf('topic_obs_metrics', 'Metrics'),
      leaf('topic_obs_logs', 'Logs'),
      leaf('topic_obs_traces', 'Traces'),
      leaf('topic_obs_alerting', 'Alerting'),
      leaf('topic_obs_slos', 'SLOs'),
    ],
  },
  {
    id: 'topic_azure',
    name: 'Azure (alternatives: AWS, GCP equivalents)',
    expanded: true,
    children: [
      leaf('topic_azure_compute', 'Compute'),
      leaf('topic_azure_networking', 'Networking'),
      leaf('topic_azure_identity', 'Identity (Entra ID)'),
      leaf('topic_azure_storage', 'Storage'),
      leaf('topic_azure_governance', 'Governance (CAF/ALZ)'),
    ],
  },
  {
    id: 'topic_azure_security',
    name: 'Azure Security (alternatives: AWS Security Hub/GuardDuty)',
    expanded: true,
    children: [
      leaf('topic_azsec_defender', 'Defender for Cloud'),
      leaf('topic_azsec_sentinel', 'Sentinel'),
      leaf('topic_azsec_keyvault', 'Key Vault'),
      leaf('topic_azsec_policy', 'Policy'),
      leaf('topic_azsec_rbac', 'RBAC'),
      leaf('topic_azsec_conditional_access', 'Conditional Access'),
    ],
  },
  {
    id: 'topic_cicd_scm',
    name: 'CI/CD & SCM (alternatives: GitLab CI, CircleCI, Flux CD)',
    expanded: true,
    children: [
      leaf('topic_cicd_git', 'Git'),
      leaf('topic_cicd_github', 'GitHub'),
      leaf('topic_cicd_actions', 'GitHub Actions'),
      leaf('topic_cicd_jenkins', 'Jenkins'),
      leaf('topic_cicd_azdo', 'Azure DevOps'),
      leaf('topic_cicd_argocd', 'ArgoCD'),
    ],
  },
  {
    id: 'topic_ai_devops',
    name: 'AI DevOps Tools',
    expanded: true,
    children: [
      leaf('topic_ai_coding_assistants', 'Coding assistants (Cursor, GitHub Copilot, Claude Code)'),
      leaf('topic_ai_infra_ops', 'AI infra/ops tools'),
      leaf('topic_ai_vector_db', 'Storage/vector DBs'),
    ],
  },
  {
    id: 'topic_devsecops',
    name: 'DevSecOps',
    expanded: true,
    children: [
      leaf('topic_ds_owasp_top10', 'OWASP Top 10'),
      leaf('topic_ds_sast', 'SAST (SonarQube, Semgrep)'),
      leaf('topic_ds_sca', 'SCA (Snyk, Dependabot)'),
      leaf('topic_ds_dast', 'DAST (OWASP ZAP)'),
      leaf('topic_ds_container_scanning', 'Container scanning (Trivy)'),
      leaf('topic_ds_iac_scanning', 'IaC scanning (Checkov, tfsec)'),
      leaf('topic_ds_k8s_security', 'K8s security (Kube-bench, Falco)'),
    ],
  },
  {
    id: 'topic_scripting',
    name: 'Scripting (alternative: PowerShell)',
    expanded: true,
    children: [leaf('topic_script_bash', 'Bash'), leaf('topic_script_python', 'Python')],
  },
  {
    id: 'topic_system_design',
    name: 'System Design',
    expanded: true,
    children: [
      leaf('topic_sysdes_scalability', 'Scalability'),
      leaf('topic_sysdes_load_balancing', 'Load balancing'),
      leaf('topic_sysdes_caching', 'Caching'),
      leaf('topic_sysdes_cap', 'CAP theorem'),
      leaf('topic_sysdes_sharding', 'Database sharding'),
    ],
  },
  {
    id: 'topic_azure_sa',
    name: 'Azure Solutions Architect',
    expanded: true,
    children: [
      leaf('topic_azsa_waf', 'Well-architected framework'),
      leaf('topic_azsa_landing_zones', 'Landing zones'),
      leaf('topic_azsa_dr_ha', 'DR/HA design'),
    ],
  },
  {
    id: 'topic_platform_eng',
    name: 'Platform Engineering',
    expanded: true,
    children: [
      leaf('topic_pe_idp', 'Internal developer platforms'),
      leaf('topic_pe_golden_paths', 'Golden paths'),
      leaf('topic_pe_backstage', 'Backstage'),
    ],
  },
  {
    id: 'topic_sre',
    name: 'SRE',
    expanded: true,
    children: [
      leaf('topic_sre_sli_slo_sla', 'SLI/SLO/SLA'),
      leaf('topic_sre_error_budgets', 'Error budgets'),
      leaf('topic_sre_incident_mgmt', 'Incident management'),
      leaf('topic_sre_chaos_engineering', 'Chaos engineering'),
    ],
  },
]

function defaultData() {
  return { topics: JSON.parse(JSON.stringify(DEFAULT_TOPICS)) }
}

function locateNode(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { arr: nodes, idx: i, node: nodes[i] }
    if (nodes[i].children && nodes[i].children.length) {
      const found = locateNode(nodes[i].children, id)
      if (found) return found
    }
  }
  return null
}

function isDescendant(node, targetId) {
  if (!node.children) return false
  for (const child of node.children) {
    if (child.id === targetId) return true
    if (isDescendant(child, targetId)) return true
  }
  return false
}

export function countTopics(nodes) {
  let n = 0
  for (const node of nodes || []) {
    n += 1
    if (node.children && node.children.length) n += countTopics(node.children)
  }
  return n
}

function addRootTopic(draft, name) {
  draft.topics.push({ id: uid('topic'), name, expanded: true, children: [] })
}

function addChildTopic(draft, parentId, name) {
  const loc = locateNode(draft.topics, parentId)
  if (!loc) return
  loc.node.children = loc.node.children || []
  loc.node.children.push({ id: uid('topic'), name, expanded: true, children: [] })
  loc.node.expanded = true
}

function renameTopic(draft, id, name) {
  const loc = locateNode(draft.topics, id)
  if (loc) loc.node.name = name
}

function deleteTopic(draft, id) {
  const loc = locateNode(draft.topics, id)
  if (loc) loc.arr.splice(loc.idx, 1)
}

function toggleExpand(draft, id) {
  const loc = locateNode(draft.topics, id)
  if (loc) loc.node.expanded = !loc.node.expanded
}

function setAllExpanded(draft, value) {
  const walk = (nodes) => {
    for (const n of nodes) {
      n.expanded = value
      if (n.children && n.children.length) walk(n.children)
    }
  }
  walk(draft.topics)
}

function moveTopic(draft, draggedId, targetId, position) {
  if (draggedId === targetId) return
  const draggedLoc = locateNode(draft.topics, draggedId)
  if (!draggedLoc) return
  if (isDescendant(draggedLoc.node, targetId)) return
  const [removed] = draggedLoc.arr.splice(draggedLoc.idx, 1)
  const targetLoc = locateNode(draft.topics, targetId)
  if (!targetLoc) {
    draggedLoc.arr.splice(draggedLoc.idx, 0, removed)
    return
  }
  if (position === 'inside') {
    targetLoc.node.children = targetLoc.node.children || []
    targetLoc.node.children.push(removed)
    targetLoc.node.expanded = true
  } else {
    const insertIdx = position === 'before' ? targetLoc.idx : targetLoc.idx + 1
    targetLoc.arr.splice(insertIdx, 0, removed)
  }
}

export default function StudyTracking({ flashSaved }) {
  const [data, setData] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [addingChildOf, setAddingChildOf] = useState(null)
  const [addingChildText, setAddingChildText] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverInfo, setDragOverInfo] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    let loaded = defaultData()
    try {
      const result = await storageGet(STORAGE_KEYS.studyTracking)
      if (result && result.value) loaded = JSON.parse(result.value)
      else await persist(loaded)
    } catch {
      await persist(loaded)
    }
    setData(loaded)
  }

  async function persist(next) {
    try {
      await storageSet(STORAGE_KEYS.studyTracking, JSON.stringify(next))
      flashSaved()
    } catch (e) {
      console.error('Study tracking save failed', e)
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

  function handleUndo() {
    if (!undoStack.canUndo()) {
      alert('Nothing to undo yet.')
      return
    }
    const prev = undoStack.pop()
    setEditingId(null)
    setAddingChildOf(null)
    setData(prev)
    persist(prev)
  }

  function handleReset() {
    if (!confirm('Reset the study mindmap to defaults? This clears your custom topics.')) return
    undoStack.push(data)
    const next = defaultData()
    setData(next)
    persist(next)
  }

  function handleAddRootTopic() {
    if (!newTopicName.trim()) return
    update((d) => addRootTopic(d, newTopicName.trim()))
    setNewTopicName('')
  }

  function startEdit(id, currentName) {
    setAddingChildOf(null)
    setEditingId(id)
    setEditingText(currentName)
  }

  function commitEdit() {
    if (editingId && editingText.trim()) {
      update((d) => renameTopic(d, editingId, editingText.trim()))
    }
    setEditingId(null)
    setEditingText('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingText('')
  }

  function startAddChild(id) {
    setEditingId(null)
    setAddingChildOf(id)
    setAddingChildText('')
  }

  function commitAddChild() {
    if (addingChildOf && addingChildText.trim()) {
      update((d) => addChildTopic(d, addingChildOf, addingChildText.trim()))
    }
    setAddingChildOf(null)
    setAddingChildText('')
  }

  function cancelAddChild() {
    setAddingChildOf(null)
    setAddingChildText('')
  }

  function handleDelete(id, name) {
    if (!confirm(`Delete "${name}" and everything under it?`)) return
    update((d) => deleteTopic(d, id))
  }

  function handleToggleExpand(id) {
    update((d) => toggleExpand(d, id), { snapshot: false })
  }

  function handleExpandAll(value) {
    update((d) => setAllExpanded(d, value), { snapshot: false })
  }

  function handleDropOn(targetId) {
    if (draggedId && dragOverInfo && dragOverInfo.id === targetId) {
      update((d) => moveTopic(d, draggedId, targetId, dragOverInfo.position))
    }
    setDraggedId(null)
    setDragOverInfo(null)
  }

  const topicCount = countTopics(data.topics)

  return (
    <div>
      <div className="tab-toolbar">
        <button className="btn-outline" onClick={() => handleExpandAll(true)}>
          ⤢ Expand all
        </button>
        <button className="btn-outline" onClick={() => handleExpandAll(false)}>
          ⤡ Collapse all
        </button>
        <button className="btn-outline" onClick={handleUndo}>
          ↺ Undo
        </button>
        <button className="btn-outline" onClick={handleReset}>
          ⟲ Reset to defaults
        </button>
      </div>

      <div className="gcard">
        <h2>Study Mindmap</h2>
        <div className="gsub">
          {topicCount} topic{topicCount === 1 ? '' : 's'} tracked. Drag a topic onto another to nest it as a
          sub-topic; drop near the top or bottom edge of a topic to reorder it as a sibling instead.
        </div>

        <div className="add-row" style={{ marginBottom: '14px' }}>
          <input
            type="text"
            placeholder="Add a new top-level topic (e.g. Kubernetes)..."
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRootTopic()}
          />
          <button onClick={handleAddRootTopic}>Add</button>
        </div>

        {data.topics.length === 0 && (
          <div className="empty-state-sm">No topics yet — add your first one above.</div>
        )}

        <div className="study-tree">
          {data.topics.map((node) => (
            <StudyNode
              key={node.id}
              node={node}
              editingId={editingId}
              editingText={editingText}
              addingChildOf={addingChildOf}
              addingChildText={addingChildText}
              draggedId={draggedId}
              dragOverInfo={dragOverInfo}
              onToggleExpand={handleToggleExpand}
              onStartEdit={startEdit}
              onEditTextChange={setEditingText}
              onCommitEdit={commitEdit}
              onCancelEdit={cancelEdit}
              onStartAddChild={startAddChild}
              onAddChildTextChange={setAddingChildText}
              onCommitAddChild={commitAddChild}
              onCancelAddChild={cancelAddChild}
              onDelete={handleDelete}
              onDragStartNode={setDraggedId}
              onDragOverNode={setDragOverInfo}
              onDropNode={handleDropOn}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StudyNode({
  node,
  editingId,
  editingText,
  addingChildOf,
  addingChildText,
  draggedId,
  dragOverInfo,
  onToggleExpand,
  onStartEdit,
  onEditTextChange,
  onCommitEdit,
  onCancelEdit,
  onStartAddChild,
  onAddChildTextChange,
  onCommitAddChild,
  onCancelAddChild,
  onDelete,
  onDragStartNode,
  onDragOverNode,
  onDropNode,
}) {
  const hasChildren = node.children && node.children.length > 0
  const isEditing = editingId === node.id
  const isAddingChild = addingChildOf === node.id
  const isDragging = draggedId === node.id
  const isDropTarget = !!dragOverInfo && dragOverInfo.id === node.id

  function handleDragOver(e) {
    e.preventDefault()
    if (!draggedId || draggedId === node.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    let position = 'inside'
    if (ratio < 0.25) position = 'before'
    else if (ratio > 0.75) position = 'after'
    onDragOverNode({ id: node.id, position })
  }

  const rowClass = [
    'study-row',
    isDragging ? 'dragging' : '',
    isDropTarget ? `study-drop-${dragOverInfo.position}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="study-node">
      <div
        className={rowClass}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStartNode(node.id)
        }}
        onDragEnd={() => {
          onDragStartNode(null)
          onDragOverNode(null)
        }}
        onDragOver={handleDragOver}
        onDragLeave={() => isDropTarget && onDragOverNode(null)}
        onDrop={(e) => {
          e.preventDefault()
          onDropNode(node.id)
        }}
      >
        <span className="drag-handle">⠿</span>

        <button
          type="button"
          className="study-caret"
          onClick={() => hasChildren && onToggleExpand(node.id)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {node.expanded ? '▾' : '▸'}
        </button>

        {isEditing ? (
          <span className="study-edit-wrap">
            <input
              className="study-edit-input"
              autoFocus
              value={editingText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
            />
            <button type="button" className="study-inline-btn" onClick={onCommitEdit}>
              ✓
            </button>
            <button type="button" className="study-inline-btn" onClick={onCancelEdit}>
              ✕
            </button>
          </span>
        ) : (
          <span className="study-name">{node.name}</span>
        )}

        {!isEditing && (
          <div className="study-actions">
            <button type="button" title="Add sub-topic" onClick={() => onStartAddChild(node.id)}>
              ➕
            </button>
            <button type="button" title="Rename" onClick={() => onStartEdit(node.id, node.name)}>
              ✎
            </button>
            <button type="button" title="Delete" className="danger" onClick={() => onDelete(node.id, node.name)}>
              🗑
            </button>
          </div>
        )}
      </div>

      {((hasChildren && node.expanded) || isAddingChild) && (
        <div className="study-tree-children">
          {hasChildren &&
            node.expanded &&
            node.children.map((child) => (
              <StudyNode
                key={child.id}
                node={child}
                editingId={editingId}
                editingText={editingText}
                addingChildOf={addingChildOf}
                addingChildText={addingChildText}
                draggedId={draggedId}
                dragOverInfo={dragOverInfo}
                onToggleExpand={onToggleExpand}
                onStartEdit={onStartEdit}
                onEditTextChange={onEditTextChange}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
                onStartAddChild={onStartAddChild}
                onAddChildTextChange={onAddChildTextChange}
                onCommitAddChild={onCommitAddChild}
                onCancelAddChild={onCancelAddChild}
                onDelete={onDelete}
                onDragStartNode={onDragStartNode}
                onDragOverNode={onDragOverNode}
                onDropNode={onDropNode}
              />
            ))}
          {isAddingChild && (
            <div className="study-add-child-row">
              <input
                autoFocus
                placeholder="New sub-topic..."
                value={addingChildText}
                onChange={(e) => onAddChildTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCommitAddChild()
                  if (e.key === 'Escape') onCancelAddChild()
                }}
              />
              <button type="button" onClick={onCommitAddChild}>
                Add
              </button>
              <button type="button" className="study-inline-btn" onClick={onCancelAddChild}>
                ✕
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
