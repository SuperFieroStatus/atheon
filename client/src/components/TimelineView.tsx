import type { BoardData, Task } from '../types';
import { cardColor, taskPassesFilters, todayStr, type Filters } from '../board-utils';

interface Ctx {
  data: BoardData;
  colorBy: 'none' | 'assignee' | 'tag';
  filters: Filters;
  tz?: string | null;
  openTask: (id: string) => void;
}

const DAY = 86400000;
const COL = 44;

// All timeline day math runs in UTC so the axis is stable regardless of the
// browser clock; "today" is anchored to the user's chosen timezone.
function dayKey(d: Date) { return d.toISOString().slice(0, 10); }
function parse(iso: string) { return new Date(iso.slice(0, 10) + 'T00:00:00Z'); }

export function TimelineView(ctx: Ctx) {
  const { data, filters } = ctx;
  const tasks = data.tasks.filter((t) => !t.parent_task_id && t.due_date && taskPassesFilters(t, filters));

  const today = parse(todayStr(ctx.tz));
  let min = new Date(today), max = new Date(today);
  for (const t of tasks) {
    const due = parse(t.due_date!);
    const start = parse(t.created_at);
    const s = start < due ? start : due;
    if (s < min) min = new Date(s);
    if (due > max) max = new Date(due);
  }
  // pad and clamp width
  min = new Date(min.getTime() - 2 * DAY);
  max = new Date(max.getTime() + 3 * DAY);
  let totalDays = Math.round((max.getTime() - min.getTime()) / DAY) + 1;
  if (totalDays < 21) { max = new Date(min.getTime() + 20 * DAY); totalDays = 21; }
  if (totalDays > 120) { max = new Date(min.getTime() + 119 * DAY); totalDays = 120; }

  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) days.push(new Date(min.getTime() + i * DAY));

  function offset(d: Date) { return Math.round((d.getTime() - min.getTime()) / DAY); }

  if (tasks.length === 0) {
    return (
      <div className="empty-board">
        <div className="big">Nothing to plot yet</div>
        <div>Give tasks a due date and they'll appear on the timeline.</div>
      </div>
    );
  }

  return (
    <div className="timeline">
      <div className="tl-grid">
        <div className="tl-header">
          <div className="tl-corner">Task</div>
          {days.map((d) => {
            const wknd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            const isToday = dayKey(d) === dayKey(today);
            return (
              <div key={dayKey(d)} className={'tl-day' + (wknd ? ' weekend' : '') + (isToday ? ' today' : '')}>
                <span className="dow">{d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span>
                <span className="dnum">{d.getUTCDate()}</span>
              </div>
            );
          })}
        </div>

        {data.categories.map((cat) => {
          const catTasks = tasks.filter((t) => t.category_id === cat.id);
          if (!catTasks.length) return null;
          return (
            <div key={cat.id}>
              <div className="tl-section" style={{ minWidth: 220 + totalDays * COL }}>
                <span className="column-dot" style={{ background: cat.color || '#B3BAC5', display: 'inline-block', marginRight: 6 }} />
                {cat.name}
              </div>
              {catTasks.map((t) => {
                const due = parse(t.due_date!);
                const start = parse(t.created_at);
                const s = start < due ? start : due;
                const startOff = Math.max(0, offset(s));
                const endOff = Math.min(totalDays - 1, offset(due));
                const left = startOff * COL;
                const width = Math.max(COL - 6, (endOff - startOff + 1) * COL - 6);
                const tint = cardColor(t, ctx.colorBy, data.members) || cat.color || '#C97E3D';
                return (
                  <div className="tl-row" key={t.id}>
                    <div className="tl-name">
                      <input type="checkbox" className="rcheck" style={{ width: 14, height: 14 }} checked={t.completed} readOnly />
                      <span className="nm">{t.name}</span>
                    </div>
                    <div className="tl-track" style={{ position: 'relative' }}>
                      <div style={{ display: 'flex' }}>
                        {days.map((d) => {
                          const wknd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                          const isToday = dayKey(d) === dayKey(today);
                          return <div key={dayKey(d)} className={'tl-daycell' + (wknd ? ' weekend' : '') + (isToday ? ' today' : '')} />;
                        })}
                      </div>
                      <div className="tl-bar" style={{ left, width, background: tint, opacity: t.completed ? 0.55 : 1 }}
                        onClick={() => ctx.openTask(t.id)} title={t.name}>
                        {t.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
