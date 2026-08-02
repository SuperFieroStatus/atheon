import { useState, useRef, useEffect } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import type { WorkspaceNode, ProjectNode, User } from '../types';
import { ShareDialog } from './ShareDialog';

interface Props {
  tree: WorkspaceNode[];
  reloadTree: () => Promise<void> | void;
  selectedBoard: string | null;
  onSelectBoard: (id: string) => void;
  open: boolean;
  currentUser: User;
}

type ShareTarget = { type: 'workspace' | 'project'; id: string; name: string } | null;

export function Sidebar({ tree, reloadTree, selectedBoard, onSelectBoard, open, currentUser }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [share, setShare] = useState<ShareTarget>(null);
  const [addMenu, setAddMenu] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // local workspace order for optimistic drag reordering, synced from the tree
  const [order, setOrder] = useState<string[]>(() => tree.map((w) => w.id));
  useEffect(() => { setOrder(tree.map((w) => w.id)); }, [tree]);
  const orderedWorkspaces = order
    .map((oid) => tree.find((w) => w.id === oid))
    .filter(Boolean) as WorkspaceNode[];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);
    try {
      await api.patch('/workspaces/order', { order: newOrder });
    } finally {
      reloadTree();
    }
  }

  useEffect(() => {
    // auto-expand workspaces/projects that contain the selected board
    setExpanded((prev) => {
      const next = { ...prev };
      for (const ws of tree)
        for (const p of ws.projects)
          if (p.boards.some((b) => b.id === selectedBoard)) {
            next['ws:' + ws.id] = true;
            next['pr:' + p.id] = true;
          }
      return next;
    });
  }, [selectedBoard, tree]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddMenu(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  async function addWorkspace() {
    setAddMenu(false);
    const name = prompt('New workspace name:', 'New Workspace');
    if (name === null) return;
    await api.post('/workspaces', { name: name.trim() || 'New Workspace' });
    await reloadTree();
  }

  async function addProject(ws: WorkspaceNode) {
    const name = prompt(`New project in "${ws.name}":`, 'New Project');
    if (name === null) return;
    const res = await api.post('/projects', { workspaceId: ws.id, name: name.trim() || 'New Project' });
    await reloadTree();
    setExpanded((e) => ({ ...e, ['ws:' + ws.id]: true }));
    if (res.board?.id) onSelectBoard(res.board.id);
  }

  async function addBoard(p: ProjectNode) {
    const name = prompt(`New board in "${p.name}":`, 'New Board');
    if (name === null) return;
    const res = await api.post('/boards', { projectId: p.id, name: name.trim() || 'New Board' });
    await reloadTree();
    setExpanded((e) => ({ ...e, ['pr:' + p.id]: true }));
    if (res.id) onSelectBoard(res.id);
  }

  async function rename(type: string, id: string, current: string) {
    const name = prompt('Rename:', current);
    if (name === null || !name.trim()) { setRenaming(null); return; }
    await api.patch(`/${type}/${id}`, { name: name.trim() });
    await reloadTree();
  }

  async function remove(type: string, id: string, name: string, label: string) {
    if (!confirm(`Delete ${label} "${name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/${type}/${id}`);
      await reloadTree();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <aside className={'sidebar' + (open ? '' : ' collapsed')}>
      <div className="sidebar-head">
        <span className="sidebar-title">Workspaces</span>
        <div ref={addRef} style={{ position: 'relative' }}>
          <button className="icon-btn" title="Add" onClick={() => setAddMenu((m) => !m)}>＋</button>
          {addMenu && (
            <div className="menu" style={{ right: 0, top: 26 }}>
              <button className="menu-item" onClick={addWorkspace}>＋ New Workspace</button>
              <div className="menu-sep" />
              <div style={{ padding: '4px 9px', fontSize: 11 }} className="muted">
                Use the ＋ on a workspace or project to add a project or board under it.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-scroll">
       <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
        {orderedWorkspaces.map((ws) => {
          const wsKey = 'ws:' + ws.id;
          const wsOpen = expanded[wsKey];
          return (
            <SortableWorkspace id={ws.id} key={ws.id}>
              {(grip) => (
              <div className="tree-ws">
              <div className="tree-row ws-row" onClick={() => toggle(wsKey)}>
                <span className="grip" title="Drag to reorder workspace" {...grip} onClick={(e) => e.stopPropagation()}>⠿</span>
                <span className="twist">{ws.projects.length ? (wsOpen ? '▾' : '▸') : ''}</span>
                <span className="label">{ws.name}</span>
                {ws.is_personal && <span className="badge-personal">PERSONAL</span>}
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  {ws.isOwner && <button className="icon-btn" title="Add project" onClick={() => addProject(ws)}>＋</button>}
                  {ws.isOwner && <button className="icon-btn" title="Share" onClick={() => setShare({ type: 'workspace', id: ws.id, name: ws.name })}>👤</button>}
                  {ws.isOwner && <button className="icon-btn" title="Rename" onClick={() => rename('workspaces', ws.id, ws.name)}>✎</button>}
                  {ws.isOwner && !ws.is_personal && <button className="icon-btn" title="Delete" onClick={() => remove('workspaces', ws.id, ws.name, 'workspace')}>🗑</button>}
                </div>
              </div>

              {wsOpen && (
                <>
                  {ws.projects.length === 0 && <div className="empty-hint">No projects yet</div>}
                  {ws.projects.map((p) => {
                    const prKey = 'pr:' + p.id;
                    const prOpen = expanded[prKey];
                    const canEditProj = p.role === 'owner' || p.role === 'collaborate';
                    return (
                      <div key={p.id}>
                        <div className="tree-row proj-row" onClick={() => toggle(prKey)}>
                          <span className="twist">{p.boards.length ? (prOpen ? '▾' : '▸') : ''}</span>
                          <span className="label">{p.name}</span>
                          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                            {p.role === 'owner' && <button className="icon-btn" title="Add board" onClick={() => addBoard(p)}>＋</button>}
                            {p.role === 'owner' && <button className="icon-btn" title="Share" onClick={() => setShare({ type: 'project', id: p.id, name: p.name })}>👤</button>}
                            {p.role === 'owner' && <button className="icon-btn" title="Rename" onClick={() => rename('projects', p.id, p.name)}>✎</button>}
                            {p.role === 'owner' && <button className="icon-btn" title="Delete" onClick={() => remove('projects', p.id, p.name, 'project')}>🗑</button>}
                          </div>
                        </div>
                        {prOpen &&
                          p.boards.map((b) => (
                            <div
                              key={b.id}
                              className={'tree-row board-row' + (b.id === selectedBoard ? ' active' : '')}
                              onClick={() => onSelectBoard(b.id)}
                            >
                              <span className="label">▦ {b.name}</span>
                              {p.role === 'owner' && (
                                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                  <button className="icon-btn" title="Rename" onClick={() => rename('boards', b.id, b.name)}>✎</button>
                                  <button className="icon-btn" title="Delete" onClick={() => remove('boards', b.id, b.name, 'board')}>🗑</button>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </>
              )}
              </div>
              )}
            </SortableWorkspace>
          );
        })}
        </SortableContext>
       </DndContext>
      </div>

      {share && (
        <ShareDialog
          target={share}
          currentUser={currentUser}
          onClose={() => { setShare(null); reloadTree(); }}
        />
      )}
    </aside>
  );
}

/** Sortable wrapper for a workspace block; exposes drag listeners to a grip handle. */
function SortableWorkspace({
  id,
  children,
}: {
  id: string;
  children: (grip: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>)}
    </div>
  );
}
