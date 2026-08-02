import { useMemo, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';
import { Avatar } from './Avatar';

interface Props {
  user: User;
  onUpdated: (u: User) => void;
  onClose: () => void;
}

// Matches the server's avatar palette (server/src/util.ts) — all dark enough
// for the white initials to stay readable.
const AVATAR_COLORS = [
  '#5B4FC4', '#1E7A5A', '#2065B0', '#C0562F', '#B83C6E',
  '#12798A', '#9A6A1E', '#B23A3A', '#4A5568', '#7A4FB0',
];

const FALLBACK_ZONES = [
  'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
];

function detectedZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function UserSettings({ user, onUpdated, onClose }: Props) {
  const detected = detectedZone();
  const zones = useMemo<string[]>(() => {
    const anyIntl = Intl as any;
    let list: string[] = [];
    if (typeof anyIntl.supportedValuesOf === 'function') {
      try { list = anyIntl.supportedValuesOf('timeZone'); } catch { list = []; }
    }
    if (!list.length) list = FALLBACK_ZONES;
    if (!list.includes(detected)) list = [detected, ...list];
    return list;
  }, [detected]);

  // profile
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [email, setEmail] = useState(user.email);
  const [color, setColor] = useState(user.color);
  const initialTz = user.timezone || detected;
  const [timezone, setTimezone] = useState(initialTz);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const profileDirty =
    firstName !== user.first_name ||
    lastName !== user.last_name ||
    email !== user.email ||
    color !== user.color ||
    timezone !== initialTz;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const { user: updated } = await api.patch('/auth/profile', { firstName, lastName, email, color, timezone });
      onUpdated(updated);
      setProfileMsg({ ok: true, text: 'Profile updated.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ ok: false, text: 'New password must be at least 6 characters.' });
      return;
    }
    setSavingPw(true);
    try {
      await api.patch('/auth/password', { currentPassword, newPassword });
      setPwMsg({ ok: true, text: 'Password changed.' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.message });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal narrow" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="hstack" style={{ gap: 12 }}>
            <Avatar first={firstName} last={lastName} color={color} size="lg" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>User Settings</div>
              <div className="muted" style={{ fontSize: 13 }}>{user.email}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '4px 18px 20px' }}>
          {/* Profile */}
          <form onSubmit={saveProfile}>
            <div className="settings-section">Profile</div>
            <div className="auth-row">
              <div className="field">
                <label className="field-label">First name</label>
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label">Last name</label>
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Email <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>— this is your login</span></label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="field">
              <label className="field-label">Avatar color</label>
              <div className="swatch-row">
                {AVATAR_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={'swatch' + (color.toLowerCase() === c.toLowerCase() ? ' selected' : '')}
                    style={{ background: c }}
                    title={c}
                    onClick={() => setColor(c)}
                  />
                ))}
                <label className="swatch-custom" title="Custom color" style={{ background: color }}>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                  />
                </label>
              </div>
            </div>

            <div className="field">
              <label className="field-label">Timezone</label>
              <select className="meta-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Detected: {detected.replace(/_/g, ' ')}</div>
            </div>

            {profileMsg && <div className={profileMsg.ok ? 'settings-ok' : 'auth-err'}>{profileMsg.text}</div>}
            <button className="btn" disabled={!profileDirty || savingProfile}>
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </form>

          <div className="menu-sep" style={{ margin: '20px 0' }} />

          {/* Password */}
          <form onSubmit={savePassword}>
            <div className="settings-section">Change password</div>
            <div className="field">
              <label className="field-label">Current password</label>
              <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="auth-row">
              <div className="field">
                <label className="field-label">New password</label>
                <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" required />
              </div>
              <div className="field">
                <label className="field-label">Confirm new</label>
                <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
            </div>
            {pwMsg && <div className={pwMsg.ok ? 'settings-ok' : 'auth-err'}>{pwMsg.text}</div>}
            <button className="btn subtle" disabled={savingPw || !currentPassword || !newPassword}>
              {savingPw ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
