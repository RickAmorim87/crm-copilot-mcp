import { z } from 'zod';

export const STATUSES = ['lead', 'active', 'inactive'];

export const customerCreate = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  status: z.enum(STATUSES).default('lead'),
});

export const customerUpdate = customerCreate
  .partial()
  .omit({ status: true })
  .extend({ status: z.enum(STATUSES).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });
