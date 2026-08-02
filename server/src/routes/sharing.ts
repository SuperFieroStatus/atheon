import { Router } from 'express';
import { db } from '../db.js';
import { id, now } from '../util.js';
import { requireAuth } from '../auth.js';
import { workspaceRole, projectRole, isOwner } from '../access.js';

const router = Router();
router.use(requireAuth);

function ownsResource(uid: string, type: string, resourceId: string): boolean {
  if (type === 'workspace') return isOwner(workspaceRole(uid, resourceId));
  if (type === 'project') return isOwner(projectRole(uid, resourceId));
  return false;
}

/** Search users by name/email to add them to something (excludes self). */
router.get('/users/search', (req, res) => {
  const uid = req.user!.id;
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });
  const like = `%${q}%`;
  const users = db
    .prepare(
      `SELECT id, first_name, last_name, email, color FROM users
       WHERE id != ? AND (LOWER(email) LIKE ? OR LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)
       LIMIT 10`
    )
    .all(uid, like, like, like);
  res.json({ users });
});

/** Who has access to a workspace/project (direct members + groups). */
router.get('/:type(workspace|project)/:id/members', (req, res) => {
  const uid = req.user!.id;
  const { type, id: resourceId } = req.params;
  if (type !== 'workspace' && type !== 'project') return res.status(400).json({ error: 'Bad type' });
  const role = type === 'workspace' ? workspaceRole(uid, resourceId) : projectRole(uid, resourceId);
  if (!role) return res.status(403).json({ error: 'No access' });

  const members = db
    .prepare(
      `SELECT m.id AS membership_id, m.role, u.id, u.first_name, u.last_name, u.email, u.color
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.resource_type = ? AND m.resource_id = ?`
    )
    .all(type, resourceId);

  const groups = db
    .prepare(
      `SELECT ga.id AS assignment_id, ga.role, g.id AS group_id, g.name
       FROM group_assignments ga JOIN groups g ON g.id = ga.group_id
       WHERE ga.resource_type = ? AND ga.resource_id = ?`
    )
    .all(type, resourceId);

  // owner info
  const ownerRow =
    type === 'workspace'
      ? (db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(resourceId) as any)
      : (db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(resourceId) as any);
  const owner = ownerRow
    ? db.prepare('SELECT id, first_name, last_name, email, color FROM users WHERE id = ?').get(ownerRow.owner_id)
    : null;

  res.json({ owner, members, groups, canManage: isOwner(role) });
});

/** Add a user to a workspace/project as view|collaborate. */
router.post('/:type(workspace|project)/:id/members', (req, res) => {
  const uid = req.user!.id;
  const { type, id: resourceId } = req.params;
  if (type !== 'workspace' && type !== 'project') return res.status(400).json({ error: 'Bad type' });
  if (!ownsResource(uid, type, resourceId))
    return res.status(403).json({ error: 'Only the owner can share this.' });
  const userId = String(req.body?.userId || '');
  const role = req.body?.role === 'collaborate' ? 'collaborate' : 'view';
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId))
    return res.status(404).json({ error: 'User not found' });
  db.prepare(
    `INSERT INTO memberships (id, user_id, resource_type, resource_id, role) VALUES (?,?,?,?,?)
     ON CONFLICT(user_id, resource_type, resource_id) DO UPDATE SET role = excluded.role`
  ).run(id(), userId, type, resourceId, role);
  res.json({ ok: true });
});

router.delete('/:type(workspace|project)/:id/members/:userId', (req, res) => {
  const uid = req.user!.id;
  const { type, id: resourceId, userId } = req.params;
  if (!ownsResource(uid, type, resourceId))
    return res.status(403).json({ error: 'Only the owner can manage sharing.' });
  db.prepare('DELETE FROM memberships WHERE user_id = ? AND resource_type = ? AND resource_id = ?').run(
    userId, type, resourceId
  );
  res.json({ ok: true });
});

