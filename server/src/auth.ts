import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'atheon-dev-secret-change-me';
const COOKIE = 'atheon_token';

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  color: string;
  timezone: string | null;
}

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw: string, hash: string): boolean {
  return bcrypt.compareSync(pw, hash);
}

const isProd = process.env.NODE_ENV === 'production';

export function issueToken(res: Response, userId: string) {
  const token = jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd, // require HTTPS in production
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearToken(res: Response) {
  res.clearCookie(COOKIE);
}

export function getUserFromReq(req: Request): AuthUser | null {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string };
    const user = db
      .prepare('SELECT id, email, first_name, last_name, color, timezone FROM users WHERE id = ?')
      .get(payload.uid) as AuthUser | undefined;
    return user ?? null;
  } catch {
    return null;
  }
}

// Express augmentation
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}
