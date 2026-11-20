import http from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import system from '../system.config';
import { validateSystem } from '../shared/validate';
import { initDb } from './db';
import { authRoutes, requireUser, teamRoutes } from './auth';
import { crudRoutes } from './crud';
import { dashboardRoutes } from './dashboard';
import { registerCustom } from './custom';

const problems = validateSystem(system);
if (problems.length) {
  console.error(`\nsystem.config.ts has ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
initDb();

const app = express();
app.use(express.json({ limit: '1mb' }));
authRoutes(app);
app.use('/api', requireUser);
teamRoutes(app);
dashboardRoutes(app);
// Custom GET routes are noted so that `npm run verify` can exercise them too.
const customGets: string[] = [];
registerCustom(new Proxy(app, {
  get(target, prop, receiver) {
    const v = Reflect.get(target, prop, receiver);
    if (prop !== 'get') return typeof v === 'function' ? v.bind(target) : v;
    return (path: unknown, ...handlers: unknown[]) => {
      if (typeof path === 'string' && handlers.length) customGets.push(path);
      return (target as any).get(path, ...handlers);
    };
  },
}) as Express);
if (process.env.VERIFY) app.get('/api/__custom', (_req, res) => res.json(customGets));
crudRoutes(app);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT ?? 5173);
const server = http.createServer(app);
if (process.env.NODE_ENV === 'production' || process.env.API_ONLY) {
  const dist = path.resolve('dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

server.listen(port, () => console.log(`${system.name} is running at http://localhost:${port}`));
