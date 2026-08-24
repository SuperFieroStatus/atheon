import { Router } from 'express';
import { db } from '../db.js';
import { id, now } from '../util.js';
import { requireAuth } from '../auth.js';
import { boardRole, canEdit } from '../access.js';

const router = Router();
router.use(requireAuth);

function stateFor(boardId: string) {
  const row = db.prepare('SELECT token, enabled FROM bug_intake WHERE board_id = ?').get(boardId) as any;
  if (!row) return { enabled: false, token: null as string | null };
  return { enabled: !!row.enabled, token: row.token as string };
}

/** Current bug-form state for a board (editors only). */
router.get('/boards/:id/bug-intake', (req, res) => {
  const uid = req.user!.id;
  if (!canEdit(boardRole(uid, req.params.id))) return res.status(403).json({ error: 'No permission' });
  res.json(stateFor(req.params.id));
});

/** Enable or disable the public bug form for a board. A token is minted on the
 *  first enable and kept afterwards, so the shareable link stays stable. */
router.put('/boards/:id/bug-intake', (req, res) => {
  const uid = req.user!.id;
  const boardId = req.params.id;
  if (!canEdit(boardRole(uid, boardId))) return res.status(403).json({ error: 'No permission' });
  if (!db.prepare('SELECT id FROM boards WHERE id = ?').get(boardId)) return res.status(404).json({ error: 'Board not found' });

  const enabled = req.body?.enabled ? 1 : 0;
  const existing = db.prepare('SELECT token FROM bug_intake WHERE board_id = ?').get(boardId) as any;
  if (existing) {
    db.prepare('UPDATE bug_intake SET enabled = ? WHERE board_id = ?').run(enabled, boardId);
  } else {
    db.prepare('INSERT INTO bug_intake (board_id, token, enabled, created_at) VALUES (?,?,?,?)')
      .run(boardId, id(), enabled, now());
  }
  res.json(stateFor(boardId));
});

export default router;
