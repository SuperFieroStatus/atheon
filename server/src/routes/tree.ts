import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { id, now } from '../util.js';
import { requireAuth } from '../auth.js';
import {
  visibleWorkspaceIds,
  visibleProjectIds,
  workspaceRole,
  projectRole,
  boardRole,
  canEdit,
  isOwner,
} from '../access.js';

const router = Router();
router.use(requireAuth);

const DEFAULT_CATEGORIES = [
  { name: 'Not Started', color: '#B3BAC5' },
  { name: 'In Progress', color: '#0079BF' },
  { name: 'Done', color: '#61BD4F' },
];

/** Full visible hierarchy for the sidebar. */
router.get('/tree', (req, res) => {
  const uid = req.user!.id;
  const wsIds = visibleWorkspaceIds(uid);
  // Per-user ordering: workspaces the user has explicitly arranged come first in
  // their saved order; anything not yet ordered falls to the end by age.
  const orderRows = db
    .prepare('SELECT workspace_id, position FROM workspace_order WHERE user_id = ?')
    .all(uid) as { workspace_id: string; position: number }[];
  const orderMap = new Map(orderRows.map((r) => [r.workspace_id, r.position]));
  const workspaces = wsIds
    .map((wid) => db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wid) as any)
    .filter(Boolean)
    .sort((a, b) => {
      const pa = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const pb = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.created_at.localeCompare(b.created_at);
    });

  const tree = workspaces.map((ws) => {
    const role = workspaceRole(uid, ws.id);
    const projIds = visibleProjectIds(uid, ws.id);
    const projects = projIds
      .map((pid) => db.prepare('SELECT * FROM projects WHERE id = ?').get(pid) as any)
      .filter(Boolean)
      .map((p) => {
        const boards = db
          .prepare('SELECT id, name, position FROM boards WHERE project_id = ? ORDER BY position, created_at')
          .all(p.id);
        return {
          id: p.id,
          name: p.name,
          workspace_id: p.workspace_id,
          role: projectRole(uid, p.id),
          boards,
        };
      });
    return {
      id: ws.id,
      name: ws.name,
      is_personal: !!ws.is_personal,
      role,
      isOwner: isOwner(role),
      projects,
    };
  });

  res.json({ workspaces: tree });
});

/* ----------------------------- Workspaces ----------------------------- */

router.post('/workspaces', (req, res) => {
  const name = String(req.body?.name || '').trim() || 'New Workspace';
  const uid = req.user!.id;
  const wid = id();
  db.prepare(
    'INSERT INTO workspaces (id, name, owner_id, is_personal, position, created_at) VALUES (?,?,?,?,?,?)'
  ).run(wid, name, uid, 0, Date.now() % 100000, now());
  res.json({ id: wid, name });
});

// Save this user's personal ordering of their visible workspaces.
// NOTE: defined before '/workspaces/:id' so 'order' isn't matched as an id.
router.patch('/workspaces/order', (req, res) => {
  const uid = req.user!.id;
  const order: string[] = Array.isArray(req.body?.order) ? req.body.order.map(String) : [];
  const visible = new Set(visibleWorkspaceIds(uid));
  db.prepare('DELETE FROM workspace_order WHERE user_id = ?').run(uid);
  const ins = db.prepare('INSERT INTO workspace_order (user_id, workspace_id, position) VALUES (?,?,?)');
  let pos = 0;
  for (const wid of order) if (visible.has(wid)) ins.run(uid, wid, pos++);
  res.json({ ok: true });
});

