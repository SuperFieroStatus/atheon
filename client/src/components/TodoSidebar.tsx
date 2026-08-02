import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Todo } from '../types';
import { dueStatus, fmtDate } from '../board-utils';

export function TodoSidebar({ open, tz }: { open: boolean; tz?: string | null }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');

  async function load() {
    const { todos } = await api.get('/todos');
    setTodos(todos);
  }
  useEffect(() => { if (open) load(); }, [open]);

  async function add() {
    if (!name.trim()) return;
    const { todo } = await api.post('/todos', { name: name.trim(), dueDate: due || null });
    setTodos((t) => [...t, todo]);
    setName(''); setDue('');
  }

  async function toggle(t: Todo) {
    // checking off grays it, then it drops off the list on next load
    await api.patch(`/todos/${t.id}`, { completed: !t.completed });
    if (!t.completed) {
      // mark done locally (gray), remove after a beat
      setTodos((list) => list.map((x) => (x.id === t.id ? { ...x, completed: true } : x)));
      setTimeout(() => setTodos((list) => list.filter((x) => x.id !== t.id)), 550);
    } else {
      setTodos((list) => list.map((x) => (x.id === t.id ? { ...x, completed: false } : x)));
    }
  }

  async function remove(id: string) {
    await api.del(`/todos/${id}`);
    setTodos((t) => t.filter((x) => x.id !== id));
  }

  return (
    <aside className={'todo-panel' + (open ? '' : ' collapsed')}>
      <div className="todo-head">
        <div>
          <h3>My To-Do</h3>
          <div className="sub">Private to you</div>
        </div>
      </div>
      <div className="todo-scroll">
        {todos.length === 0 && <div className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 20 }}>Nothing here yet. Add something below.</div>}
        {todos.map((t) => {
          const ds = dueStatus(t.due_date, t.completed, tz);
          return (
            <div className={'todo-item' + (t.completed ? ' done' : '')} key={t.id}>
              <input type="checkbox" className="rcheck" checked={t.completed} onChange={() => toggle(t)} />
              <div style={{ flex: 1 }}>
                <div className="todo-name">{t.name}</div>
                {t.due_date && <div className={'todo-due' + (ds === 'due-over' ? ' over' : '')}>Due {fmtDate(t.due_date, tz)}</div>}
              </div>
              <button className="icon-btn" style={{ color: 'var(--text-faint)' }} onClick={() => remove(t.id)}>×</button>
            </div>
          );
        })}
      </div>
      <div className="todo-add">
        <input className="input" placeholder="Add a to-do…" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <div className="hstack" style={{ marginTop: 6 }}>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="btn" onClick={add}>Add</button>
        </div>
      </div>
    </aside>
  );
}