/** Assign / unassign a group to a workspace/project. */
router.post('/:type(workspace|project)/:id/groups', (req, res) => {
  const uid = req.user!.id;
  const { type, id: resourceId } = req.params;
  if (!ownsResource(uid, type, resourceId))
    return res.status(403).json({ error: 'Only the owner can share this.' });
  const groupId = String(req.body?.groupId || '');
  const role = req.body?.role === 'collaborate' ? 'collaborate' : 'view';
  const grp = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(groupId, uid);
  if (!grp) return res.status(404).json({ error: 'Group not found' });
  db.prepare(
    `INSERT INTO group_assignments (id, group_id, resource_type, resource_id, role) VALUES (?,?,?,?,?)
     ON CONFLICT(group_id, resource_type, resource_id) DO UPDATE SET role = excluded.role`
  ).run(id(), groupId, type, resourceId, role);
  res.json({ ok: true });
});

router.delete('/:type(workspace|project)/:id/groups/:groupId', (req, res) => {
  const uid = req.user!.id;
  const { type, id: resourceId, groupId } = req.params;
  if (!ownsResource(uid, type, resourceId))
    return res.status(403).json({ error: 'Only the owner can manage sharing.' });
  db.prepare('DELETE FROM group_assignments WHERE group_id = ? AND resource_type = ? AND resource_id = ?').run(
    groupId, type, resourceId
  );
  res.json({ ok: true });
});

/* -------------------------------- Groups ------------------------------- */

function groupMembers(groupId: string) {
  return db
    .prepare(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.color FROM group_members gm
       JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY u.first_name`
    )
    .all(groupId);
}

// Groups the current user owns (and can edit).
router.get('/groups', (req, res) => {
  const uid = req.user!.id;
  const groups = db.prepare('SELECT * FROM groups WHERE owner_id = ? ORDER BY name').all(uid) as any[];
  const withMembers = groups.map((g) => ({ ...g, members: groupMembers(g.id) }));
  res.json({ groups: withMembers });
});

// Groups the current user belongs to but did NOT create (read-only to them).
router.get('/groups/joined', (req, res) => {
  const uid = req.user!.id;
  const groups = db
    .prepare(
      `SELECT g.* FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ? AND g.owner_id != ?
       ORDER BY g.name`
    )
    .all(uid, uid) as any[];
  const withInfo = groups.map((g) => ({
    ...g,
    owner: db
      .prepare('SELECT id, first_name, last_name, email, color FROM users WHERE id = ?')
      .get(g.owner_id),
    members: groupMembers(g.id),
  }));
  res.json({ groups: withInfo });
});

router.post('/groups', (req, res) => {
  const uid = req.user!.id;
  const name = String(req.body?.name || '').trim() || 'New Group';
  const gid = id();
  db.prepare('INSERT INTO groups (id, name, owner_id, created_at) VALUES (?,?,?,?)').run(gid, name, uid, now());
  res.json({ group: { id: gid, name, owner_id: uid, members: [] } });
});

router.patch('/groups/:id', (req, res) => {
  const uid = req.user!.id;
  const grp = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, uid);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  const name = String(req.body?.name || '').trim();
  if (name) db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

router.delete('/groups/:id', (req, res) => {
  const uid = req.user!.id;
  db.prepare('DELETE FROM groups WHERE id = ? AND owner_id = ?').run(req.params.id, uid);
  res.json({ ok: true });
});

router.post('/groups/:id/members', (req, res) => {
  const uid = req.user!.id;
  const grp = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, uid);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  const userId = String(req.body?.userId || '');
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId))
    return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?,?)').run(req.params.id, userId);
  res.json({ ok: true });
});

router.delete('/groups/:id/members/:userId', (req, res) => {
  const uid = req.user!.id;
  const grp = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?').get(req.params.id, uid);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ ok: true });
});

export default router;
