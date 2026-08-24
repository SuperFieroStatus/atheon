import { useEffect, useRef, useState } from 'react';

// Standalone public page (no login, no app chrome) reached at /report/<token>.
// Submits a bug straight into the linked board as a task.

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const MAX_SIZE = 50 * 1024 * 1024;

export function BugReportForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading');
  const [boardName, setBoardName] = useState('');
  const [reporter, setReporter] = useState('');
  const [version, setVersion] = useState('');
  const [intended, setIntended] = useState('');
  const [actual, setActual] = useState('');
  const [steps, setSteps] = useState('');
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — stays empty for humans
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/public/bug/${token}`)
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (ok && b.ok) { setBoardName(b.board?.name || 'Bug reports'); setPhase('ready'); }
        else setPhase('invalid');
      })
      .catch(() => setPhase('invalid'));
  }, [token]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_SIZE);
    if (tooBig) { setError(`"${tooBig.name}" is over 50 MB.`); return; }
    setError('');
    setFiles((prev) => [...prev, ...picked].slice(0, 10));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reporter.trim()) { setError('Please enter your name.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('reporter', reporter);
      form.append('version', version);
      form.append('intended', intended);
      form.append('actual', actual);
      form.append('steps', steps);
      form.append('notes', notes);
      form.append('website', website);
      files.forEach((f) => form.append('files', f));
      const res = await fetch(`/api/public/bug/${token}`, { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) setPhase('done');
      else setError(body.error || 'Something went wrong. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setReporter(''); setVersion(''); setIntended(''); setActual(''); setSteps(''); setNotes('');
    setFiles([]); setError(''); setPhase('ready');
  }

  if (phase === 'loading') {
    return <div className="bugform-page"><div className="spin" /></div>;
  }

  if (phase === 'invalid') {
    return (
      <div className="bugform-page">
        <div className="bugform-card bugform-msg">
          <div className="bugform-logo">ATHEON</div>
          <h2>This bug form isn’t available</h2>
          <p className="muted">The link may be turned off or incorrect. Please ask whoever shared it for an up-to-date link.</p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="bugform-page">
        <div className="bugform-card bugform-msg">
          <div className="bugform-logo">ATHEON</div>
          <div className="bugform-check">✓</div>
          <h2>Thanks — your report was submitted</h2>
          <p className="muted">The team can now see it on <b>{boardName}</b>. We appreciate the help.</p>
          <button className="btn primary" onClick={reset}>Submit another bug</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bugform-page">
      <form className="bugform-card" onSubmit={submit}>
        <div className="bugform-logo">ATHEON</div>
        <h1 className="bugform-title">Report a bug</h1>
        <p className="muted bugform-sub">Filing to <b>{boardName}</b>. Fields other than your name are optional, but more detail helps us fix it faster.</p>

        <label className="bugform-field">
          <span>Your name <b className="req">*</b></span>
          <input className="input" value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder="Who's reporting this?" required maxLength={120} />
        </label>

        <label className="bugform-field">
          <span>Affected version</span>
          <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. build 0.4.2" maxLength={80} />
        </label>

        <label className="bugform-field">
          <span>Intended behavior</span>
          <textarea className="input" rows={2} value={intended} onChange={(e) => setIntended(e.target.value)} placeholder="What should have happened?" maxLength={5000} />
        </label>

        <label className="bugform-field">
          <span>Actual behavior</span>
          <textarea className="input" rows={2} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="What actually happened?" maxLength={5000} />
        </label>

        <label className="bugform-field">
          <span>Steps to reproduce</span>
          <textarea className="input" rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'1. …\n2. …\n3. …'} maxLength={5000} />
        </label>

        <label className="bugform-field">
          <span>Additional notes</span>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else worth knowing?" maxLength={5000} />
        </label>

        <div className="bugform-field">
          <span>Attachments</span>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            accept="image/*,video/*,application/pdf"
            onChange={(e) => addFiles(e.target.files)} />
          <button type="button" className="btn subtle sm" onClick={() => fileRef.current?.click()}>＋ Add screenshots / video</button>
          <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>Images, video, PDFs · up to 50 MB each</span>
          {files.length > 0 && (
            <ul className="bugform-files">
              {files.map((f, i) => (
                <li key={i}>
                  <span className="bugform-fname" title={f.name}>{f.name}</span>
                  <span className="muted">{fmtSize(f.size)}</span>
                  <button type="button" className="icon-btn" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* honeypot — visually hidden, off-screen; bots fill it, humans don't */}
        <input type="text" tabIndex={-1} autoComplete="off" className="bugform-hp"
          value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />

        {error && <div className="bugform-error">{error}</div>}

        <button className="btn primary bugform-submit" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit bug report'}
        </button>
      </form>
    </div>
  );
}
