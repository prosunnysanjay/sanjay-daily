import { useEffect, useState } from 'react'
import { storageGet, storageSet, STORAGE_KEYS } from '../lib/supabase'
import { uid, makeUndoStack } from '../lib/utils'

const undoStack = makeUndoStack(20)

const DEFAULT_TOPICS = [
  {
    id: 'topic_linux',
    name: 'Linux',
    expanded: true,
    children: [
      {
        id: 'topic_docker',
        name: 'Docker',
        expanded: true,
        children: [
          { id: 'topic_multistage', name: 'Multistage builds', expanded: true, children: [] },
          { id: 'topic_compose', name: 'Docker Compose', expanded: true, children: [] },
          { id: 'topic_volume', name: 'Volumes', expanded: true, children: [] },
          { id: 'topic_network', name: 'Networking', expanded: true, children: [] },
        ],
      },
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
