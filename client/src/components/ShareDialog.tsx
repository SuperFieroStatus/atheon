import { useEffect, useState } from 'react';
import { api } from '../api';
import type { User, Member, Group } from '../types';
import { Avatar } from './Avatar';

interface Props {
  target: { type: 'workspace' | 'project'; id: string; name: string };
  currentUser: User;
  onClose: () => void;
}

export function ShareDialog({ target, onClose }: Props) {
  const [tab, setTab] = useState<'people' | 'groups'>('people');
  const [owner, setOwner] = useState<Member | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [assignedGroups, setAssignedGroups] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [role, setRole] = useState<'view' | 'collaborate'>('collaborate');

  const [myGroups, setMyGroups] = useState<Group[]>([]);

  async function load() {
    const data = await api.get(`/${target.type}/${target.id}/members`);
    setOwner(data.owner);
    setMembers(data.members);
    setAssignedGroups(data.groups);
    setCanManage(data.canManage);
  }
  async function loadGroups() {
    const { groups } = await api.get('/groups');
    setMyGroups(groups);
  }

  useEffect(() => { load(); loadGroups(); }, [target.id]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { users } = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setResults(users);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function addMember(u: Member) {
    await api.post(`/${target.type}/${target.id}/members`, { userId: u.id, role });
    setQuery(''); setResults([]);
    load();
  }
  async function removeMember(userId: string) {
    await api.del(`/${target.type}/${target.id}/members/${userId}`);
    load();
  }
  async function assignGroup(groupId: string) {
    await api.post(`/${target.type}/${target.id}/groups`, { groupId, role });
    load();
  }
  async function unassignGroup(groupId: string) {
    await api.del(`/${target.type}/${target.id}/groups/${groupId}`);
    load();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal narrow" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Share {target.type}</div>
            <div className="muted" style={{ fontSize: 13 }}>{target.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          <div className="viewswitch" style={{ marginBottom: 14 }}>
            <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>People</button>
            <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Groups</button>
          </div>

          {tab === 'people' && (
            <>
              {canManage && (
                <div className="field" style={{ position: 'relative' }}>
                  <div className="hstack" style={{ gap: 6 }}>
                    <input
                      className="input"
                      placeholder="Add by name or email…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select className="meta-select" style={{ width: 130 }} value={role} onChange={(e) => setRole(e.target.value as any)}>
                      <option value="collaborate">Collaborate</option>
                      <option value="view">View</option>
                    </select>
                  </div>
                  {results.length > 0 && (
                    <div className="menu" style={{ left: 0, right: 0, top: 44 }}>
                      {results.map((u) => (
                        <button key={u.id} className="menu-item" onClick={() => addMember(u)}>
                          <Avatar first={u.first_name} last={u.last_name} color={u.color} size="sm" />
                          <span>{u.first_name} {u.last_name}</span>
                          <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="field-label">Has access</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {owner && (
                  <div className="hstack">
                    <Avatar first={owner.first_name} last={owner.last_name} color={owner.color} size="sm" />
                    <span>{owner.first_name} {owner.last_name}</span>
                    <span className="pill" style={{ marginLeft: 'auto' }}>Owner</span>
                  </div>
                )}
                {members.map((m) => (
                  <div className="hstack" key={m.id}>
                    <Avatar first={m.first_name} last={m.last_name} color={m.color} size="sm" />
                    <span>{m.first_name} {m.last_name}</span>
                    <span className="pill" style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>{m.role}</span>
                    {canManage && <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => removeMember(m.id)}>×</button>}
                  </div>
                ))}
                {members.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No one else yet.</div>}
              </div>
            </>
          )}

          {tab === 'groups' && (
            <>
              {canManage ? (
                <>
                  <div className="field-label">Assign one of your groups</div>
                  <div className="hstack" style={{ marginBottom: 8 }}>
                    <select className="meta-select" style={{ width: 130 }} value={role} onChange={(e) => setRole(e.target.value as any)}>
                      <option value="collaborate">Collaborate</option>
                      <option value="view">View</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {myGroups.length === 0 && (
                      <div className="muted" style={{ fontSize: 13 }}>
                        You have no groups yet. Create one from the 👥 Groups icon in the top bar.
                      </div>
                    )}
                    {myGroups.map((g) => {
                      const assigned = assignedGroups.find((a) => a.group_id === g.id);
                      return (
                        <div className="hstack" key={g.id}>
                          <span style={{ fontWeight: 600 }}>👥 {g.name}</span>
                          <span className="muted" style={{ fontSize: 12 }}>({g.members.length})</span>
                          <div style={{ marginLeft: 'auto' }}>
                            {assigned ? (
                              <button className="btn sm danger" onClick={() => unassignGroup(g.id)}>Remove</button>
                            ) : (
                              <button className="btn sm subtle" onClick={() => assignGroup(g.id)}>Assign</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Manage your groups (create, rename, add people) from the 👥 icon in the top bar.
                  </div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>Only the owner can assign groups here.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

