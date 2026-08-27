import { Router } from 'express';
import { db } from '../db.js';
import { id, now, TAG_COLORS, darkenForWhiteText } from '../util.js';
import { requireAuth } from '../auth.js';
import { boardRole, taskProjectRole, canEdit, canView } from '../access.js';

const router = Router();
router.use(requireAuth);

function tagsForTask(taskId: string) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN task_tags tt ON tt.tag_id = t.id WHERE tt.task_id = ? ORDER BY t.name`
    )
    .all(taskId);
}

function assigneesForTask(taskId: string): string[] {
  return (db
    .prepare('SELECT user_id FROM task_assignees WHERE task_id = ?')
    .all(taskId) as { user_id: string }[]).map((r) => r.user_id);
}

function serializeTask(t: any) {
  const { assignee_id, ...rest } = t; // legacy single column no longer surfaced
  const attachment_count = (db.prepare('SELECT COUNT(*) AS c FROM attachments WHERE task_id = ?').get(t.id) as any).c;
  return { ...rest, completed: !!t.completed, tags: tagsForTask(t.id), assignee_ids: assigneesForTask(t.id), attachment_count };
}

/** Every user with any access to the project this board belongs to (assignee pool). */
function projectMembers(boardId: string): any[] {
  const board = db.prepare('SELECT project_id FROM boards WHERE id = ?').get(boardId) as any;
  if (!board) return [];
  const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(board.project_id) as any;
  if (!proj) return [];
  const userIds = new Set<string>();
  userIds.add(proj.owner_id);

  const ws = db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(proj.workspace_id) as any;
  if (ws) userIds.add(ws.owner_id);

  // direct memberships on the workspace or project
  for (const m of db
    .prepare(
      `SELECT user_id FROM memberships
       WHERE (resource_type='project' AND resource_id=?) OR (resource_type='workspace' AND resource_id=?)`
    )
    .all(proj.id, proj.workspace_id) as any[])
    userIds.add(m.user_id);

  // group assignments -> group members
  const groupRows = db
    .prepare(
      `SELECT group_id FROM group_assignments
       WHERE (resource_type='project' AND resource_id=?) OR (resource_type='workspace' AND resource_id=?)`
    )
    .all(proj.id, proj.workspace_id) as any[];
  for (const g of groupRows) {
    for (const gm of db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(g.group_id) as any[])
      userIds.add(gm.user_id);
  }

  return [...userIds]
    .map((u) => db.prepare('SELECT id, first_name, last_name, email, color FROM users WHERE id = ?').get(u))
    .filter(Boolean);
}

/** Full data payload to render a board. */
router.get('/boards/:id/data', (req, res) => {
  const uid = req.user!.id;
  const boardId = req.params.id;
  const role = boardRole(uid, boardId);
  if (!canView(role)) return res.status(403).json({ error: 'No access to this board.' });

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as any;
  if (!board) return res.status(404).json({ error: 'Not found' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(board.project_id) as any;
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(project.workspace_id) as any;

  const categories = db
    .prepare('SELECT * FROM categories WHERE board_id = ? ORDER BY position, id')
    .all(boardId);
  const tasksRaw = db
    .prepare('SELECT * FROM tasks WHERE board_id = ? ORDER BY position, created_at')
    .all(boardId) as any[];
  const tasks = tasksRaw.map(serializeTask);
  const tags = db.prepare('SELECT * FROM tags WHERE board_id = ? ORDER BY name').all(boardId);
  const members = projectMembers(boardId);

  res.json({
    board: { id: board.id, name: board.name, project_id: board.project_id },
    project: { id: project.id, name: project.name },
    workspace: { id: workspace.id, name: workspace.name },
    role,
    canEdit: canEdit(role),
    categories,
    tasks,
    tags,
    members,
  });
});

/* -------------------------------- Tasks -------------------------------- */

router.post('/tasks', (req, res) => {
  const uid = req.user!.id;
  const boardId = String(req.body?.boardId || '');
  if (!canEdit(boardRole(uid, boardId)))
    return res.status(403).json({ error: 'You do not have permission to add tasks here.' });

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Task name required' });
  const categoryId = req.body?.categoryId ? String(req.body.categoryId) : null;
  const parentTaskId = req.body?.parentTaskId ? String(req.body.parentTaskId) : null;

  const tid = id();
  const maxPos = (
    db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM tasks WHERE board_id = ?').get(boardId) as any
  ).p;
  db.prepare(
    `INSERT INTO tasks (id, board_id, category_id, parent_task_id, name, position, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(tid, boardId, categoryId, parentTaskId, name, maxPos, now());

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tid) as any;
  res.json({ task: serializeTask(task) });
});

