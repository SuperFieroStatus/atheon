import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { db, uploadsDir } from '../db.js';
import { id, now } from '../util.js';
import { requireAuth } from '../auth.js';
import { taskProjectRole, canEdit, canView } from '../access.js';

const router = Router();
router.use(requireAuth);

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, id() + path.extname(file.originalname).slice(0, 12)),
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE } });

function serialize(a: any) {
  return {
    id: a.id,
    task_id: a.task_id,
    original_name: a.original_name,
    mime: a.mime,
    size: a.size,
    created_at: a.created_at,
    url: `/api/attachments/${a.id}`,
  };
}

/** List a task's attachments. */
router.get('/tasks/:id/attachments', (req, res) => {
  const uid = req.user!.id;
  if (!canView(taskProjectRole(uid, req.params.id))) return res.status(403).json({ error: 'No access' });
  const rows = db
    .prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at')
    .all(req.params.id) as any[];
  res.json({ attachments: rows.map(serialize) });
});

/** Upload one or more files to a task. */
router.post('/tasks/:id/attachments', upload.array('files', 10), (req, res) => {
  const uid = req.user!.id;
  const files = (req.files as Express.Multer.File[]) || [];
  if (!canEdit(taskProjectRole(uid, req.params.id))) {
    files.forEach((f) => fs.unlink(f.path, () => {})); // don't keep files for a rejected request
    return res.status(403).json({ error: 'No permission' });
  }
  if (!db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id)) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Task not found' });
  }
  const created: any[] = [];
  const ins = db.prepare(
    'INSERT INTO attachments (id, task_id, filename, original_name, mime, size, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  for (const f of files) {
    const aid = id();
    ins.run(aid, req.params.id, f.filename, f.originalname, f.mimetype, f.size, uid, now());
    created.push(db.prepare('SELECT * FROM attachments WHERE id = ?').get(aid));
  }
  res.json({ attachments: created.map(serialize) });
});

/** Serve an attachment's file (inline — used by <img>/<video> and downloads). */
router.get('/attachments/:id', (req, res) => {
  const uid = req.user!.id;
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id) as any;
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (!canView(taskProjectRole(uid, a.task_id))) return res.status(403).json({ error: 'No access' });
  const filePath = path.join(uploadsDir, a.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', a.mime || 'application/octet-stream');
  const disposition = req.query.dl ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(a.original_name)}"`);
  res.sendFile(filePath);
});

/** Delete an attachment (file + row). */
router.delete('/attachments/:id', (req, res) => {
  const uid = req.user!.id;
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id) as any;
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(taskProjectRole(uid, a.task_id))) return res.status(403).json({ error: 'No permission' });
  fs.unlink(path.join(uploadsDir, a.filename), () => {});
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
