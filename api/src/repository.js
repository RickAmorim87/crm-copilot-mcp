import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const matches = (c, { q, status }) =>
  (!status || c.status === status) &&
  (!q || [c.name, c.email, c.company].some((f) => f?.toLowerCase().includes(q.toLowerCase())));

const stats = (all) => ({
  total: all.length,
  byStatus: all.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {}),
});

const SEED = [
  { name: 'Ana Souza', email: 'ana@acme.com', company: 'Acme', phone: '+55 31 99999-0001', status: 'active' },
  { name: 'Bruno Lima', email: 'bruno@globex.com', company: 'Globex', status: 'lead' },
  { name: 'Carla Mendes', email: 'carla@initech.com', company: 'Initech', status: 'inactive' },
];

export function createMemoryRepository({ seed = true } = {}) {
  const items = new Map();
  const now = () => new Date().toISOString();
  const emailTaken = (email, exceptId) =>
    [...items.values()].some((c) => c.email === email && c.id !== exceptId);

  const repo = {
    async list(filter) {
      return [...items.values()].filter((c) => matches(c, filter)).slice(0, filter.limit ?? 50);
    },
    async get(id) {
      return items.get(id) ?? null;
    },
    async create(data) {
      if (emailTaken(data.email)) throw new HttpError(409, 'Email already registered');
      const c = { id: crypto.randomUUID(), ...data, createdAt: now(), updatedAt: now() };
      items.set(c.id, c);
      return c;
    },
    async update(id, patch) {
      const cur = items.get(id);
      if (!cur) return null;
      if (patch.email && emailTaken(patch.email, id)) throw new HttpError(409, 'Email already registered');
      const next = { ...cur, ...patch, updatedAt: now() };
      items.set(id, next);
      return next;
    },
    async remove(id) {
      return items.delete(id);
    },
    async stats() {
      return stats([...items.values()]);
    },
  };
  if (seed) SEED.forEach((s) => items.set((s.id = crypto.randomUUID()), { ...s, createdAt: now(), updatedAt: now() }));
  return repo;
}

export async function createMongoRepository({ uri, dbName }) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection('customers');
  await col.createIndex({ email: 1 }, { unique: true });
  const strip = (d) => (d ? (({ _id, ...rest }) => rest)(d) : null);
  const now = () => new Date().toISOString();

  return {
    async list({ q, status, limit = 50 }) {
      const f = {};
      if (status) f.status = status;
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        f.$or = [{ name: rx }, { email: rx }, { company: rx }];
      }
      return (await col.find(f).limit(limit).toArray()).map(strip);
    },
    async get(id) {
      return strip(await col.findOne({ id }));
    },
    async create(data) {
      const c = { id: crypto.randomUUID(), ...data, createdAt: now(), updatedAt: now() };
      try {
        await col.insertOne({ ...c });
      } catch (e) {
        if (e.code === 11000) throw new HttpError(409, 'Email already registered');
        throw e;
      }
      return c;
    },
    async update(id, patch) {
      try {
        const r = await col.findOneAndUpdate(
          { id },
          { $set: { ...patch, updatedAt: now() } },
          { returnDocument: 'after' },
        );
        return strip(r);
      } catch (e) {
        if (e.code === 11000) throw new HttpError(409, 'Email already registered');
        throw e;
      }
    },
    async remove(id) {
      return (await col.deleteOne({ id })).deletedCount > 0;
    },
    async stats() {
      return stats(await col.find({}).project({ status: 1 }).toArray());
    },
    close: () => client.close(),
  };
}
