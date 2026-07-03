import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { hierarchy, tree as d3tree } from 'd3-hierarchy'
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

// ---- Radial/branching mindmap rendering (React Flow + d3-hierarchy for layout) ----
// Each top-level topic gets its own independent mini-mindmap canvas (its own
// ReactFlowProvider), rooted at that topic itself rather than one shared root.

const PLACEHOLDER_ID = '__add_placeholder__'
const NODE_WIDTH = 230
const NODE_HEIGHT = 40
const V_GAP = 14
const H_GAP = 90

function buildLayoutForTopic(topic, addingChildOf) {
  let sourceTopic = topic
  if (addingChildOf) {
    const clone = structuredClone(topic)
    const loc = locateNode([clone], addingChildOf)
    if (loc) {
      loc.node.expanded = true
      loc.node.children = loc.node.children || []
      loc.node.children.push({ id: PLACEHOLDER_ID, name: '', isPlaceholder: true, expanded: false, children: [] })
    }
    sourceTopic = clone
  }

  const root = hierarchy(sourceTopic, (d) => (d.expanded && d.children && d.children.length ? d.children : undefined))
  const layout = d3tree().nodeSize([NODE_HEIGHT + V_GAP, NODE_WIDTH + H_GAP])
  layout(root)
  return root
}

function buildFlowForTopic(topic, ctx) {
  const root = buildLayoutForTopic(topic, ctx.addingChildOf)
  const descendants = root.descendants()

  const nodes = descendants.map((d) => {
    const t = d.data
    const position = { x: d.y, y: d.x }
    if (t.isPlaceholder) {
      return {
        id: t.id,
        type: 'addChildNode',
        position,
        data: {
          text: ctx.addingChildText,
          onTextChange: ctx.onAddChildTextChange,
          onCommit: ctx.onCommitAddChild,
          onCancel: ctx.onCancelAddChild,
        },
        draggable: false,
        selectable: false,
      }
    }
    const hasChildren = !!(t.children && t.children.length)
    const isRoot = t.id === topic.id
    return {
      id: t.id,
      type: 'topicNode',
      position,
      dragHandle: '.study-drag-handle',
      draggable: !isRoot,
      data: {
        name: t.name,
        hasChildren,
        expanded: !!t.expanded,
        isRoot,
        isEditing: ctx.editingId === t.id,
        editText: ctx.editingText,
        onToggleExpand: ctx.onToggleExpand,
        onStartEdit: ctx.onStartEdit,
        onEditTextChange: ctx.onEditTextChange,
        onCommitEdit: ctx.onCommitEdit,
        onCancelEdit: ctx.onCancelEdit,
        onStartAddChild: ctx.onStartAddChild,
        onDelete: ctx.onDelete,
      },
    }
  })

  const edges = root.links().map((l) => ({
    id: `e-${l.source.data.id}-${l.target.data.id}`,
    source: l.source.data.id,
    target: l.target.data.id,
    type: 'default',
    style: { stroke: 'var(--accent)', strokeWidth: 1.5, opacity: 0.5 },
  }))

  return { nodes, edges }
}

function TopicNode({ id, data }) {
  const { name, hasChildren, expanded, isEditing, editText, isRoot } = data
  return (
    <div className={`study-flow-node ${isRoot ? 'is-root' : ''}`} data-topic-id={id}>
      <Handle type="target" position={Position.Left} className="study-flow-handle" />
      <div className="study-flow-node-inner">
        <span className="study-drag-handle" title="Drag to move">
          ⠿
        </span>
        <button
          type="button"
          className="study-flow-caret"
          onClick={() => hasChildren && data.onToggleExpand(id)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? '▾' : '▸'}
        </button>

        {isEditing ? (
          <span className="study-flow-edit-wrap">
            <input
              className="study-flow-edit-input"
              autoFocus
              value={editText}
              onChange={(e) => data.onEditTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') data.onCommitEdit()
                if (e.key === 'Escape') data.onCancelEdit()
              }}
            />
            <button type="button" className="study-flow-inline-btn" onClick={data.onCommitEdit}>
              ✓
            </button>
            <button type="button" className="study-flow-inline-btn" onClick={data.onCancelEdit}>
              ✕
            </button>
          </span>
        ) : (
          <span className="study-flow-name" title={name}>
            {name}
          </span>
        )}

        {!isEditing && (
          <div className="study-flow-actions">
            <button type="button" title="Add sub-topic" onClick={() => data.onStartAddChild(id)}>
              ➕
            </button>
            <button type="button" title="Rename" onClick={() => data.onStartEdit(id, name)}>
              ✎
            </button>
            <button type="button" title="Delete" className="danger" onClick={() => data.onDelete(id, name)}>
              🗑
            </button>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="study-flow-handle" />
    </div>
  )
}

function AddChildNode({ data }) {
  return (
    <div className="study-flow-node study-flow-add-node">
      <Handle type="target" position={Position.Left} className="study-flow-handle" />
      <div className="study-flow-node-inner">
        <input
          className="study-flow-edit-input"
          autoFocus
          placeholder="New sub-topic..."
          value={data.text}
          onChange={(e) => data.onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') data.onCommit()
            if (e.key === 'Escape') data.onCancel()
          }}
        />
        <button type="button" className="study-flow-inline-btn" onClick={data.onCommit}>
          Add
        </button>
        <button type="button" className="study-flow-inline-btn" onClick={data.onCancel}>
          ✕
        </button>
      </div>
    </div>
  )
}

