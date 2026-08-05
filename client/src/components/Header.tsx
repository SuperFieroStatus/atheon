import { useState, useRef, useEffect } from 'react';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import type { User } from '../types';

interface Props {
  user: User;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenGroups: () => void;
  onToggleSidebar: () => void;
  onToggleTodo: () => void;
}

export function Header({ user, onLogout, onOpenSettings, onOpenGroups, onToggleSidebar, onToggleTodo }: Props) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <button
          className="icon-btn mobile-only"
          onClick={onToggleSidebar}
          title="Menu"
          aria-label="Open workspaces menu"
          style={{ color: '#c3ccd6', fontSize: 18 }}
        >
          ☰
        </button>
        <Logo />
      </div>

      <div className="hstack" style={{ gap: 6 }}>
        <button
          className="icon-btn mobile-only"
          onClick={onToggleTodo}
          title="My To-Do"
          aria-label="Open my to-do list"
          style={{ color: '#c3ccd6', fontSize: 16 }}
        >
          ✓
        </button>
        <button
          className="icon-btn"
          onClick={onOpenGroups}
          title="Groups"
          aria-label="Groups"
          style={{ color: '#c3ccd6', fontSize: 16 }}
        >
          👥
        </button>
        <div ref={ref} style={{ position: 'relative' }}>
          <button className="avatar-btn" onClick={() => setMenu((m) => !m)}>
            <Avatar first={user.first_name} last={user.last_name} color={user.color} />
          </button>
          {menu && (
            <div className="menu" style={{ right: 0, top: 40 }}>
              <div style={{ padding: '6px 9px' }}>
                <div style={{ fontWeight: 700 }}>{user.first_name} {user.last_name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{user.email}</div>
              </div>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { setMenu(false); onOpenSettings(); }}>⚙ User Settings</button>
              <button className="menu-item" onClick={onLogout}>Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
