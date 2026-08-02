import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Group, Member } from '../types';
import { Avatar } from './Avatar';

export function GroupsDialog({ onClose }: { onClose: () => void }) {
  const [owned, setOwned] = useState<Group[]>([]);
  const [joined, setJoined] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);

  async function load() {
    const [o, j] = await Promise.all([api.get('/groups'), api.get('/groups/joined')]);
    setOwned(o.groups);
    setJoined(j.groups);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { users } = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setResults(users);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function create() {
    if (!name.trim()) return;
    const { group } = await api.post('/groups', { name: name.trim() });
    setName('');
    setOpenGroup(group.id);
    await load();
  }
  async function rename(g: Group) {
    const n = prompt('Rename group:', g.name);
    if (n === null || !n.trim()) return;
    await api.patch(`/groups/${g.id}`, { name: n.trim() });
    await load();
  }
  async function del(g: Group) {
    if (!confirm(`Delete group "${g.name}"? It will be removed from anything it was assigned to.`)) return;
    await api.del(`/groups/${g.id}`);
    if (openGroup === g.id) setOpenGroup(null);
    await load();
  }
  async function addMember(gid: string, u: Member) {
    await api.post(`/groups/${gid}/members`, { userId: u.id });
    setQuery(''); setResults([]);
    await load();
  }
  async function removeMember(gid: string, uid: string) {
    await api.del(`/groups/${gid}/members/${uid}`);
    await load();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal narrow" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>👥 Groups</div>
            <div className="muted" style={{ fontSize: 13 }}>Bundle people together, then assign a whole group when sharing.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '4px 18px 20px' }}>
          {/* create */}
          <div className="settings-section">Create a group</div>
          <div className="hstack" style={{ marginBottom: 20 }}>
            <input
              className="input"
              placeholder="New group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button className="btn" onClick={create}>Create</button>
          </div>

          {/* owned */}
          <div className="settings-section">Your groups</div>
          {owned.length === 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>You haven't created any groups yet.</div>}
          {owned.map((g) => (
            <div key={g.id} className="group-card">
              <div className="hstack">
                <button className="icon-btn" onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}>{openGroup === g.id ? '▾' : '▸'}</button>
                <span style={{ fontWeight: 700 }}>{g.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{g.members.length} {g.members.length === 1 ? 'member' : 'members'}</span>
                <div className="grow" />
                <button className="icon-btn" title="Rename" onClick={() => rename(g)}>✎</button>
                <button className="icon-btn" title="Delete" style={{ color: 'var(--danger)' }} onClick={() => del(g)}>🗑</button>
              </div>

              {openGroup === g.id && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                    {g.members.map((m) => (
                      <div className="hstack" key={m.id}>
                        <Avatar first={m.first_name} last={m.last_name} color={m.color} size="sm" />
                        <span style={{ fontSize: 13 }}>{m.first_name} {m.last_name}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{m.email}</span>
                        <button className="icon-btn" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => removeMember(g.id, m.id)}>×</button>
                      </div>
                    ))}
                    {g.members.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No members yet.</div>}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      placeholder="Add member by name or email…"
                      value={openGroup === g.id ? query : ''}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {results.length > 0 && openGroup === g.id && (
                      <div className="menu" style={{ left: 0, right: 0, top: 42 }}>
                        {results.map((u) => (
                          <button key={u.id} className="menu-item" onClick={() => addMember(g.id, u)}>
                            <Avatar first={u.first_name} last={u.last_name} color={u.color} size="sm" />
                            <span>{u.first_name} {u.last_name}</span>
                            <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{u.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* joined */}
          <div className="settings-section" style={{ marginTop: 20 }}>Groups you're in</div>
          {joined.length === 0 && <div className="muted" style={{ fontSize: 13 }}>You're not a member of anyone else's groups.</div>}
          {joined.map((g) => (
            <div key={g.id} className="group-card readonly">
              <div className="hstack">
                <span style={{ fontWeight: 700 }}>{g.name}</span>
                {g.owner && <span className="muted" style={{ fontSize: 12 }}>· by {g.owner.first_name} {g.owner.last_name}</span>}
                <div className="grow" />
                <span className="muted" style={{ fontSize: 12 }}>{g.members.length} {g.members.length === 1 ? 'member' : 'members'}</span>
              </div>
              <div className="hstack" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                {g.members.map((m) => (
                  <span key={m.id} className="assignee-mini" style={{ background: 'var(--bg-2)', borderRadius: 20, padding: '2px 8px 2px 2px' }}>
                    <Avatar first={m.first_name} last={m.last_name} color={m.color} size="sm" />
                    <span style={{ fontSize: 12 }}>{m.first_name}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