router.patch('/workspaces/:id', (req, res) => {
  const uid = req.user!.id;
  if (!isOwner(workspaceRole(uid, req.params.id)))
    return res.status(403).json({ error: 'Only the owner can rename this workspace.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

router.delete('/workspaces/:id', (req, res) => {
  const uid = req.user!.id;
  const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id) as any;
  if (!ws) return res.status(404).json({ error: 'Not found' });
  if (ws.owner_id !== uid) return res.status(403).json({ error: 'Only the owner can delete this workspace.' });
  if (ws.is_personal) return res.status(400).json({ error: 'Your Personal workspace cannot be deleted.' });
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ Projects ------------------------------ */

router.post('/projects', (req, res) => {
  const uid = req.user!.id;
  const workspaceId = String(req.body?.workspaceId || '');
  if (!isOwner(workspaceRole(uid, workspaceId)))
    return res.status(403).json({ error: 'You can only create projects in a workspace you own.' });
  const name = String(req.body?.name || '').trim() || 'New Project';
  const pid = id();
  const ts = now();
  db.prepare(
    'INSERT INTO projects (id, workspace_id, name, owner_id, position, created_at) VALUES (?,?,?,?,?,?)'
  ).run(pid, workspaceId, name, uid, Date.now() % 100000, ts);

  // A project starts with one board so the user lands somewhere useful.
  const bid = id();
  db.prepare('INSERT INTO boards (id, project_id, name, position, created_at) VALUES (?,?,?,?,?)').run(
    bid, pid, 'Main Board', 0, ts
  );
  seedCategories(bid);
  res.json({ id: pid, name, board: { id: bid, name: 'Main Board' } });
});

router.patch('/projects/:id', (req, res) => {
  const uid = req.user!.id;
  if (!isOwner(projectRole(uid, req.params.id)))
    return res.status(403).json({ error: 'Only the owner can rename this project.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

router.delete('/projects/:id', (req, res) => {
  const uid = req.user!.id;
  if (!isOwner(projectRole(uid, req.params.id)))
    return res.status(403).json({ error: 'Only the owner can delete this project.' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------- Boards ------------------------------- */

function seedCategories(boardId: string) {
  DEFAULT_CATEGORIES.forEach((c, i) => {
    db.prepare('INSERT INTO categories (id, board_id, name, color, position) VALUES (?,?,?,?,?)').run(
      id(), boardId, c.name, c.color, i
    );
  });
}

router.post('/boards', (req, res) => {
  const uid = req.user!.id;
  const projectId = String(req.body?.projectId || '');
  if (!isOwner(projectRole(uid, projectId)))
    return res.status(403).json({ error: 'You can only add boards to a project you own.' });
  const name = String(req.body?.name || '').trim() || 'New Board';
  const bid = id();
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM boards WHERE project_id = ?').get(projectId) as any).p;
  db.prepare('INSERT INTO boards (id, project_id, name, position, created_at) VALUES (?,?,?,?,?)').run(
    bid, projectId, name, maxPos, now()
  );
  seedCategories(bid);
  res.json({ id: bid, name });
});

router.patch('/boards/:id', (req, res) => {
  const uid = req.user!.id;
  if (!isOwner(boardRole(uid, req.params.id)))
    return res.status(403).json({ error: 'Only the owner can rename this board.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE boards SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

router.delete('/boards/:id', (req, res) => {
  const uid = req.user!.id;
  if (!isOwner(boardRole(uid, req.params.id)))
    return res.status(403).json({ error: 'Only the owner can delete this board.' });
  db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ----------------------------- Categories ----------------------------- */

router.post('/categories', (req, res) => {
  const uid = req.user!.id;
  const boardId = String(req.body?.boardId || '');
  if (!canEdit(boardRole(uid, boardId)))
    return res.status(403).json({ error: 'You do not have permission to edit this board.' });
  const name = String(req.body?.name || '').trim() || 'New Category';
  const cid = id();
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM categories WHERE board_id = ?').get(boardId) as any).p;
  const color = String(req.body?.color || '#B3BAC5');
  db.prepare('INSERT INTO categories (id, board_id, name, color, position) VALUES (?,?,?,?,?)').run(
    cid, boardId, name, color, maxPos
  );
  res.json({ id: cid, name, color, position: maxPos });
});

router.patch('/categories/:id', (req, res) => {
  const uid = req.user!.id;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as any;
  if (!cat) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(boardRole(uid, cat.board_id)))
    return res.status(403).json({ error: 'No permission' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : cat.name;
  const color = req.body?.color !== undefined ? String(req.body.color) : cat.color;
  db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(name, color, req.params.id);
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  const uid = req.user!.id;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as any;
  if (!cat) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(boardRole(uid, cat.board_id)))
    return res.status(403).json({ error: 'No permission' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
