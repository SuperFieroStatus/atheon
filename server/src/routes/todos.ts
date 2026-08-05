import { Router } from 'express';
import { db } from '../db.js';
import { id, now } from '../util.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

/** Personal to-do list. Checked-off items are hidden on the next load. */
router.get('/todos', (req, res) => {
  const uid = req.user!.id;
  const todos = db
    .prepare('SELECT * FROM todos WHERE user_id = ? AND completed = 0 ORDER BY position, created_at')
    .all(uid)
    .map((t: any) => ({ ...t, completed: !!t.completed }));
  res.json({ todos });
});

router.post('/todos', (req, res) => {
  const uid = req.user!.id;
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const dueDate = req.body?.dueDate ? String(req.body.dueDate) : null;
  const tid = id();
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM todos WHERE user_id = ?').get(uid) as any).p;
  db.prepare('INSERT INTO todos (id, user_id, name, due_date, completed, position, created_at) VALUES (?,?,?,?,0,?,?)').run(
    tid, uid, name, dueDate, maxPos, now()
  );
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(tid) as any;
  res.json({ todo: { ...todo, completed: !!todo.completed } });
});

// Persist a new ordering. Defined before '/todos/:id' so 'reorder' isn't matched as an id.
router.patch('/todos/reorder', (req, res) => {
  const uid = req.user!.id;
  const order: string[] = Array.isArray(req.body?.order) ? req.body.order.map(String) : [];
  const upd = db.prepare('UPDATE todos SET position = ? WHERE id = ? AND user_id = ?');
  let pos = 0;
  for (const tid of order) upd.run(pos++, tid, uid);
  res.json({ ok: true });
});

router.patch('/todos/:id', (req, res) => {
  const uid = req.user!.id;
  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, uid) as any;
  if (!todo) return res.status(404).json({ error: 'Not found' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : todo.name;
  const dueDate = req.body?.dueDate !== undefined ? (req.body.dueDate || null) : todo.due_date;
  const completed = req.body?.completed !== undefined ? (req.body.completed ? 1 : 0) : todo.completed;
  db.prepare('UPDATE todos SET name = ?, due_date = ?, completed = ? WHERE id = ?').run(
    name, dueDate, completed, req.params.id
  );
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id) as any;
  res.json({ todo: { ...updated, completed: !!updated.completed } });
});

router.delete('/todos/:id', (req, res) => {
  const uid = req.user!.id;
  db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  res.json({ ok: true });
});

export default router;