// assignees are managed via dedicated endpoints (a task can have several)
const EDITABLE_FIELDS = new Set([
  'name', 'description', 'due_date', 'priority',
  'dependency_id', 'completed', 'category_id', 'position', 'estimated_hours',
]);

router.patch('/tasks/:id', (req, res) => {
  const uid = req.user!.id;
  const role = taskProjectRole(uid, req.params.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'No permission' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!task) return res.status(404).json({ error: 'Not found' });

  const updates: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    if (k === 'completed') {
      updates.push('completed = ?');
      values.push(v ? 1 : 0);
    } else {
      updates.push(`${k} = ?`);
      values.push(v === '' ? null : v);
    }
  }
  if (!updates.length) return res.json({ task: serializeTask(task) });
  values.push(req.params.id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  res.json({ task: serializeTask(updated) });
});

router.delete('/tasks/:id', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(taskProjectRole(uid, req.params.id)))
    return res.status(403).json({ error: 'No permission' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* --------------------------------- Tags -------------------------------- */

router.post('/tags', (req, res) => {
  const uid = req.user!.id;
  const boardId = String(req.body?.boardId || '');
  if (!canEdit(boardRole(uid, boardId))) return res.status(403).json({ error: 'No permission' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Tag name required' });
  const count = (db.prepare('SELECT COUNT(*) AS c FROM tags WHERE board_id = ?').get(boardId) as any).c;
  const color = darkenForWhiteText(String(req.body?.color || TAG_COLORS[count % TAG_COLORS.length]));
  const tid = id();
  db.prepare('INSERT INTO tags (id, board_id, name, color) VALUES (?,?,?,?)').run(tid, boardId, name, color);
  res.json({ tag: { id: tid, board_id: boardId, name, color } });
});

router.patch('/tags/:id', (req, res) => {
  const uid = req.user!.id;
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id) as any;
  if (!tag) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(boardRole(uid, tag.board_id))) return res.status(403).json({ error: 'No permission' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : tag.name;
  const color = req.body?.color !== undefined ? darkenForWhiteText(String(req.body.color)) : tag.color;
  db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, req.params.id);
  res.json({ ok: true });
});

router.delete('/tags/:id', (req, res) => {
  const uid = req.user!.id;
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id) as any;
  if (!tag) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(boardRole(uid, tag.board_id))) return res.status(403).json({ error: 'No permission' });
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/tasks/:id/tags/:tagId', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No permission' });
  db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(req.params.id, req.params.tagId);
  res.json({ tags: tagsForTask(req.params.id) });
});

router.delete('/tasks/:id/tags/:tagId', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No permission' });
  db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(req.params.id, req.params.tagId);
  res.json({ tags: tagsForTask(req.params.id) });
});

/* ------------------------------ Assignees ------------------------------ */

function serializedTask(taskId: string) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  return t ? serializeTask(t) : null;
}

router.post('/tasks/:id/assignees/:userId', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No permission' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId))
    return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?,?)').run(
    req.params.id, req.params.userId
  );
  res.json({ task: serializedTask(req.params.id) });
});

router.delete('/tasks/:id/assignees/:userId', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No permission' });
  db.prepare('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?').run(
    req.params.id, req.params.userId
  );
  res.json({ task: serializedTask(req.params.id) });
});

/* ------------------------------- Comments ------------------------------ */

router.get('/tasks/:id/comments', (req, res) => {
  const uid = req.user!.id;
  if (!canView(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No access' });
  const comments = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.first_name, u.last_name, u.color
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.task_id = ? ORDER BY c.created_at`
    )
    .all(req.params.id);
  res.json({ comments });
});

router.post('/tasks/:id/comments', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No permission' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty' });
  const cid = id();
  db.prepare('INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)').run(
    cid, req.params.id, uid, body, now()
  );
  const comment = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.first_name, u.last_name, u.color
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    )
    .get(cid);
  res.json({ comment });
});

export default router;