const nodeTypes = { topicNode: TopicNode, addChildNode: AddChildNode }

function clearDropHighlight(container) {
  if (!container) return
  container.querySelectorAll('.is-drop-before, .is-drop-after, .is-drop-inside').forEach((el) => {
    el.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-inside')
  })
}

function findDropTarget(layoutNodesById, draggedId, draggedPosition, topics) {
  const draggedLoc = locateNode(topics, draggedId)
  if (!draggedLoc) return null
  const dLeft = draggedPosition.x
  const dTop = draggedPosition.y
  const dRight = dLeft + NODE_WIDTH
  const dBottom = dTop + NODE_HEIGHT

  let best = null
  let bestArea = 0
  for (const [id, pos] of layoutNodesById) {
    if (id === draggedId) continue
    if (isDescendant(draggedLoc.node, id)) continue
    const left = pos.x
    const top = pos.y
    const right = left + NODE_WIDTH
    const bottom = top + NODE_HEIGHT
    const overlapX = Math.min(dRight, right) - Math.max(dLeft, left)
    const overlapY = Math.min(dBottom, bottom) - Math.max(dTop, top)
    if (overlapX > 0 && overlapY > 0) {
      const area = overlapX * overlapY
      if (area > bestArea) {
        bestArea = area
        const ratio = (dTop + NODE_HEIGHT / 2 - top) / NODE_HEIGHT
        let position = 'inside'
        if (ratio < 0.25) position = 'before'
        else if (ratio > 0.75) position = 'after'
        best = { id, position }
      }
    }
  }
  return best
}

