import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { id, now, randomColor, darkenForWhiteText } from '../util.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  clearToken,
  getUserFromReq,
  requireAuth,
} from '../auth.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

router.post('/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  const { email, password, firstName, lastName } = parsed.data;
  const normEmail = email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  const userId = id();
  const ts = now();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, first_name, last_name, color, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(userId, normEmail, hashPassword(password), firstName.trim(), lastName.trim(), randomColor(normEmail), ts);

  // Every new user gets a Personal workspace with no projects.
  db.prepare(
    'INSERT INTO workspaces (id, name, owner_id, is_personal, position, created_at) VALUES (?,?,?,?,?,?)'
  ).run(id(), 'Personal', userId, 1, 0, ts);

  issueToken(res, userId);
  const user = db
    .prepare('SELECT id, email, first_name, last_name, color, timezone FROM users WHERE id = ?')
    .get(userId);
  res.json({ user });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const normEmail = parsed.data.email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normEmail) as any;
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  issueToken(res, row.id);
  res.json({
    user: { id: row.id, email: row.email, first_name: row.first_name, last_name: row.last_name, color: row.color, timezone: row.timezone },
  });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

/* -------------------------- User settings -------------------------- */

const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color').optional(),
  timezone: z.string().max(64).optional().nullable(),
});

// Update name, email, avatar color, and timezone.
// Email is the login identifier, so it must stay unique.
router.patch('/profile', requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please enter a valid name and email.' });
  const { firstName, lastName, email, color, timezone } = parsed.data;
  const normEmail = email.trim().toLowerCase();
  const uid = req.user!.id;

  const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normEmail, uid);
  if (taken) return res.status(409).json({ error: 'That email is already used by another account.' });

  const current = db.prepare('SELECT color, timezone FROM users WHERE id = ?').get(uid) as any;
  // Avatars use white initials, so keep the chosen colour dark enough to read.
  const nextColor = color ? darkenForWhiteText(color) : current.color;
  const nextTz = timezone === undefined ? current.timezone : (timezone || null);

  db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ?, color = ?, timezone = ? WHERE id = ?').run(
    firstName.trim(), lastName.trim(), normEmail, nextColor, nextTz, uid
  );
  const user = db
    .prepare('SELECT id, email, first_name, last_name, color, timezone FROM users WHERE id = ?')
    .get(uid);
  res.json({ user });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

// Change password. Requires the current password to confirm identity.
router.patch('/password', requireAuth, (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const uid = req.user!.id;
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(uid) as any;
  if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(parsed.data.newPassword), uid);
  res.json({ ok: true });
});

export default router;
