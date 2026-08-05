import { useEffect, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import type { Todo } from '../types';
import { dueStatus, fmtDate } from '../board-utils';

export function TodoSidebar({ open, tz }: { open: boolean; tz?: string | null }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  async function updateDate(t: Todo, value: string) {
    const { todo } = await api.patch(`/todos/${t.id}`, { dueDate: value || null });
    setTodos((list) => list.map((x) => (x.id === t.id ? todo : x)));
    setEditingDate(null);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setTodos((list) => {
      const oldIndex = list.findIndex((t) => t.id === active.id);
      const newIndex = list.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return list;
      const next = arrayMove(list, oldIndex, newIndex);
      api.patch('/todos/reorder', { order: next.map((t) => t.id) }).catch(() => {});
      return next;
    });
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {todos.map((t) => (
              <TodoRow
                key={t.id}
                t={t}
                tz={tz}
                editing={editingDate === t.id}
                onEdit={() => setEditingDate(t.id)}
                onStopEdit={() => setEditingDate(null)}
                onToggle={() => toggle(t)}
                onRemove={() => remove(t.id)}
                onUpdateDate={(v) => updateDate(t, v)}
              />
            ))}
          </SortableContext>
        </DndContext>
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

interface RowProps {
  t: Todo;
  tz?: string | null;
  editing: boolean;
  onEdit: () => void;
  onStopEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateDate: (value: string) => void;
}

function TodoRow({ t, tz, editing, onEdit, onStopEdit, onToggle, onRemove, onUpdateDate }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const ds = dueStatus(t.due_date, t.completed, tz);
  return (
    <div ref={setNodeRef} style={style} className={'todo-item' + (t.completed ? ' done' : '')}>
      <span className="todo-grip" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
      <input type="checkbox" className="rcheck" checked={t.completed} onChange={onToggle} />
      <div style={{ flex: 1 }}>
        <div className="todo-name">{t.name}</div>
        {editing ? (
          <input
            type="date"
            className="todo-date-edit"
            autoFocus
            value={t.due_date || ''}
            onChange={(e) => onUpdateDate(e.target.value)}
            onBlur={onStopEdit}
          />
        ) : t.due_date ? (
          <div
            className={'todo-due editable' + (ds === 'due-over' ? ' over' : '')}
            title="Click to change the date"
            onClick={onEdit}
          >
            Due {fmtDate(t.due_date, tz)}
          </div>
        ) : (
          <button className="todo-add-date" onClick={onEdit}>＋ due date</button>
        )}
      </div>
      <button className="icon-btn" style={{ color: 'var(--text-faint)' }} onClick={onRemove}>×</button>
    </div>
  );
}