function TopicMindmapCanvas({ topic, editingId, editingText, addingChildOf, addingChildText, callbacks, onMoveTopic }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const containerRef = useRef(null)
  const layoutNodesRef = useRef(new Map())
  const topicRef = useRef(topic)
  const didInitialFit = useRef(false)
  const { fitView } = useReactFlow()

  useEffect(() => {
    topicRef.current = topic
  }, [topic])

  useEffect(() => {
    const { nodes: flowNodes, edges: flowEdges } = buildFlowForTopic(topic, {
      editingId,
      editingText,
      addingChildOf,
      addingChildText,
      ...callbacks,
    })
    layoutNodesRef.current = new Map(flowNodes.map((n) => [n.id, n.position]))
    setNodes(flowNodes)
    setEdges(flowEdges)
    if (!didInitialFit.current) {
      didInitialFit.current = true
      setTimeout(() => fitView({ padding: 0.2, duration: 0, minZoom: 0.5, maxZoom: 1 }), 30)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, editingId, editingText, addingChildOf, addingChildText])

  function handleNodeDrag(event, node) {
    if (node.type !== 'topicNode') return
    const target = findDropTarget(layoutNodesRef.current, node.id, node.position, [topicRef.current])
    clearDropHighlight(containerRef.current)
    if (target && containerRef.current) {
      const el = containerRef.current.querySelector(`[data-topic-id="${target.id}"]`)
      if (el) el.closest('.study-flow-node')?.classList.add(`is-drop-${target.position}`)
    }
  }

  function handleNodeDragStop(event, node) {
    clearDropHighlight(containerRef.current)
    if (node.type !== 'topicNode') return
    const target = findDropTarget(layoutNodesRef.current, node.id, node.position, [topicRef.current])
    if (target) {
      onMoveTopic(node.id, target.id, target.position)
    } else {
      const { nodes: flowNodes } = buildFlowForTopic(topicRef.current, {
        editingId,
        editingText,
        addingChildOf,
        addingChildText,
        ...callbacks,
      })
      setNodes(flowNodes)
    }
  }

  return (
    <div className="study-flow-wrap" ref={containerRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesConnectable={false}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

function TopicMindmapCard({ topic, ...rest }) {
  const childCount = countTopics(topic.children || [])
  return (
    <div className="gcard study-section-card">
      <div className="study-section-head">
        <h2>{topic.name}</h2>
        <div className="gsub">
          {childCount} sub-topic{childCount === 1 ? '' : 's'}
        </div>
      </div>
      <ReactFlowProvider>
        <TopicMindmapCanvas topic={topic} {...rest} />
      </ReactFlowProvider>
    </div>
  )
}

export default function StudyTracking({ flashSaved }) {
  const [data, setData] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [addingChildOf, setAddingChildOf] = useState(null)
  const [addingChildText, setAddingChildText] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [selectedTopicIds, setSelectedTopicIds] = useState(() => new Set())

  const dataRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    dataRef.current = data
  }, [data])

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
    setSelectedTopicIds(new Set())
    setData(prev)
    persist(prev)
  }

  function handleReset() {
    if (!confirm('Reset the study mindmap to defaults? This clears your custom topics.')) return
    undoStack.push(data)
    const next = defaultData()
    setSelectedTopicIds(new Set())
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
    setSelectedTopicIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function handleToggleExpand(id) {
    update((d) => toggleExpand(d, id), { snapshot: false })
  }

  function handleExpandAll(value) {
    update((d) => setAllExpanded(d, value), { snapshot: false })
  }

  function handleMoveTopic(draggedId, targetId, position) {
    const next = structuredClone(dataRef.current)
    moveTopic(next, draggedId, targetId, position)
    undoStack.push(dataRef.current)
    setData(next)
    persist(next)
  }

  function toggleTopicSelection(id) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllTopics() {
    setSelectedTopicIds(new Set(data.topics.map((t) => t.id)))
  }

  function clearTopicSelection() {
    setSelectedTopicIds(new Set())
  }

  const topicCount = countTopics(data.topics)
  const hasSelection = selectedTopicIds.size > 0
  const visibleTopics = hasSelection ? data.topics.filter((t) => selectedTopicIds.has(t.id)) : data.topics

  const callbacks = {
    onToggleExpand: handleToggleExpand,
    onStartEdit: startEdit,
    onEditTextChange: setEditingText,
    onCommitEdit: commitEdit,
    onCancelEdit: cancelEdit,
    onStartAddChild: startAddChild,
    onDelete: handleDelete,
    onAddChildTextChange: setAddingChildText,
    onCommitAddChild: commitAddChild,
    onCancelAddChild: cancelAddChild,
  }

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
        <h2>Jump to a Section</h2>
        <div className="gsub">
          {hasSelection
            ? `Showing ${visibleTopics.length} of ${data.topics.length} section${data.topics.length === 1 ? '' : 's'}.`
            : `All ${data.topics.length} section${data.topics.length === 1 ? '' : 's'} shown. Select one or more topics to filter the mindmaps below.`}
        </div>
        <div className="study-topic-chip-row">
          {data.topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className={`study-topic-chip ${selectedTopicIds.has(topic.id) ? 'active' : ''}`}
              onClick={() => toggleTopicSelection(topic.id)}
            >
              {topic.name}
            </button>
          ))}
        </div>
        <div className="study-topic-chip-actions">
          <button className="btn-outline" onClick={selectAllTopics}>
            Select all
          </button>
          <button className="btn-outline" onClick={clearTopicSelection} disabled={!hasSelection}>
            Show all
          </button>
        </div>
      </div>

      <div className="gcard">
        <h2>Study Mindmap</h2>
        <div className="gsub">
          {topicCount} topic{topicCount === 1 ? '' : 's'} across {data.topics.length} section
          {data.topics.length === 1 ? '' : 's'}. Each section below is its own mindmap — drag a topic onto another
          within the same section to nest it, or near the top/bottom edge to reorder it as a sibling.
        </div>

        <div className="add-row">
          <input
            type="text"
            placeholder="Add a new section (e.g. Kubernetes)..."
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRootTopic()}
          />
          <button onClick={handleAddRootTopic}>Add</button>
        </div>
      </div>

      {data.topics.length === 0 && <div className="empty-state-sm">No sections yet — add your first one above.</div>}

      {hasSelection && visibleTopics.length === 0 && (
        <div className="empty-state-sm">No sections match your selection.</div>
      )}

      {visibleTopics.map((topic) => (
        <TopicMindmapCard
          key={topic.id}
          topic={topic}
          editingId={editingId}
          editingText={editingText}
          addingChildOf={addingChildOf}
          addingChildText={addingChildText}
          callbacks={callbacks}
          onMoveTopic={handleMoveTopic}
        />
      ))}
    </div>
  )
}
