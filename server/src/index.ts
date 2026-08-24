import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './db.js'; // initialize schema on boot

import authRoutes from './routes/auth.js';
import treeRoutes from './routes/tree.js';
import taskRoutes from './routes/tasks.js';
import sharingRoutes from './routes/sharing.js';
import todoRoutes from './routes/todos.js';
import attachmentRoutes from './routes/attachments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();
// In production this single service serves everything on the platform's PORT
// (e.g. Render). In dev the API uses API_PORT (4000) so an ambient PORT from a
// harness can't collide with the Vite client on 5173.
const PORT = isProd ? Number(process.env.PORT) || 4000 : Number(process.env.API_PORT) || 4000;

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)) {
  console.warn('[warn] JWT_SECRET is unset or weak in production — set a strong secret.');
}

app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'atheon' }));

app.use('/api/auth', authRoutes);
app.use('/api', treeRoutes);
app.use('/api', taskRoutes);
app.use('/api', sharingRoutes);
app.use('/api', todoRoutes);
app.use('/api', attachmentRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Serve the built client (single origin) when a build exists. In local dev the
// client is served separately by Vite on 5173, so we show a pointer page instead.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const indexHtml = path.join(clientDist, 'index.html');

if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API GET returns index.html
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(indexHtml));
} else {
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
  app.get('/', (_req, res) => {
    res
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Atheon API</title>
         <div style="font-family:system-ui,Segoe UI,Arial;background:#131518;color:#dce0e5;
         min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;text-align:center">
           <div>
             <div style="font-weight:800;letter-spacing:4px;color:#ECA85A;font-size:22px">ATHEON API</div>
             <p style="color:#9ba1a9">This is the backend API. The app lives here:</p>
             <p><a href="${CLIENT_URL}" style="color:#ECA85A;font-size:18px;font-weight:700">${CLIENT_URL}</a></p>
           </div>
         </div>`
      );
  });
}

app.listen(PORT, () => {
  console.log(`\n  Atheon ${isProd ? 'server' : 'API'} running on port ${PORT}\n`);
});
