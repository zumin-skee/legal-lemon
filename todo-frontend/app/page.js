'use client'
import { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:3001'

// ── Tree helpers ────────────────────────────────────────────────────────────

const updateInTree = (nodes, id, updater) =>
  nodes.map(n =>
    n.id === id
      ? updater(n)
      : { ...n, children: updateInTree(n.children || [], id, updater) }
  )

const removeFromTree = (nodes, id) =>
  nodes
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: removeFromTree(n.children || [], id) }))

const findParentInTree = (nodes, targetId) => {
  for (const n of nodes) {
    if ((n.children || []).some(c => c.id === targetId)) return n
    const found = findParentInTree(n.children || [], targetId)
    if (found) return found
  }
  return null
}

const countAllDescendants = (todo) => {
  const children = todo.children || []
  return children.length + children.reduce((s, c) => s + (c.children || []).length, 0)
}

const countActiveSubtasks = (todos) =>
  todos.reduce((sum, t) => {
    const l2 = (t.children || []).filter(c => !c.completed).length
    const l3 = (t.children || []).flatMap(c => (c.children || []).filter(gc => !gc.completed)).length
    return sum + l2 + l3
  }, 0)

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [todos, setTodosState] = useState([])
  const todosRef = useRef([])

  const setTodos = (val) => {
    todosRef.current = val
    setTodosState(val)
  }

  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [addingSubtaskId, setAddingSubtaskId] = useState(null)
  const [subtaskInput, setSubtaskInput] = useState('')

  const editInputRef = useRef(null)
  const subtaskInputRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/todos`)
      .then(r => r.json())
      .then(data => setTodos(data))
      .catch(() => {})
  }, [])

  // ── CRUD helpers ──────────────────────────────────────────────────────────

  const patchTodo = (id, data) =>
    fetch(`${API}/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json())

  // ── Add top-level task ────────────────────────────────────────────────────

  const addTodo = async () => {
    if (!input.trim()) return
    const todo = await fetch(`${API}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input })
    }).then(r => r.json())
    setTodos([todo, ...todosRef.current])
    setInput('')
  }

  // ── Add sub task ──────────────────────────────────────────────────────────

  const openAddSubtask = (id) => {
    setAddingSubtaskId(id)
    setSubtaskInput('')
    setTimeout(() => subtaskInputRef.current?.focus(), 0)
  }

  const cancelAddSubtask = () => {
    setAddingSubtaskId(null)
    setSubtaskInput('')
  }

  const addSubtask = async (parentId) => {
    if (!subtaskInput.trim()) return
    const todo = await fetch(`${API}/todos/${parentId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: subtaskInput })
    }).then(r => r.json())
    setTodos(updateInTree(todosRef.current, parentId, p => ({
      ...p,
      children: [...(p.children || []), todo]
    })))
    setExpandedIds(prev => new Set(prev).add(parentId))
    setSubtaskInput('')
    setAddingSubtaskId(null)
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Toggle complete + cascade up ──────────────────────────────────────────

  const autoCompleteAncestors = async (tree, completedId) => {
    const parent = findParentInTree(tree, completedId)
    if (!parent || parent.completed) return
    const allChildrenDone = (parent.children || []).every(c => c.completed)
    if (!allChildrenDone) return

    const updatedParent = await patchTodo(parent.id, { completed: true })
    const newTree = updateInTree(tree, updatedParent.id, () => updatedParent)
    setTodos(newTree)
    await autoCompleteAncestors(newTree, parent.id)
  }

  const toggleTodo = async (todo) => {
    const updated = await patchTodo(todo.id, { completed: !todo.completed })
    const newTree = updateInTree(todosRef.current, updated.id, () => updated)
    setTodos(newTree)
    if (!todo.completed) {
      await autoCompleteAncestors(newTree, updated.id)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteTodo = async (todo) => {
    const descCount = countAllDescendants(todo)
    if (descCount > 0) {
      const ok = window.confirm(
        `This will also delete ${descCount} sub task${descCount > 1 ? 's' : ''}. Continue?`
      )
      if (!ok) return
    }
    await fetch(`${API}/todos/${todo.id}`, { method: 'DELETE' })
    setTodos(removeFromTree(todosRef.current, todo.id))
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  const startEditing = (todo) => {
    setEditingId(todo.id)
    setEditingTitle(todo.title)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const saveEdit = async (id) => {
    const trimmed = editingTitle.trim()
    if (!trimmed) { cancelEdit(); return }
    const updated = await patchTodo(id, { title: trimmed })
    setTodos(updateInTree(todosRef.current, updated.id, () => updated))
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  // ── Render task line (recursive) ──────────────────────────────────────────

  const renderTaskEntry = (todo, index, depth = 0) => {
    const children = todo.children || []
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(todo.id)
    const isAddingSubtask = addingSubtaskId === todo.id
    const canAddSubtask = depth < 2 && !todo.completed
    const completedChildCount = children.filter(c => c.completed).length

    return (
      <li key={todo.id} className={`task-line${depth > 0 ? ' task-line--sub' : ''}`}>
        <div className="task-row-inner">

          {/* Margin gutter */}
          <span
            className={`line-margin${hasChildren ? ' line-margin--btn' : ''}`}
            onClick={hasChildren ? () => toggleExpand(todo.id) : undefined}
          >
            {hasChildren
              ? (isExpanded ? '▾' : '▸')
              : depth === 0
                ? String(index + 1).padStart(2, '0')
                : '·'
            }
          </span>

          {/* Task text / edit field */}
          <div className="line-content">
            {editingId === todo.id ? (
              <input
                ref={editInputRef}
                value={editingTitle}
                onChange={e => setEditingTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(todo.id)
                  if (e.key === 'Escape') cancelEdit()
                }}
                onBlur={() => saveEdit(todo.id)}
                className="edit-field"
              />
            ) : (
              <>
                <span className={`task-text${todo.completed ? ' task-text--done' : ''}`}>
                  {todo.title}
                </span>
                {hasChildren && !isExpanded && (
                  <span className="sub-count">{completedChildCount}/{children.length}</span>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="line-actions">
            {canAddSubtask && (
              <button
                onClick={() => openAddSubtask(todo.id)}
                className="act-btn act-subtask"
                title="Add sub task"
              >⊕</button>
            )}
            {todo.completed ? (
              <button
                onClick={() => toggleTodo(todo)}
                className="act-btn act-reopen"
                title="Reopen"
              >↩</button>
            ) : (
              <button
                onClick={() => toggleTodo(todo)}
                className="act-btn act-check"
                title="Complete"
              >✓</button>
            )}
            <button
              onClick={() => startEditing(todo)}
              className="act-btn act-edit"
              title="Edit"
            >✎</button>
            <button
              onClick={() => deleteTodo(todo)}
              className="act-btn act-del"
              title="Delete"
            >✕</button>
          </div>
        </div>

        {/* Inline subtask input */}
        {isAddingSubtask && (
          <div className="add-subtask-row">
            <input
              ref={subtaskInputRef}
              value={subtaskInput}
              onChange={e => setSubtaskInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addSubtask(todo.id)
                if (e.key === 'Escape') cancelAddSubtask()
              }}
              placeholder="add a sub task..."
              className="pad-input"
            />
            <button onClick={() => addSubtask(todo.id)} className="submit-btn submit-btn-sm">File</button>
            <button onClick={cancelAddSubtask} className="act-btn act-del">✕</button>
          </div>
        )}

        {/* Expanded subtasks */}
        {isExpanded && hasChildren && (
          <ul className="subtask-lines">
            {children.map((child, i) => renderTaskEntry(child, i, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  }).toUpperCase()
  const volNum = Math.floor((Date.now() - new Date('2024-01-01')) / 86400000)

  const activeTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)
  const activeSubtaskCount = countActiveSubtasks(todos)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="legal-pad-wrapper">

      {/* ── SPIRAL BINDING ───────────────────────────── */}
      <div className="binding">
        <div className="binding-strip" />
        <div className="coils">
          {Array.from({ length: 17 }).map((_, i) => (
            <div key={i} className="coil" />
          ))}
        </div>
      </div>

      {/* ── PAD SURFACE ──────────────────────────────── */}
      <div className="pad">

        {/* Header */}
        <div className="pad-header">
          <div className="pad-title">Task Pad</div>
          <div className="pad-meta">
            <div>{dateStr}</div>
            <div>
              {activeTodos.length} open
              {activeSubtaskCount > 0 ? ` · ${activeSubtaskCount} sub` : ''}
              {completedTodos.length > 0 ? ` · ${completedTodos.length} done` : ''}
            </div>
          </div>
        </div>

        {/* Input line */}
        <div className="task-line input-line">
          <div className="task-row-inner">
            <span className="line-margin" style={{ fontSize: '1.1rem', color: 'var(--ink-ghost)' }}>+</span>
            <div className="line-content">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTodo()}
                placeholder="write a new task..."
                className="pad-input"
              />
            </div>
            <div className="line-actions" style={{ opacity: 1 }}>
              <button onClick={addTodo} className="submit-btn">Add</button>
            </div>
          </div>
        </div>

        {/* Active tasks */}
        {activeTodos.length === 0 ? (
          <div className="empty-line">the pad is clear — nothing outstanding</div>
        ) : (
          <ul className="task-lines">
            {activeTodos.map((todo, i) => renderTaskEntry(todo, i, 0))}
          </ul>
        )}

        {/* Completed section */}
        {completedTodos.length > 0 && (
          <>
            <div className="section-divider">
              <span className="section-divider-label">Completed</span>
              <div className="section-divider-line" />
            </div>
            <ul className="task-lines">
              {completedTodos.map((todo, i) => (
                <li key={todo.id} className="task-line">
                  <div className="task-row-inner">
                    <span className="line-margin">{String(i + 1).padStart(2, '0')}</span>
                    <div className="line-content">
                      <span className="task-text task-text--done">{todo.title}</span>
                    </div>
                    <div className="line-actions">
                      <button
                        onClick={() => toggleTodo(todo)}
                        className="act-btn act-reopen"
                        title="Reopen"
                      >↩</button>
                      <button
                        onClick={() => deleteTodo(todo)}
                        className="act-btn act-del"
                        title="Delete"
                      >✕</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Footer */}
        <div className="pad-footer">
          <span className="pad-footer-text">vol. {volNum} · all matters duly recorded</span>
        </div>

      </div>
    </div>
  )
}
