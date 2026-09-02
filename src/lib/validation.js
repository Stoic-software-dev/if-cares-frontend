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
  // The number says how many; this says what. Optional, because a request for
  // twelve condiments explains itself.
  note: z.string().trim().max(600, 'Keep it under 600 characters.').default(''),
  selectedSite: z.string().min(1, 'Please select a Site.'),
});

export const requestStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']),
  // What the administrator answers when resolving. Optional, because moving a
  // request to In Progress does not need an explanation.
  responseComment: z.string().trim().max(1000).optional(),
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

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date.');

// Closing a month across every site used to be two requests per site, run one
// after the other. This is the whole operation in one call.
export const closeDaysSchema = z.object({
  sites: z.array(z.string().min(1)).min(1, 'Pick at least one site.').max(500),
  from: ymd,
  to: ymd,
});

// The days a close removed, handed back so it can be undone.
export const restoreDaysSchema = z.object({
  days: z
    .array(
      z.object({
        site: z.string().min(1),
        date: ymd,
        brk: z.boolean().default(false),
        lunch: z.boolean().default(false),
        snk: z.boolean().default(false),
        sup: z.boolean().default(false),
      })
    )
    .min(1)
    .max(20000),
});

// Short limits on purpose: this is the one endpoint a signed out caller can
// write to, so nothing here is allowed to be big.
export const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().trim().max(4000).optional(),
  pathname: z.string().trim().max(300).optional(),
  source: z.enum(['boundary', 'window', 'promise']).optional(),
});

const dayMealsSchema = z.object({
  brk: z.boolean().default(false),
  lunch: z.boolean().default(false),
  snk: z.boolean().default(false),
  sup: z.boolean().default(false),
});

// Every weekday optional: a site that only serves Monday to Friday sends five
// keys, not seven. A record keyed by an enum would demand all of them.
const weeklyTemplateSchema = z.object({
  mon: dayMealsSchema.optional(),
  tue: dayMealsSchema.optional(),
  wed: dayMealsSchema.optional(),
  thu: dayMealsSchema.optional(),
  fri: dayMealsSchema.optional(),
  sat: dayMealsSchema.optional(),
  sun: dayMealsSchema.optional(),
});

const siteFields = {
  // The full legacy name with its school-year prefix: it is the identity every
  // screen shows and every URL carries.
  name: z.string().trim().min(3, 'The full site name is required.').max(200),
  state: z.string().trim().max(10).optional(),
  ceName: z.string().trim().max(200).optional(),
  ceId: z.string().trim().max(50).optional(),
  siteName: z.string().trim().max(200).optional(),
  siteNumber: z.string().trim().max(50).optional(),
  programStart: z.union([ymd, z.literal('')]).optional(),
  programEnd: z.union([ymd, z.literal('')]).optional(),
  // The window inside which this site is chased about missing counts. It came
  // from the master spreadsheet's `Reminders` tab and, until now, from nowhere
  // else: the reminder route read it and no screen could write it. That is fine
  // while the Sheets are alive and a one way door the moment they are frozen.
  reminderStart: z.union([ymd, z.literal('')]).optional(),
  reminderEnd: z.union([ymd, z.literal('')]).optional(),
  weeklyTemplate: weeklyTemplateSchema.optional(),
};

export const siteCreateSchema = z
  .object({
    ...siteFields,
    // Required only here, not on update: the worst bug this app has shipped
    // was a claim silently dropping sites whose state column was never filled
    // in. That happened through a bulk import, not this form, but the form is
    // the only thing standing between a typo and the same failure recurring -
    // an empty state is invisible in the UI (the badge falls back to parsing
    // the name) right up until a claim quietly excludes the site.
    state: z.string().trim().min(1, 'Pick TX or OK.').max(10),
  })
  .refine(
    (value) => !value.programStart || !value.programEnd || value.programStart <= value.programEnd,
    { message: 'The program ends before it starts.', path: ['programEnd'] }
  )
  .refine(
    (value) => !value.reminderStart || !value.reminderEnd || value.reminderStart <= value.reminderEnd,
    { message: 'The reminder window ends before it starts.', path: ['reminderEnd'] }
  );

export const siteUpdateSchema = z
  .object({ ...siteFields, name: siteFields.name.optional(), active: z.boolean().optional() })
  .refine(
    (value) => !value.programStart || !value.programEnd || value.programStart <= value.programEnd,
    { message: 'The program ends before it starts.', path: ['programEnd'] }
  )
  .refine(
    (value) => !value.reminderStart || !value.reminderEnd || value.reminderStart <= value.reminderEnd,
    { message: 'The reminder window ends before it starts.', path: ['reminderEnd'] }
  );

const holidayFields = {
  name: z.string().trim().min(2, 'Give the holiday a name.').max(120),
  startDate: ymd,
  endDate: ymd,
  allSites: z.boolean().default(true),
  // A holiday over the whole day, or only over the meals flagged below.
  allMeals: z.boolean().default(true),
  brk: z.boolean().optional(),
  lunch: z.boolean().optional(),
  snk: z.boolean().optional(),
  sup: z.boolean().optional(),
  sites: z.array(z.string().min(1)).max(500).optional(),
};

export const holidayCreateSchema = z.object(holidayFields).refine(
  (value) => value.allMeals || value.brk || value.lunch || value.snk || value.sup,
  { message: 'Pick at least one meal, or apply it to the whole day.', path: ['allMeals'] }
);

export const holidayUpdateSchema = z.object({
  ...holidayFields,
  name: holidayFields.name.optional(),
  startDate: ymd.optional(),
  endDate: ymd.optional(),
  allSites: z.boolean().optional(),
  allMeals: z.boolean().optional(),
});

export const consolidatedSchema = z.object({
  kind: z.enum(['claim-part1', 'claim-part2']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  state: z.string().trim().max(10).optional(),
  // Sites left out of this claim, by name, with the guarantee below that at
  // least one remains.
  excludeSites: z.array(z.string().min(1)).max(500).optional(),
  title: z.string().trim().max(120).optional(),
});

export const signReportSchema = z.object({
  signature: z.string().startsWith('data:image/png;base64,', 'A signature is required.').max(400_000),
  signedBy: z.string().trim().min(2, 'Type the name of whoever is signing.').max(120),
  title: z.string().trim().max(120).optional(),
});

// Approving or undoing an approval: the day is the whole request.
export const approveCountSchema = z.object({
  site: z.string().trim().min(1, 'Pick a site.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
});

export const voidCountSchema = z.object({
  site: z.string().min(1),
  date: ymd,
  reason: z.string().trim().min(3, 'Say why in a few words.').max(300),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
});
