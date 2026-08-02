import { db } from './db.js';

/**
 * Access model
 * ------------
 * Ownership: a user always has full ("owner") rights on resources they own.
 * Sharing: users get "view" or "collaborate" on a Workspace or Project, either
 *   directly (memberships) or via a Group they belong to (group_assignments).
 *
 * Effective role for a Project = strongest of:
 *   - owner of the project or its workspace  -> 'owner'
 *   - workspace-level membership/group role
 *   - project-level membership/group role
 *
 * Visibility:
 *   - Workspace visible if: owned, has workspace membership, OR contains a
 *     visible project.
 *   - Within a workspace, a user sees ALL projects if they own the workspace or
 *     have a workspace-level role; otherwise only projects they own or have a
 *     project-level role on.
 */

export type Role = 'owner' | 'collaborate' | 'view' | null;

const RANK: Record<string, number> = { view: 1, collaborate: 2, owner: 3 };
function strongest(a: Role, b: Role): Role {
  const ra = a ? RANK[a] : 0;
  const rb = b ? RANK[b] : 0;
  return ra >= rb ? a : b;
}

/** All group ids the user belongs to. */
function userGroupIds(userId: string): string[] {
  const rows = db
    .prepare('SELECT group_id FROM group_members WHERE user_id = ?')
    .all(userId) as { group_id: string }[];
  return rows.map((r) => r.group_id);
}

/** Role a user has on a specific resource via direct membership or group. */
function sharedRole(userId: string, type: 'workspace' | 'project', id: string): Role {
  let role: Role = null;
  const direct = db
    .prepare(
      'SELECT role FROM memberships WHERE user_id = ? AND resource_type = ? AND resource_id = ?'
    )
    .get(userId, type, id) as { role: string } | undefined;
  if (direct) role = strongest(role, direct.role as Role);

  const gids = userGroupIds(userId);
  if (gids.length) {
    const placeholders = gids.map(() => '?').join(',');
    const grp = db
      .prepare(
        `SELECT role FROM group_assignments
         WHERE resource_type = ? AND resource_id = ? AND group_id IN (${placeholders})`
      )
      .all(type, id, ...gids) as { role: string }[];
    for (const g of grp) role = strongest(role, g.role as Role);
  }
  return role;
}

export function workspaceRole(userId: string, workspaceId: string): Role {
  const ws = db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as
    | { owner_id: string }
    | undefined;
  if (!ws) return null;
  if (ws.owner_id === userId) return 'owner';
  return sharedRole(userId, 'workspace', workspaceId);
}

export function projectRole(userId: string, projectId: string): Role {
  const proj = db
    .prepare('SELECT workspace_id, owner_id FROM projects WHERE id = ?')
    .get(projectId) as { workspace_id: string; owner_id: string } | undefined;
  if (!proj) return null;
  if (proj.owner_id === userId) return 'owner';
  const wsRole = workspaceRole(userId, proj.workspace_id);
  const pRole = sharedRole(userId, 'project', projectId);
  return strongest(wsRole, pRole);
}

export function boardRole(userId: string, boardId: string): Role {
  const b = db.prepare('SELECT project_id FROM boards WHERE id = ?').get(boardId) as
    | { project_id: string }
    | undefined;
  if (!b) return null;
  return projectRole(userId, b.project_id);
}

export function taskProjectRole(userId: string, taskId: string): Role {
  const t = db.prepare('SELECT board_id FROM tasks WHERE id = ?').get(taskId) as
    | { board_id: string }
    | undefined;
  if (!t) return null;
  return boardRole(userId, t.board_id);
}

export function canEdit(role: Role): boolean {
  return role === 'owner' || role === 'collaborate';
}
export function canView(role: Role): boolean {
  return role !== null;
}
export function isOwner(role: Role): boolean {
  return role === 'owner';
}

/** Which project ids inside a workspace are visible to the user. */
export function visibleProjectIds(userId: string, workspaceId: string): string[] {
  const all = db
    .prepare('SELECT id FROM projects WHERE workspace_id = ? ORDER BY position, created_at')
    .all(workspaceId) as { id: string }[];
  const wsRole = workspaceRole(userId, workspaceId);
  if (wsRole) return all.map((p) => p.id); // workspace access -> all projects
  return all.filter((p) => projectRole(userId, p.id) !== null).map((p) => p.id);
}

/** All workspace ids visible to the user (owned, shared, or containing a shared project). */
export function visibleWorkspaceIds(userId: string): string[] {
  const ids = new Set<string>();

  // owned
  for (const r of db
    .prepare('SELECT id FROM workspaces WHERE owner_id = ?')
    .all(userId) as { id: string }[])
    ids.add(r.id);

  // direct workspace memberships
  for (const r of db
    .prepare("SELECT resource_id FROM memberships WHERE user_id = ? AND resource_type = 'workspace'")
    .all(userId) as { resource_id: string }[])
    ids.add(r.resource_id);

  // group workspace assignments
  const gids = userGroupIds(userId);
  if (gids.length) {
    const ph = gids.map(() => '?').join(',');
    for (const r of db
      .prepare(
        `SELECT resource_id FROM group_assignments WHERE resource_type='workspace' AND group_id IN (${ph})`
      )
      .all(...gids) as { resource_id: string }[])
      ids.add(r.resource_id);
  }

  // workspaces reachable through a shared project
  const sharedProjectIds = new Set<string>();
  for (const r of db
    .prepare("SELECT id FROM projects WHERE owner_id = ?")
    .all(userId) as { id: string }[])
    sharedProjectIds.add(r.id);
  for (const r of db
    .prepare("SELECT resource_id FROM memberships WHERE user_id = ? AND resource_type='project'")
    .all(userId) as { resource_id: string }[])
    sharedProjectIds.add(r.resource_id);
  if (gids.length) {
    const ph = gids.map(() => '?').join(',');
    for (const r of db
      .prepare(
        `SELECT resource_id FROM group_assignments WHERE resource_type='project' AND group_id IN (${ph})`
      )
      .all(...gids) as { resource_id: string }[])
      sharedProjectIds.add(r.resource_id);
  }
  for (const pid of sharedProjectIds) {
    const p = db.prepare('SELECT workspace_id FROM projects WHERE id = ?').get(pid) as
      | { workspace_id: string }
      | undefined;
    if (p) ids.add(p.workspace_id);
  }

  return [...ids];
}
