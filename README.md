# Atheon

A streamlined project-management tool — the core of Trello/Asana without the bloat.
Data is organised as **Workspace → Project → Board → Task → Subtask**, with real
multi-user sharing, three board views, and a private to-do list.

Named after the Vex boss from *Destiny*; the mark is a low-profile geometric hexagon
with a glowing core.

## Stack

| Layer    | Tech |
|----------|------|
| Client   | React 18 + TypeScript + Vite, `@dnd-kit` for drag-and-drop |
| Server   | Node + Express + TypeScript (run via `tsx`) |
| Database | SQLite via Node's built-in `node:sqlite` (no native build step) |
| Auth     | Email + password, bcrypt hashing, JWT in an httpOnly cookie |

## Getting started

```bash
npm install      # installs client + server (npm workspaces)
npm run dev      # starts the API (:4000) and the Vite client (:5173) together
```

Then open **http://localhost:5173** and sign up. Each new account automatically gets
a **Personal** workspace.

Run pieces individually if you prefer:

```bash
npm run dev:server   # API only, http://localhost:4000
npm run dev:client   # client only, http://localhost:5173 (proxies /api to :4000)
```

The SQLite file is created at `server/data/atheon.db`. Delete that folder to reset all data.

## Deploying

In production the server also serves the built React client, so it's a single Node
service on one URL (`npm run build` then `npm run start`). Two documented paths:

- **[Free — Google Cloud "Always Free" VM](docs/deploy-gcp-vm.md)** — reliably available
  `e2-micro`, runs the app as-is (SQLite on a real disk), always-on, automatic HTTPS. One-shot
  bootstrap: `sudo bash deploy/setup.sh <your-hostname>`.
- **[Free — Oracle Cloud "Always Free" VM](docs/deploy-oracle-vm.md)** — same idea on Oracle's
  ARM shape (note: free ARM capacity is often unavailable).
- **[Paid — Render](docs/deploy-render.md)** (~$7/mo) — managed blueprint ([`render.yaml`](render.yaml))
  with a persistent disk. Click-to-deploy, no server to manage.

## Feature map (from the requirements)

- **Hierarchy** — Workspace › Project › Board › Task › Subtask, all created from the left sidebar.
- **Sign up** — email + first/last name (no usernames); auto-created Personal workspace.
- **Sharing** — add users to a Workspace or Project as **View** or **Collaborate**; visibility
  cascades (workspace access → all projects; project access → that project + its workspace shell).
- **Groups** — bundle users and assign a whole group to a Workspace/Project.
- **Header** — minimal, low-profile Atheon (Vex) logo + your avatar.
- **Left sidebar** — collapsible tree; `＋` to add workspaces/projects/boards; rename, delete, share.
- **Main section** — **Kanban / Table / Timeline** views; filter by assignee, tag, and due-date range;
  colour-code by assignee or tag; subtasks nested under parents; dependency groups drawn with a border.
- **Task modal** — name, description, due date, assignee, priority, dependency, completion, tags,
  subtasks, and a discussion/comment stream.
- **Right sidebar** — private single-column to-do list; checking an item greys it out and it drops
  off the list on the next load.

## Project layout

```
server/src
  db.ts          schema + SQLite connection
  auth.ts        password hashing, JWT, requireAuth
  access.ts      sharing/visibility + role resolution
  routes/        auth, tree, tasks, sharing, todos
client/src
  App.tsx        session + top-level layout
  board-utils.ts filtering, dependency grouping, colour coding
  components/     Sidebar, Header, BoardView + Kanban/Table/Timeline, TaskModal, ShareDialog, TodoSidebar
```
