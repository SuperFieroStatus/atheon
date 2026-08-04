import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BoardData, Task, Tag, Comment, User } from '../types';
import { Avatar } from './Avatar';
import { PRIORITY_COLORS, PRIORITY_LABELS, fmtDateTime } from '../board-utils';

interface Props {
  taskId: string;
  data: BoardData;
  currentUser: User;
  tz?: string | null;
  onPatch: (id: string, fields: Partial<Task>) => Promise<void>;
  onCreateSubtask: (parentId: string, name: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onToggleTag: (taskId: string, tagId: string, add: boolean) => Promise<void>;
  onCreateTag: (name: string) => Promise<Tag>;
  onAddAssignee: (taskId: string, userId: string) => Promise<void>;
  onRemoveAssignee: (taskId: string, userId: string) => Promise<void>;
  onClose: () => void;
  openTask: (id: string) => void;
}

export function TaskModal(props: Props) {
  const { data, taskId, currentUser } = props;
  const task = data.tasks.find((t) => t.id === taskId);
  const canEdit = data.canEdit;

  const subtasks = data.tasks.filter((t) => t.parent_task_id === taskId);
  const [name, setName] = useState(task?.name || '');
  const [desc, setDesc] = useState(task?.description || '');
  const [newSub, setNewSub] = useState('');
  const [tagMenu, setTagMenu] = useState(false);
  const [newTag, setNewTag] = useState('');
  const tagRef = useRef<HTMLDivElement>(null);
  const [assigneeMenu, setAssigneeMenu] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => { setName(task?.name || ''); setDesc(task?.description || ''); }, [taskId]);

