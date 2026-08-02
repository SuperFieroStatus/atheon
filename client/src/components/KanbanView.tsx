import { useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, DragOverlay, type DragStartEvent,
} from '@dnd-kit/core';
import type { BoardData, Task } from '../types';
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
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const task = data.tasks.find((x) => x.id === e.active.id);
    if (task && task.category_id !== overId) ctx.moveTask(task.id, overId);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board-scroll">
        <div className="kanban">
          {data.categories.map((cat) => {
            const colTasks = topTasks.filter((t) => t.category_id === cat.id && taskPassesFilters(t, filters));
            const items = arrange(colTasks);
            return (
              <Column key={cat.id} id={cat.id} name={cat.name} color={cat.color || '#B3BAC5'} count={colTasks.length}
                onAdd={(name) => ctx.createTask(cat.id, name)} canEdit={data.canEdit}>
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

function Column({ id, name, color, count, children, onAdd, canEdit }: {
  id: string; name: string; color: string; count: number; children: React.ReactNode;
  onAdd: (name: string) => void; canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  function submit() {
    if (val.trim()) onAdd(val.trim());
    setVal(''); setAdding(false);
  }
  return (
    <div className="column">
      <div className="column-head">
        <span className="column-dot" style={{ background: color }} />
        <span className="column-name">{name}</span>
        <span className="column-count">{count}</span>
      </div>
      <div ref={setNodeRef} className={'column-body' + (isOver ? ' drop-over' : '')}>
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
