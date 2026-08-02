import type { Task, Member } from './types';

export const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'] as const;
export const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#d63031',
  high: '#e17055',
  medium: '#fdcb6e',
  low: '#74b9ff',
};
export const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/* --------------------------- timezone-aware dates ---------------------------
 * Due dates are stored as calendar dates ('YYYY-MM-DD'), so their *value* is the
 * same for everyone. What varies by person is "what is today" and how timestamps
 * read — so all of that is computed against the user's chosen timezone, letting
 * collaborators in different places agree on whether something is due/overdue.
 */

export type TZ = string | null | undefined;

export function resolveZone(tz: TZ): string {
  if (tz) return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Today's calendar date in the given timezone, as 'YYYY-MM-DD'. */
export function todayStr(tz: TZ): string {
  try {
    // en-CA renders as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: resolveZone(tz),
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** ms at UTC midnight for a 'YYYY-MM-DD' string (safe for day-count diffs). */
function dateOnlyUTC(d: string): number {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Format a due date (calendar date) or a timestamp for display. */
export function fmtDate(iso: string | null, tz?: TZ): string {
  if (!iso) return '';
  if (iso.length <= 10) {
    // date-only: render the calendar date itself, no timezone shifting
    return new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    });
  }
  // full timestamp: render in the viewer's timezone
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: resolveZone(tz),
  });
}

/** Format a timestamp with time, in the viewer's timezone. */
export function fmtDateTime(iso: string | null, tz?: TZ): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: resolveZone(tz),
  });
}

export function dueStatus(iso: string | null, completed: boolean, tz?: TZ): '' | 'due-soon' | 'due-over' {
  if (!iso || completed) return '';
  const diff = Math.round((dateOnlyUTC(iso) - dateOnlyUTC(todayStr(tz))) / 86400000);
  if (diff < 0) return 'due-over';
  if (diff <= 2) return 'due-soon';
  return '';
}

export function memberName(members: Member[], id: string | null): Member | undefined {
  if (!id) return undefined;
  return members.find((m) => m.id === id);
}

/** Resolve a task's assignee ids to member objects (order preserved). */
export function assigneesOf(members: Member[], ids: string[]): Member[] {
  return ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];
}

export interface Filters {
  assignee: string; // '' = all
  tag: string; // tag id or ''
  from: string; // date
  to: string; // date
}

export const emptyFilters: Filters = { assignee: '', tag: '', from: '', to: '' };

export function taskPassesFilters(t: Task, f: Filters): boolean {
  if (f.assignee && !t.assignee_ids.includes(f.assignee)) return false;
  if (f.tag && !t.tags.some((tg) => tg.id === f.tag)) return false;
  if (f.from && (!t.due_date || t.due_date < f.from)) return false;
  if (f.to && (!t.due_date || t.due_date > f.to)) return false;
  return true;
}

/** Color used to tint a card, based on color-by mode. */
export function cardColor(
  t: Task,
  mode: 'none' | 'assignee' | 'tag',
  members: Member[]
): string | undefined {
  if (mode === 'assignee') {
    // tint by the first assignee when there are several
    const m = memberName(members, t.assignee_ids[0] ?? null);
    return m?.color;
  }
  if (mode === 'tag') {
    return t.tags[0]?.color;
  }
  return undefined;
}

export interface RenderItem {
  kind: 'single' | 'group';
  leader: Task;
  dependents: Task[]; // only for group
}

/**
 * Arrange top-level tasks within a column so that tasks depending on another
 * task in the SAME column are grouped beneath it inside a bordered block.
 */
export function arrange(columnTasks: Task[]): RenderItem[] {
  const ids = new Set(columnTasks.map((t) => t.id));
  const dependentsOf = new Map<string, Task[]>();
  const isDependent = new Set<string>();

  for (const t of columnTasks) {
    if (t.dependency_id && ids.has(t.dependency_id)) {
      if (!dependentsOf.has(t.dependency_id)) dependentsOf.set(t.dependency_id, []);
      dependentsOf.get(t.dependency_id)!.push(t);
      isDependent.add(t.id);
    }
  }

  const items: RenderItem[] = [];
  for (const t of columnTasks) {
    if (isDependent.has(t.id)) continue; // rendered inside its leader's group
    const deps = dependentsOf.get(t.id);
    if (deps && deps.length) {
      items.push({ kind: 'group', leader: t, dependents: deps });
    } else {
      items.push({ kind: 'single', leader: t, dependents: [] });
    }
  }
  return items;
}
