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
  patchTask: (id: string, fields: Partial<Task>) => Promise<void>;
}

export function TableView(ctx: Ctx) {
  const { data, filters } = ctx;
  const topTasks = data.tasks.filter((t) => !t.parent_task_id);
  const subtasksByParent = new Map<string, Task[]>();
  for (const t of data.tasks) if (t.parent_task_id) {
    if (!subtasksByParent.has(t.parent_task_id)) subtasksByParent.set(t.parent_task_id, []);
    subtasksByParent.get(t.parent_task_id)!.push(t);
  }

  return (
    <div className="tableview">
      {data.categories.map((cat) => {
        const colTasks = topTasks.filter((t) => t.category_id === cat.id && taskPassesFilters(t, filters));
        const items = arrange(colTasks);
        const estRows = colTasks.flatMap((t) => [t, ...(subtasksByParent.get(t.id) || [])]);
        const totalEst = Math.round(estRows.reduce((s, t) => s + (t.estimated_hours || 0), 0) * 100) / 100;
        return (
          <div className="tgroup" key={cat.id}>
            <div className="tgroup-head">
              <span className="column-dot" style={{ background: cat.color || '#B3BAC5' }} />
              <span className="column-name">{cat.name}</span>
              <span className="column-count">{colTasks.length}</span>
              {totalEst > 0 && <span className="column-est" title="Total estimated hours">{totalEst}h est.</span>}
            </div>
            <table className="ttable">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Task</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Priority</th>
                  <th>Est.</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {colTasks.length === 0 && (
                  <tr><td colSpan={6} className="muted" style={{ fontStyle: 'italic' }}>No tasks</td></tr>
                )}
                {items.map((it) => {
                  const rows = it.kind === 'group' ? [it.leader, ...it.dependents] : [it.leader];
                  return rows.map((t, idx) => (
                    <TaskRows
                      key={t.id} task={t} ctx={ctx}
                      subs={subtasksByParent.get(t.id) || []}
                      depMark={it.kind === 'group'}
                      isDependent={it.kind === 'group' && idx > 0}
                    />
                  ));
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function TaskRows({ task, ctx, subs, depMark, isDependent }: {
  task: Task; ctx: Ctx; subs: Task[]; depMark: boolean; isDependent: boolean;
}) {
  return (
    <>
      <Row task={task} ctx={ctx} depMark={depMark} indentLabel={isDependent ? '↳ depends' : undefined} />
      {subs.map((s) => <Row key={s.id} task={s} ctx={ctx} depMark={false} sub />)}
    </>
  );
}

function Row({ task, ctx, sub, depMark, indentLabel }: {
  task: Task; ctx: Ctx; sub?: boolean; depMark?: boolean; indentLabel?: string;
}) {
  const { data } = ctx;
  const assignees = assigneesOf(data.members, task.assignee_ids);
  const tint = cardColor(task, ctx.colorBy, data.members);
  const ds = dueStatus(task.due_date, task.completed, ctx.tz);
  return (
    <tr className={'trow' + (task.completed ? ' completed' : '') + (sub ? ' sub' : '') + (depMark ? ' dep-row-mark' : '')}
      onClick={() => ctx.openTask(task.id)}>
      <td>
        <div className="tname">
          <input type="checkbox" className="rcheck" checked={task.completed}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => ctx.patchTask(task.id, { completed: e.target.checked } as any)}
            disabled={!data.canEdit} />
          {tint && <span className="column-dot" style={{ background: tint }} />}
          <span>{task.name}</span>
          {indentLabel && <span className="muted" style={{ fontSize: 11 }}>{indentLabel}</span>}
        </div>
      </td>
      <td>{assignees.length ? <span className="assignee-mini"><AvatarStack people={assignees} size="sm" max={4} />{assignees.length === 1 ? assignees[0].first_name : <span className="muted" style={{ fontSize: 12 }}>{assignees.length} people</span>}</span> : <span className="muted">—</span>}</td>
      <td>{task.due_date ? <span className={'pill ' + (ds ? 'due-' + ds.split('-')[1] : '')}>{fmtDate(task.due_date, ctx.tz)}</span> : <span className="muted">—</span>}</td>
      <td>{task.priority ? <span className="pill"><span className="prio-dot" style={{ background: PRIORITY_COLORS[task.priority] }} />{PRIORITY_LABELS[task.priority]}</span> : <span className="muted">—</span>}</td>
      <td>{task.estimated_hours != null ? <span>{task.estimated_hours}h</span> : <span className="muted">—</span>}</td>
      <td>{task.tags.length ? <div className="card-tags" style={{ margin: 0 }}>{task.tags.map((t) => <span key={t.id} className="tag-pill" style={{ background: t.color }}>{t.name}</span>)}</div> : <span className="muted">—</span>}</td>
    </tr>
  );
}