  useEffect(() => {
    api.get(`/tasks/${taskId}/comments`).then(({ comments }) => setComments(comments)).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') props.onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagMenu(false);
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) setAssigneeMenu(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  if (!task) return null;

  const dependencyOptions = data.tasks.filter((t) => t.id !== taskId && !t.parent_task_id);
  const availableTags = data.tags.filter((t) => !task.tags.some((tt) => tt.id === t.id));
  const assignees = data.members.filter((m) => task.assignee_ids.includes(m.id));
  const unassignedMembers = data.members.filter((m) => !task.assignee_ids.includes(m.id));

  // Flash a brief "Saved ✓" whenever a field auto-saves, so nobody feels they
  // need a Save button. Wrappers call the real mutation, then flash.
  function flashSaved() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  }
  const patch = async (id: string, fields: Partial<Task>) => { await props.onPatch(id, fields); flashSaved(); };
  const toggleTag = async (id: string, tagId: string, add: boolean) => { await props.onToggleTag(id, tagId, add); flashSaved(); };
  const addAssignee = async (id: string, uid: string) => { await props.onAddAssignee(id, uid); flashSaved(); };
  const removeAssignee = async (id: string, uid: string) => { await props.onRemoveAssignee(id, uid); flashSaved(); };
  const createSubtask = async (pid: string, n: string) => { await props.onCreateSubtask(pid, n); flashSaved(); };

  async function saveName() {
    if (name.trim() && name !== task.name) await patch(taskId, { name: name.trim() });
  }
  async function saveDesc() {
    if (desc !== task.description) await patch(taskId, { description: desc });
  }
  async function addSub() {
    if (!newSub.trim()) return;
    await createSubtask(taskId, newSub.trim());
    setNewSub('');
  }
  async function postComment() {
    if (!commentText.trim()) return;
    const { comment } = await api.post(`/tasks/${taskId}/comments`, { body: commentText.trim() });
    setComments((c) => [...c, comment]);
    setCommentText('');
  }
  async function createAndAddTag() {
    if (!newTag.trim()) return;
    const tag = await props.onCreateTag(newTag.trim());
    await toggleTag(taskId, tag.id, true);
    setNewTag('');
  }

  const isParent = !task.parent_task_id;

  return (
    <div className="overlay" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <input
            className="title-input"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="modal-close" onClick={props.onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="modal-main">
            {/* completion + delete */}
            <div className="hstack" style={{ marginBottom: 14, gap: 10 }}>
              <label className={'check-toggle' + (task.completed ? ' on' : '')}>
                <input
                  type="checkbox"
                  className="rcheck"
                  checked={task.completed}
                  disabled={!canEdit}
                  onChange={(e) => patch(taskId, { completed: e.target.checked } as any)}
                />
                {task.completed ? 'Completed' : 'Mark complete'}
              </label>
              <div className="grow" />
              {canEdit && (
                <button className="btn danger sm" onClick={() => { if (confirm('Delete this task?')) props.onDeleteTask(taskId); }}>
                  Delete
                </button>
              )}
            </div>

            {/* tags */}
            <div className="field">
              <label className="field-label">Tags</label>
              <div className="tag-editor" ref={tagRef} style={{ position: 'relative' }}>
                {task.tags.map((t) => (
                  <span className="tag-chip" key={t.id} style={{ background: t.color }}>
                    {t.name}
                    {canEdit && <span className="x" onClick={() => toggleTag(taskId, t.id, false)}>×</span>}
                  </span>
                ))}
                {canEdit && <button className="tag-add" onClick={() => setTagMenu((m) => !m)}>＋ Tag</button>}
                {tagMenu && (
                  <div className="tag-menu" style={{ top: 30, left: 0 }}>
                    {availableTags.map((t) => (
                      <button key={t.id} className="menu-item" onClick={() => { toggleTag(taskId, t.id, true); }}>
                        <span className="column-dot" style={{ background: t.color }} /> {t.name}
                      </button>
                    ))}
                    {availableTags.length > 0 && <div className="menu-sep" />}
                    <div className="hstack" style={{ padding: 4 }}>
                      <input className="input" style={{ padding: '5px 8px' }} placeholder="New tag" value={newTag}
                        onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createAndAddTag()} />
                      <button className="btn sm" onClick={createAndAddTag}>Add</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* assignees */}
            <div className="field">
              <label className="field-label">Assignees</label>
              <div className="tag-editor" ref={assigneeRef} style={{ position: 'relative' }}>
                {assignees.map((m) => (
                  <span className="assignee-chip" key={m.id}>
                    <Avatar first={m.first_name} last={m.last_name} color={m.color} size="sm" />
                    {m.first_name} {m.last_name}
                    {canEdit && <span className="x" onClick={() => removeAssignee(taskId, m.id)}>×</span>}
                  </span>
                ))}
                {canEdit && <button className="tag-add assignee-add" onClick={() => setAssigneeMenu((s) => !s)}>＋ Assignee</button>}
                {assignees.length === 0 && !canEdit && <span className="muted" style={{ fontSize: 13 }}>Unassigned</span>}
                {assigneeMenu && (
                  <div className="tag-menu" style={{ top: 30, left: 0, maxHeight: 220, overflowY: 'auto' }}>
                    {unassignedMembers.length === 0 && <div className="muted" style={{ padding: 6, fontSize: 12 }}>Everyone here is already assigned.</div>}
                    {unassignedMembers.map((m) => (
                      <button key={m.id} className="menu-item" onClick={() => { addAssignee(taskId, m.id); setAssigneeMenu(false); }}>
                        <Avatar first={m.first_name} last={m.last_name} color={m.color} size="sm" />
                        <span>{m.first_name} {m.last_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* details grid */}
            <div className="detail-grid" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label">Due date</label>
                <input type="date" className="meta-date" value={task.due_date || ''} disabled={!canEdit}
                  onChange={(e) => patch(taskId, { due_date: e.target.value || null } as any)} />
              </div>
              <div>
                <label className="field-label">Priority</label>
                <select className="meta-select" value={task.priority || ''} disabled={!canEdit}
                  onChange={(e) => patch(taskId, { priority: (e.target.value || null) as any })}>
                  <option value="">None</option>
                  {Object.keys(PRIORITY_LABELS).map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              {isParent && (
                <div>
                  <label className="field-label">Depends on</label>
                  <select className="meta-select" value={task.dependency_id || ''} disabled={!canEdit}
                    onChange={(e) => patch(taskId, { dependency_id: e.target.value || null } as any)}>
                    <option value="">Nothing</option>
                    {dependencyOptions.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* description */}
            <div className="field">
              <label className="field-label">Description</label>
              <textarea className="desc-input" value={desc} disabled={!canEdit}
                placeholder="Add more detail…"
                onChange={(e) => setDesc(e.target.value)} onBlur={saveDesc} />
            </div>

            {/* subtasks */}
            {isParent && (
              <div className="field">
                <label className="field-label">Subtasks ({subtasks.filter((s) => s.completed).length}/{subtasks.length})</label>
                <div className="st-list">
                  {subtasks.map((s) => (
                    <div className={'st-item' + (s.completed ? ' done' : '')} key={s.id}>
                      <input type="checkbox" className="rcheck" checked={s.completed} disabled={!canEdit}
                        onChange={(e) => patch(s.id, { completed: e.target.checked } as any)} />
                      <span className="st-text" onClick={() => props.openTask(s.id)} style={{ cursor: 'pointer' }}>{s.name}</span>
                      {canEdit && <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => props.onDeleteTask(s.id)}>×</button>}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="hstack">
                    <input className="input" placeholder="Add a subtask" value={newSub}
                      onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} />
                    <button className="btn subtle" onClick={addSub}>Add</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* discussion */}
          <div className="modal-side">
            <label className="field-label">Discussion</label>
            <div className="comments">
              <div className="comment-list">
                {comments.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No comments yet.</div>}
                {comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <Avatar first={c.first_name} last={c.last_name} color={c.color} size="sm" />
                    <div className="comment-bub">
                      <div>
                        <span className="who">{c.first_name} {c.last_name}</span>
                        <span className="when">{fmtDateTime(c.created_at, props.tz)}</span>
                      </div>
                      <div className="body">{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="comment-box">
                  <textarea placeholder="Write a comment…" value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }} />
                  <button className="comment-send" onClick={postComment} title="Send comment (Enter)" aria-label="Send comment">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className={'saved-badge' + (saved ? ' show' : '')}>Saved ✓</span>
          <button className="btn" onClick={props.onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
