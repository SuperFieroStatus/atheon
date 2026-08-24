import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { BoardData, Task, Tag, User } from '../types';
import { emptyFilters, type Filters } from '../board-utils';
import { KanbanView } from './KanbanView';
import { TableView } from './TableView';
import { TimelineView } from './TimelineView';
import { TaskModal } from './TaskModal';

type ViewMode = 'kanban' | 'table' | 'timeline';
type ColorBy = 'none' | 'assignee' | 'tag';

interface Props {
  boardId: string | null;
  currentUser: User;
  onStructureChange: () => void;
}

export function BoardArea({ boardId, currentUser }: Props) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(false);
  // Table is the friendlier default on phones (vertical, no horizontal scroll)
  const [view, setView] = useState<ViewMode>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'table' : 'kanban'
  );
  const [colorBy, setColorBy] = useState<ColorBy>('none');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const d = await api.get<BoardData>(`/boards/${id}/data`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (boardId) { load(boardId); setFilters(emptyFilters); }
    else setData(null);
  }, [boardId, load]);

  // ---- mutation helpers (optimistic where sensible) ----
  const replaceTask = (t: Task) =>
    setData((d) => (d ? { ...d, tasks: d.tasks.map((x) => (x.id === t.id ? t : x)) } : d));

  const patchTask = async (id: string, fields: Partial<Task>) => {
    setData((d) => (d ? { ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, ...fields } as Task : x)) } : d));
    const { task } = await api.patch(`/tasks/${id}`, fields);
    replaceTask(task);
  };

  const createTask = async (categoryId: string | null, name: string, parentTaskId?: string) => {
    if (!data) return;
    const { task } = await api.post('/tasks', { boardId: data.board.id, categoryId, name, parentTaskId });
    setData((d) => (d ? { ...d, tasks: [...d.tasks, task] } : d));
  };

  const createSubtask = async (parentId: string, name: string) => {
    const parent = data?.tasks.find((t) => t.id === parentId);
    await createTask(parent?.category_id ?? null, name, parentId);
  };

  const moveTask = async (id: string, categoryId: string) => {
    await patchTask(id, { category_id: categoryId } as any);
  };

  const deleteTask = async (id: string) => {
    await api.del(`/tasks/${id}`);
    setData((d) => (d ? { ...d, tasks: d.tasks.filter((t) => t.id !== id && t.parent_task_id !== id) } : d));
    if (openTaskId === id) setOpenTaskId(null);
  };

  const toggleTag = async (taskId: string, tagId: string, add: boolean) => {
    const { tags } = add
      ? await api.post(`/tasks/${taskId}/tags/${tagId}`)
      : await api.del(`/tasks/${taskId}/tags/${tagId}`);
    setData((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, tags } : t)) } : d));
  };

  const createTag = async (name: string): Promise<Tag> => {
    const { tag } = await api.post('/tags', { boardId: data!.board.id, name });
    setData((d) => (d ? { ...d, tags: [...d.tags, tag] } : d));
    return tag;
  };

  const addAssignee = async (taskId: string, userId: string) => {
    const { task } = await api.post(`/tasks/${taskId}/assignees/${userId}`);
    replaceTask(task);
  };
  const removeAssignee = async (taskId: string, userId: string) => {
    const { task } = await api.del(`/tasks/${taskId}/assignees/${userId}`);
    replaceTask(task);
  };

  const createCategory = async (name: string) => {
    if (!data) return;
    const cat = await api.post('/categories', { boardId: data.board.id, name });
    setData((d) => (d ? { ...d, categories: [...d.categories, cat] } : d));
  };

  const renameCategory = async (categoryId: string, name: string) => {
    await api.patch(`/categories/${categoryId}`, { name });
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === categoryId ? { ...c, name } : c)) } : d));
  };

  const setCategoryColor = async (categoryId: string, color: string) => {
    await api.patch(`/categories/${categoryId}`, { color });
    setData((d) => (d ? { ...d, categories: d.categories.map((c) => (c.id === categoryId ? { ...c, color } : c)) } : d));
  };

  const reorderCategories = (activeId: string, overId: string) => {
    setData((d) => {
      if (!d) return d;
      const ids = d.categories.map((c) => c.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return d;
      const cats = d.categories.slice();
      const [moved] = cats.splice(oldIndex, 1);
      cats.splice(newIndex, 0, moved);
      api.patch('/categories/reorder', { boardId: d.board.id, order: cats.map((c) => c.id) }).catch(() => {});
      return { ...d, categories: cats };
    });
  };

  const deleteCategory = async (categoryId: string) => {
    await api.del(`/categories/${categoryId}`);
    // the column's tasks are removed server-side too
    setData((d) => (d ? {
      ...d,
      categories: d.categories.filter((c) => c.id !== categoryId),
      tasks: d.tasks.filter((t) => t.category_id !== categoryId),
    } : d));
  };

  if (!boardId) {
    return (
      <div className="main">
        <div className="empty-board">
          <div className="big">Welcome to Atheon</div>
          <div>Create a workspace or project from the sidebar, then add a board to get started.</div>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="main"><div className="center-fill"><div className="spin" /></div></div>;
  }

  if (!data) {
    return <div className="main"><div className="empty-board"><div className="big">Board unavailable</div><div>You may not have access to this board.</div></div></div>;
  }

  const ctx = { data, colorBy, filters, tz: currentUser.timezone, openTask: setOpenTaskId, createTask, moveTask, patchTask, createCategory, renameCategory, deleteCategory, setCategoryColor, reorderCategories };
  const filtersActive = filters.assignee || filters.tag || filters.from || filters.to;

  return (
    <div className="main">
      <div className="board-top">
        <div className="crumb">
          {data.workspace.name} <span className="sep">/</span> {data.project.name} <span className="sep">/</span> <b>{data.board.name}</b>
        </div>

        {data.canEdit && <BugFormButton boardId={data.board.id} />}

        <div className="viewswitch">
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>Kanban</button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Table</button>
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>Timeline</button>
        </div>

        <div className="filters">
          <select className="filter-sel" value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}>
            <option value="">All assignees</option>
            {data.members.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </select>
          <select className="filter-sel" value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}>
            <option value="">All tags</option>
            {data.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="filter-sel" type="date" title="Due from" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <input className="filter-sel" type="date" title="Due to" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          {filtersActive && <button className="chip-clear" onClick={() => setFilters(emptyFilters)}>Clear</button>}
          <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
          <select className="filter-sel" title="Color code by" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="none">No color</option>
            <option value="assignee">Color: Assignee</option>
            <option value="tag">Color: Tag</option>
          </select>
        </div>
      </div>

      {view === 'kanban' && <KanbanView {...ctx} />}
      {view === 'table' && <TableView {...ctx} />}
      {view === 'timeline' && <TimelineView {...ctx} />}

      {openTaskId && (
        <TaskModal
          taskId={openTaskId}
          data={data}
          currentUser={currentUser}
          tz={currentUser.timezone}
          onPatch={patchTask}
          onCreateSubtask={createSubtask}
          onDeleteTask={deleteTask}
          onToggleTag={toggleTag}
          onCreateTag={createTag}
          onAddAssignee={addAssignee}
          onRemoveAssignee={removeAssignee}
          onClose={() => setOpenTaskId(null)}
          openTask={setOpenTaskId}
        />
      )}
    </div>
  );
}

/** Board-level control: turn the public bug-report form on/off and copy its link. */
function BugFormButton({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get(`/boards/${boardId}/bug-intake`).then((s) => { setEnabled(s.enabled); setToken(s.token); }).catch(() => {});
  }, [open, boardId]);

  const link = token ? `${window.location.origin}/report/${token}` : '';

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const s = await api.put(`/boards/${boardId}/bug-intake`, { enabled: next });
      setEnabled(s.enabled); setToken(s.token);
    } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <div className="bugform-ctl">
      <button className={'btn subtle sm' + (enabled ? ' on' : '')} onClick={() => setOpen((o) => !o)} title="Public bug-report form">
        🐞 Bug form{enabled ? ' · on' : ''}
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="bugform-pop">
            <div className="bugform-pop-head">
              <b>Public bug form</b>
              <label className="switch">
                <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
                <span>{enabled ? 'On' : 'Off'}</span>
              </label>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
              Anyone with this link can file a bug — it lands as a task in this board’s first column. No account needed.
            </p>
            {enabled && token ? (
              <div className="bugform-linkrow">
                <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn subtle sm" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>Turn it on to get a shareable link.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
