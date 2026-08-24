import { useState, useEffect, useRef } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, closestCorners,
  type DragEndEvent, DragOverlay, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardData, Task } from '../types';

// Distinct category colours (mirrors server/src/util.ts CATEGORY_COLORS)
const CATEGORY_COLORS = ['#5BA4CF', '#F2A65A', '#9B7EDE', '#61BD4F', '#EB5A46', '#00C2A8', '#E9C544', '#EF7FB4', '#7F8C9A', '#B3BAC5'];
import { AvatarStack } from './Avatar';
import {
  arrange, cardColor, dueStatus, fmtDate, assigneesOf, PRIORITY_COLORS, PRIORITY_LABELS,
  taskPassesFilters, type Filters,
} from '../board-utils';

interface Ctx {
  data: BoardData;
  colorBy: 'none' | 'assignee' | 'tag';
  filters: Filters;
  tz?: string | null;
  openTask: (id: string) => void;
  createTask: (categoryId: string | null, name: string) => Promise<void>;
  moveTask: (id: string, categoryId: string) => Promise<void>;
  patchTask: (id: string, fields: Partial<Task>) => Promise<void>;
  createCategory: (name: string) => Promise<void>;
  renameCategory: (categoryId: string, name: string) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  setCategoryColor: (categoryId: string, color: string) => Promise<void>;
  reorderCategories: (activeId: string, overId: string) => void;
}

export function KanbanView(ctx: Ctx) {
  const { data, filters } = ctx;
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const topTasks = data.tasks.filter((t) => !t.parent_task_id);
  const subtasksByParent = new Map<string, Task[]>();
  for (const t of data.tasks) {
    if (t.parent_task_id) {
      if (!subtasksByParent.has(t.parent_task_id)) subtasksByParent.set(t.parent_task_id, []);
      subtasksByParent.get(t.parent_task_id)!.push(t);
    }
  }

  function onDragStart(e: DragStartEvent) {
    const t = data.tasks.find((x) => x.id === e.active.id);
    setDragging(t || null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const overId = e.over.id as string;
    if (e.active.data.current?.type === 'column') {
      // reorder columns
      const activeCat = e.active.id as string;
      const overCat = overId.startsWith('body:') ? overId.slice(5) : overId;
      if (activeCat !== overCat) ctx.reorderCategories(activeCat, overCat);
      return;
    }
    // move a card into a column
    const targetCat = overId.startsWith('body:') ? overId.slice(5) : overId;
    const task = data.tasks.find((x) => x.id === e.active.id);
    if (task && task.category_id !== targetCat) ctx.moveTask(task.id, targetCat);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board-scroll">
        <div className="kanban">
        <SortableContext items={data.categories.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {data.categories.map((cat) => {
            const colTasks = topTasks.filter((t) => t.category_id === cat.id && taskPassesFilters(t, filters));
            const items = arrange(colTasks);
            return (
              <Column key={cat.id} id={cat.id} name={cat.name} color={cat.color || '#B3BAC5'} count={colTasks.length}
                deleteCount={data.tasks.filter((t) => t.category_id === cat.id).length}
                onAdd={(name) => ctx.createTask(cat.id, name)}
                onRename={(name) => ctx.renameCategory(cat.id, name)}
                onDelete={() => ctx.deleteCategory(cat.id)}
                onSetColor={(color) => ctx.setCategoryColor(cat.id, color)}
                canEdit={data.canEdit}>
                {items.map((it) =>
                  it.kind === 'group' ? (
                    <div className="dep-group" key={it.leader.id}>
                      <div className="dep-label">Dependency group</div>
                      <KanbanCard task={it.leader} ctx={ctx} subs={subtasksByParent.get(it.leader.id) || []} />
                      {it.dependents.map((d) => (
                        <KanbanCard key={d.id} task={d} ctx={ctx} subs={subtasksByParent.get(d.id) || []} isDependent />
                      ))}
                    </div>
                  ) : (
                    <KanbanCard key={it.leader.id} task={it.leader} ctx={ctx} subs={subtasksByParent.get(it.leader.id) || []} />
                  )
                )}
              </Column>
            );
          })}
        </SortableContext>
          {data.canEdit && (
            <button className="add-col" onClick={() => {
              const name = prompt('New category name:', 'New Category');
              if (name) ctx.createCategory(name.trim() || 'New Category');
            }}>＋ Add category</button>
          )}
        </div>
      </div>
      <DragOverlay>{dragging ? <div className="card" style={{ width: 270 }}>{dragging.name}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ id, name, color, count, deleteCount, children, onAdd, onRename, onDelete, onSetColor, canEdit }: {
  id: string; name: string; color: string; count: number; deleteCount: number; children: React.ReactNode;
  onAdd: (name: string) => void; onRename: (name: string) => void; onDelete: () => void;
  onSetColor: (color: string) => void; canEdit: boolean;
}) {
  const sortable = useSortable({ id, data: { type: 'column' } });
  const body = useDroppable({ id: `body:${id}` });
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(name);
  const [colorMenu, setColorMenu] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorMenu(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function submit() {
    if (val.trim()) onAdd(val.trim());
    setVal(''); setAdding(false);
  }
  function submitRename() {
    const n = nameVal.trim();
    if (n && n !== name) onRename(n);
    setRenaming(false);
  }
  function confirmDelete() {
    const msg = deleteCount > 0
      ? `Delete "${name}" and its ${deleteCount} task${deleteCount === 1 ? '' : 's'}? This can't be undone.`
      : `Delete the empty "${name}" column?`;
    if (confirm(msg)) onDelete();
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
    zIndex: sortable.isDragging ? 5 : undefined,
  };

  return (
    <div className="column" ref={sortable.setNodeRef} style={style}>
      <div className="column-head">
        {canEdit && (
          <span className="col-grip" title="Drag to reorder column" {...sortable.attributes} {...sortable.listeners}>⠿</span>
        )}
        <div ref={colorRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <span
            className={'column-dot' + (canEdit ? ' clickable' : '')}
            style={{ background: color }}
            title={canEdit ? 'Change colour' : undefined}
            onClick={() => canEdit && setColorMenu((m) => !m)}
          />
          {colorMenu && (
            <div className="color-menu">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  className={'color-swatch' + (c.toLowerCase() === color.toLowerCase() ? ' selected' : '')}
                  style={{ background: c }}
                  onClick={() => { onSetColor(c); setColorMenu(false); }}
                />
              ))}
            </div>
          )}
        </div>
        {renaming ? (
          <input
            className="column-name-edit"
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') { setNameVal(name); setRenaming(false); } }}
          />
        ) : (
          <span
            className="column-name"
            title={canEdit ? 'Click to rename' : undefined}
            style={canEdit ? { cursor: 'text' } : undefined}
            onClick={() => { if (canEdit) { setNameVal(name); setRenaming(true); } }}
          >
            {name}
          </span>
        )}
        <span className="column-count">{count}</span>
        {canEdit && !renaming && (
          <button className="column-del" title="Delete column" onClick={confirmDelete}>🗑</button>
        )}
      </div>
      <div ref={body.setNodeRef} className={'column-body' + (body.isOver ? ' drop-over' : '')}>
        {children}
      </div>
      {canEdit && (adding ? (
        <div style={{ padding: '0 8px 8px' }}>
          <input className="input" autoFocus placeholder="Task name" value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setVal(''); } }}
            onBlur={submit} />
        </div>
      ) : (
        <button className="add-card" onClick={() => setAdding(true)}>＋ Add task</button>
      ))}
    </div>
  );
}

