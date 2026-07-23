import { z } from 'zod';

export const REQUEST_TYPES = [
  'Sporks',
  'Meal Increase',
  'Meal Decrease',
  'Change approved meal service time',
  'Condiments',
  'Special Meals',
  'Dietary Restrictions',
  'Amount of milk on hand',
];

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

export const loginSchema = z.object({
  actionType: z.literal('login').optional(),
  email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email.')),
  password: z.string().min(1, 'Password is required.'),
});

// Accepts both the clean shape and the legacy {actionType:'add', values:[...]}.
export function normalizeAddStudentBody(body) {
  if (Array.isArray(body?.values)) {
    const [name, age, site, birthdate] = body.values;
    return { name, age, site, birthdate };
  }
  return body;
}

export const addStudentSchema = z
  .object({
    name: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().replace(/\s{2,}/g, ' ') : v),
      z.string().min(1, 'Please enter a name.')
    ),
    age: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(120).optional()),
    site: z.string().min(1, 'Please select a Site.'),
    birthdate: z.preprocess(
      emptyToUndefined,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid birthdate.').optional()
    ),
  })
  .refine((data) => data.age !== undefined || data.birthdate, {
    message: 'Please enter either an age or a birthdate.',
    path: ['age'],
  });

export const editStudentSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(/\s{2,}/g, ' ') : v),
    z.string().min(1, 'Please enter a name.')
  ),
  age: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(120).optional()),
  site: z.string().min(1, 'Please select a Site.'),
});

const mealRowSchema = z.tuple([
  z.coerce.number().int(), // number
  z.string(), // name
  z.union([z.coerce.number(), z.literal('')]), // age (may arrive '')
  z.boolean(), // attendance
  z.boolean(), // breakfast
  z.boolean(), // lunch
  z.boolean(), // snack
  z.boolean(), // supper
]);

export const mealCountSchema = z.object({
  actionType: z.literal('mealCount').optional(),
  values: z.object({
    data: z.array(mealRowSchema).min(1, 'No students in the submission.'),
    date: z.string().min(1, 'Date is required.'),
    timeIn: z.string().min(1, 'Time In is required.'),
    timeOut: z.string().min(1, 'Time Out is required.'),
    signature: z.string().min(1, 'Signature is required.'),
    site: z.string().min(1, 'Site is required.'),
  }),
});

export const requestSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  amount: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  time: z.preprocess(emptyToUndefined, z.string().optional()),
  selectedSite: z.string().min(1, 'Please select a Site.'),
});

export const requestStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']),
});

export const serviceDaysPutSchema = z.object({
  days: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date.'),
      brk: z.boolean().default(false),
      lunch: z.boolean().default(false),
      snk: z.boolean().default(false),
      sup: z.boolean().default(false),
    })
  ),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
});
