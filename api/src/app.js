import express from 'express';
import { createAuth } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import { HttpError } from './errors.js';
import * as s from './schemas.js';

const parse = (schema, data) => {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, 'Validation failed', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  return r.data;
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function createApp({ config, repo }) {
  const app = express();
  const auth = createAuth(config);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post(
    '/auth/login',
    createRateLimiter({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.loginMax, keyFn: (r) => `ip:${r.ip}` }),
    wrap((req, res) => {
      const { username, password } = parse(s.loginBody, req.body);
      res.json(auth.login(username, password));
    }),
  );

  const api = express.Router();
  api.use(
    auth.authenticate,
    // Rate limit per authenticated identity, so one noisy agent cannot starve others.
    createRateLimiter({ ...config.rateLimit, keyFn: (r) => `p:${r.principal.name}` }),
  );

  api.get('/', auth.requireScope('customers:read'), wrap(async (req, res) => {
    res.json(await repo.list(parse(s.listQuery, req.query)));
  }));
  api.get('/stats', auth.requireScope('customers:read'), wrap(async (_req, res) => res.json(await repo.stats())));
  api.get('/:id', auth.requireScope('customers:read'), wrap(async (req, res) => {
    const c = await repo.get(req.params.id);
    if (!c) throw new HttpError(404, 'Customer not found');
    res.json(c);
  }));
  api.post('/', auth.requireScope('customers:write'), wrap(async (req, res) => {
    res.status(201).json(await repo.create(parse(s.customerCreate, req.body)));
  }));
  api.put('/:id', auth.requireScope('customers:write'), wrap(async (req, res) => {
    const c = await repo.update(req.params.id, parse(s.customerUpdate, req.body));
    if (!c) throw new HttpError(404, 'Customer not found');
    res.json(c);
  }));
  api.delete('/:id', auth.requireScope('customers:delete'), wrap(async (req, res) => {
    if (!(await repo.remove(req.params.id))) throw new HttpError(404, 'Customer not found');
    res.status(204).end();
  }));
  app.use('/customers', api);

  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message, details: err.details });
  });
  return app;
}