function KanbanCard({ task, ctx, subs, isDependent }: { task: Task; ctx: Ctx; subs: Task[]; isDependent?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const { data } = ctx;
  const tint = cardColor(task, ctx.colorBy, data.members);
  const assignees = assigneesOf(data.members, task.assignee_ids);
  const ds = dueStatus(task.due_date, task.completed, ctx.tz);

  return (
    <div
      ref={setNodeRef}
      className={'card' + (isDragging ? ' dragging' : '') + (task.completed ? ' completed' : '')}
      style={{ borderLeftColor: tint || 'transparent' }}
      onClick={() => ctx.openTask(task.id)}
      {...attributes}
      {...listeners}
    >
      {task.tags.length > 0 && (
        <div className="card-tags">
          {task.tags.map((t) => (
            <span className="tag-pill" key={t.id} style={{ background: t.color }}>{t.name}</span>
          ))}
        </div>
      )}
      <div className="card-title">
        <input type="checkbox" className="rcheck card-check" checked={task.completed}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => ctx.patchTask(task.id, { completed: e.target.checked } as any)}
          disabled={!data.canEdit} />
        <span>{task.name}</span>
      </div>

      <div className="card-meta">
        {task.priority && (
          <span className="pill" title={PRIORITY_LABELS[task.priority]}>
            <span className="prio-dot" style={{ background: PRIORITY_COLORS[task.priority] }} />
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
        {task.due_date && <span className={'pill ' + (ds ? 'due-' + ds.split('-')[1] : '')}>📅 {fmtDate(task.due_date, ctx.tz)}</span>}
        {!!task.attachment_count && <span className="pill card-attach" title={`${task.attachment_count} attachment${task.attachment_count > 1 ? 's' : ''}`}>📎 {task.attachment_count}</span>}
        <span className="spacer" />
        {assignees.length > 0 && <AvatarStack people={assignees} size="sm" max={3} />}
      </div>

      {subs.length > 0 && (
        <div className="subtasks" onClick={(e) => e.stopPropagation()}>
          {subs.map((s) => (
            <div className={'subtask-row' + (s.completed ? ' done' : '')} key={s.id} onClick={() => ctx.openTask(s.id)}>
              <input type="checkbox" className="rcheck" style={{ width: 14, height: 14 }} checked={s.completed}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => ctx.patchTask(s.id, { completed: e.target.checked } as any)}
                disabled={!data.canEdit} />
              <span className="st-name">{s.name}</span>
              {s.tags.length > 0 && (
                <span className="st-tags">
                  {s.tags.map((t) => (
                    <span className="tag-square" key={t.id} style={{ background: t.color }} title={t.name} />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
