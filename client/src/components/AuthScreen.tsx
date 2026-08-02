import { useState } from 'react';
import { api } from '../api';
import { LogoMark } from './Logo';
import type { User } from '../types';

export function AuthScreen({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { user } = await api.post('/auth/signup', { email, password, firstName, lastName });
        onAuthed(user);
      } else {
        const { user } = await api.post('/auth/login', { email, password });
        onAuthed(user);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <LogoMark size={52} />
        </div>
        <div style={{ textAlign: 'center', fontWeight: 800, letterSpacing: 4, fontSize: 22, marginBottom: 2 }}>
          ATHEON
        </div>
        <div className="auth-sub">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </div>

        {err && <div className="auth-err">{err}</div>}

        {mode === 'signup' && (
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
        )}

        <div className="field">
          <label className="field-label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
            required
          />
        </div>

        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Log in'}
        </button>

        <div className="auth-switch">
          {mode === 'signup' ? (
            <>Already have an account? <button type="button" onClick={() => { setMode('login'); setErr(''); }}>Log in</button></>
          ) : (
            <>New to Atheon? <button type="button" onClick={() => { setMode('signup'); setErr(''); }}>Sign up</button></>
          )}
        </div>
      </form>
    </div>
  );
}
