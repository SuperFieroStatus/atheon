import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { User, WorkspaceNode } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BoardArea } from './components/BoardView';
import { TodoSidebar } from './components/TodoSidebar';
import { UserSettings } from './components/UserSettings';
import { GroupsDialog } from './components/GroupsDialog';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [todoOpen, setTodoOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

  // bootstrap session
  useEffect(() => {
    api.get('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loadTree = useCallback(async () => {
    const { workspaces } = await api.get('/tree');
    setTree(workspaces);
    // auto-select first board if nothing chosen
    setSelectedBoard((cur) => {
      if (cur && boardExists(workspaces, cur)) return cur;
      for (const ws of workspaces)
        for (const p of ws.projects)
          if (p.boards.length) return p.boards[0].id;
      return null;
    });
  }, []);

  useEffect(() => {
    if (user) loadTree();
  }, [user, loadTree]);

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
    setTree([]);
    setSelectedBoard(null);
  }

  if (loading) {
    return (
      <div className="center-fill" style={{ height: '100%' }}>
        <div className="spin" />
      </div>
    );
  }

  if (!user) return <AuthScreen onAuthed={setUser} />;

  return (
    <div className="app">
      <Header
        user={user}
        onLogout={logout}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenGroups={() => setGroupsOpen(true)}
      />
      <div className="workarea">
        <Sidebar
          tree={tree}
          reloadTree={loadTree}
          selectedBoard={selectedBoard}
          onSelectBoard={setSelectedBoard}
          open={sidebarOpen}
          currentUser={user}
        />
        <button
          className="edge-toggle left"
          style={{ left: sidebarOpen ? 280 : 0 }}
          onClick={() => setSidebarOpen((s) => !s)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? '‹' : '›'}
        </button>
        <BoardArea
          boardId={selectedBoard}
          currentUser={user}
          onStructureChange={loadTree}
        />
        <button
          className="edge-toggle right"
          style={{ right: todoOpen ? 300 : 0 }}
          onClick={() => setTodoOpen((s) => !s)}
          title={todoOpen ? 'Hide To-Do list' : 'Show To-Do list'}
          aria-label={todoOpen ? 'Hide To-Do list' : 'Show To-Do list'}
        >
          {todoOpen ? '›' : '‹'}
        </button>
        <TodoSidebar open={todoOpen} tz={user.timezone} />
      </div>

      {settingsOpen && (
        <UserSettings
          user={user}
          onUpdated={setUser}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {groupsOpen && <GroupsDialog onClose={() => setGroupsOpen(false)} />}
    </div>
  );
}

function boardExists(tree: WorkspaceNode[], boardId: string): boolean {
  return tree.some((ws) => ws.projects.some((p) => p.boards.some((b) => b.id === boardId)));
}
