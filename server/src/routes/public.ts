import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { db, uploadsDir } from '../db.js';
import { id, now } from '../util.js';

// Public, UNAUTHENTICATED bug-intake form. Anyone with a board's share token can
// file a bug, which lands as a task in that board's first ("New") column.
const router = Router();

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB, matching the in-app attachment cap
const ALLOWED = /^(image\/|video\/)|^application\/pdf$/;
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, id() + path.extname(file.originalname).slice(0, 12)),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.test(file.mimetype)),
});

// --- tiny in-memory per-IP rate limiter (single-instance VM; fine for a pilot) ---
const RATE_MAX = 8; // submissions
const RATE_WINDOW = 10 * 60 * 1000; // per 10 minutes
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const t = Date.now();
  const recent = (hits.get(ip) || []).filter((ts) => t - ts < RATE_WINDOW);
  recent.push(t);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}

function activeIntake(token: string): { board_id: string } | null {
  const row = db.prepare('SELECT board_id FROM bug_intake WHERE token = ? AND enabled = 1').get(token) as any;
  return row || null;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Validate a share link and return the minimal info needed to render the form. */
router.get('/bug/:token', (req, res) => {
  const intake = activeIntake(req.params.token);
  if (!intake) return res.status(404).json({ error: 'This bug form is not available.' });
  const board = db.prepare('SELECT name FROM boards WHERE id = ?').get(intake.board_id) as any;
  res.json({ ok: true, board: { name: board?.name || 'Bug reports' } });
});

/** Accept a bug submission (fields + optional attachments) as one multipart POST. */
router.post('/bug/:token', upload.array('files', 10), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const cleanup = () => files.forEach((f) => fs.unlink(f.path, () => {}));

  const intake = activeIntake(req.params.token);
  if (!intake) {
    cleanup();
    return res.status(404).json({ error: 'This bug form is not available.' });
  }

  // Honeypot: real users never fill a hidden field. Pretend success, drop it.
  if (clean(req.body?.website, 100)) {
    cleanup();
    return res.json({ ok: true });
  }

  const ip = (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim();
  if (rateLimited(ip)) {
    cleanup();
    return res.status(429).json({ error: 'Too many submissions. Please try again in a few minutes.' });
  }

  const reporter = clean(req.body?.reporter, 120);
  if (!reporter) {
    cleanup();
    return res.status(400).json({ error: 'Your name is required.' });
  }
  const version = clean(req.body?.version, 80);
  const intended = clean(req.body?.intended, 5000);
  const actual = clean(req.body?.actual, 5000);
  const steps = clean(req.body?.steps, 5000);
  const notes = clean(req.body?.notes, 5000);

  const boardId = intake.board_id;
  const firstCat = db
    .prepare('SELECT id FROM categories WHERE board_id = ? ORDER BY position, id LIMIT 1')
    .get(boardId) as any;
  const categoryId = firstCat?.id || null;

  // Card title: version tag + the symptom (actual behavior), trimmed to one line.
  const symptom = (actual || intended || 'Bug report').split('\n')[0].slice(0, 80);
  const name = (version ? `[${version}] ` : '') + symptom;

  const description =
    `Reported by: ${reporter}\n` +
    `Affected version: ${version || '—'}\n\n` +
    `▸ Intended behavior\n${intended || '—'}\n\n` +
    `▸ Actual behavior\n${actual || '—'}\n\n` +
    `▸ Steps to reproduce\n${steps || '—'}\n\n` +
    `▸ Additional notes\n${notes || '—'}\n\n` +
    `— Submitted via the public bug form on ${now().slice(0, 10)}`;

  const tid = id();
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS p FROM tasks WHERE board_id = ?').get(boardId) as any).p;
  db.prepare(
    `INSERT INTO tasks (id, board_id, category_id, parent_task_id, name, description, position, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(tid, boardId, categoryId, null, name, description, maxPos, now());

  // Tag it "Bug" if the board already has such a tag, so it's easy to filter.
  const bugTag = db
    .prepare("SELECT id FROM tags WHERE board_id = ? AND LOWER(name) = 'bug' LIMIT 1")
    .get(boardId) as any;
  if (bugTag) db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(tid, bugTag.id);

  // Save the uploaded files as task attachments (uploaded_by NULL = anonymous).
  const ins = db.prepare(
    'INSERT INTO attachments (id, task_id, filename, original_name, mime, size, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  for (const f of files) ins.run(id(), tid, f.filename, f.originalname, f.mimetype, f.size, null, now());

  res.json({ ok: true });
});

export default router;
