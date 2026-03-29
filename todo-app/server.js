const express = require('express')
const cors = require('cors')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const adapter = new PrismaPg({ connectionString: 'postgresql://zuminskee@localhost:5432/todoapp' })
const prisma = new PrismaClient({ adapter })

const app = express()
app.use(cors())
app.use(express.json())

// Nested include for up to 3 levels (L1 → L2 → L3)
const SUBTASK_INCLUDE = {
  children: {
    orderBy: { createdAt: 'asc' },
    include: {
      children: {
        orderBy: { createdAt: 'asc' }
      }
    }
  }
}

// GET all top-level todos with nested children
app.get('/todos', async (req, res) => {
  const todos = await prisma.todo.findMany({
    where: { parentId: null },
    orderBy: { createdAt: 'desc' },
    include: SUBTASK_INCLUDE
  })
  res.json(todos)
})

// POST create a new top-level todo
app.post('/todos', async (req, res) => {
  const todo = await prisma.todo.create({
    data: { title: req.body.title },
    include: SUBTASK_INCLUDE
  })
  res.json(todo)
})

// POST create a sub task under a parent
app.post('/todos/:id/subtasks', async (req, res) => {
  const parentId = parseInt(req.params.id)

  const parent = await prisma.todo.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true, parent: { select: { parentId: true } } }
  })

  if (!parent) return res.status(404).json({ error: 'Parent task not found' })

  // Reject if parent is already at L3 (has a parent that also has a parent)
  if (parent.parentId !== null && parent.parent?.parentId !== null) {
    return res.status(400).json({ error: 'Maximum depth reached. Sub tasks support up to 3 levels.' })
  }

  if (!req.body.title?.trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }

  const todo = await prisma.todo.create({
    data: { title: req.body.title.trim(), parentId },
    include: { children: true }
  })
  res.status(201).json(todo)
})

// PATCH update todo (completed and/or title) with cascade completion downward
app.patch('/todos/:id', async (req, res) => {
  const data = {}
  if (req.body.completed !== undefined) data.completed = req.body.completed
  if (req.body.title !== undefined) data.title = req.body.title

  const todo = await prisma.todo.update({
    where: { id: parseInt(req.params.id) },
    data,
    include: SUBTASK_INCLUDE
  })

  // Cascade completion to all descendants when marking complete
  if (data.completed === true) {
    const childIds = todo.children.map(c => c.id)
    if (childIds.length > 0) {
      await prisma.todo.updateMany({ where: { parentId: todo.id }, data: { completed: true } })
      const grandchildIds = todo.children.flatMap(c => c.children.map(gc => gc.id))
      if (grandchildIds.length > 0) {
        await prisma.todo.updateMany({ where: { id: { in: grandchildIds } }, data: { completed: true } })
      }
    }
  }

  // Re-fetch with updated children after cascade
  const updated = await prisma.todo.findUnique({
    where: { id: todo.id },
    include: SUBTASK_INCLUDE
  })

  res.json(updated)
})

// DELETE a todo (cascade to children handled by DB onDelete: Cascade)
app.delete('/todos/:id', async (req, res) => {
  await prisma.todo.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ success: true })
})

app.listen(3001, () => console.log('Server running on http://localhost:3001'))
