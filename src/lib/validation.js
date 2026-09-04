import { z } from 'zod';
import { isRenderableSignature } from './signature';

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
    age: z.preprocess(emptyToUndefined, z.coerce.number('Type an age.').int('Whole numbers only.').min(0, 'An age cannot be negative.').max(120, 'That age is not plausible.').optional()),
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
  age: z.preprocess(emptyToUndefined, z.coerce.number('Type an age.').int('Whole numbers only.').min(0, 'An age cannot be negative.').max(120, 'That age is not plausible.').optional()),
  site: z.string().min(1, 'Please select a Site.'),
});

// A roster row is a child at a site, so its numbers have the range a child has.
// Unbounded, this accepted a position of -5 and an age of -3 and printed them on
// a claim.
const mealRowSchema = z.tuple([
  z.coerce.number().int().min(0, 'A roster position cannot be negative.'), // number
  z.string().trim().min(1, 'A roster row needs a name.').max(120, 'That name is too long.'), // name
  z.union([
    z.coerce.number().int().min(0, 'An age cannot be negative.').max(120, 'That age is not plausible.'),
    z.literal(''),
  ]), // age (may arrive '')
  z.boolean(), // attendance
  z.boolean(), // breakfast
  z.boolean(), // lunch
  z.boolean(), // snack
  z.boolean(), // supper
]);

// The biggest real roster is about 250 names and the roster importer already
// refuses more than a thousand. Without a ceiling here a single submission wrote
// three thousand rows to a site that has thirteen.
const MAX_ROSTER_ROWS = 1000;
// The same ceiling the public claim signature carries. A drawn signature is tens
// of kilobytes; without a limit a 3 MB blob went straight into the row.
const MAX_SIGNATURE_CHARS = 400_000;

export const mealCountSchema = z.object({
  actionType: z.literal('mealCount').optional(),
  values: z.object({
    data: z
      .array(mealRowSchema)
      .min(1, 'No students in the submission.')
      .max(MAX_ROSTER_ROWS, 'That is more students than any roster has.'),
    date: z.string().min(1, 'Date is required.'),
    timeIn: z.string().min(1, 'Time In is required.'),
    timeOut: z.string().min(1, 'Time Out is required.'),
    signature: z
      .string()
      .min(1, 'Signature is required.')
      .max(MAX_SIGNATURE_CHARS, 'That signature is too large.')
      .refine(isRenderableSignature, 'That signature did not come through. Draw it again.'),
    site: z.string().min(1, 'Site is required.'),
  }),
});

export const requestSchema = z.object({
  requestType: z.enum(REQUEST_TYPES, { error: 'Pick one of the request types.' }),
  amount: z.preprocess(
    emptyToUndefined,
    z.coerce.number('Type a number.').int('Whole numbers only.').positive('It has to be more than zero.').optional()
  ),
  time: z.preprocess(emptyToUndefined, z.string().optional()),
  // The number says how many; this says what. Optional, because a request for
  // twelve condiments explains itself.
  note: z.string().trim().max(600, 'Keep it under 600 characters.').default(''),
  selectedSite: z.string().min(1, 'Please select a Site.'),
});

export const requestStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED'], { error: 'That is not one of the three states.' }),
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

// The two states the program files claims under.
//
// This was free text, and that is enough on its own to lose a site from a claim.
// The backend selects a claim's sites with an EXACT match on this column while
// every screen normalizes it for display, so a site saved as "tx" appeared as TX
// in the checklist and was silently absent from the PDF - 42 promised, 41
// printed. It is the same divergence the name-parsing fix was meant to close,
// arriving through the column instead of the name. One canonical value on the
// way in is what keeps the two sides from drifting again.
//
// The empty string stays legal on update because a site can genuinely belong to
// no claim - the training site does - and the claim screen already says so.
// Creating one that way is not allowed: that is how a real site goes missing.
export const SITES_STATES = ['TX', 'OK'];
const stateRequired = z.string().trim().toUpperCase().pipe(z.enum(SITES_STATES, { error: 'Pick TX or OK.' }));
const stateOptional = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum([...SITES_STATES, ''], { error: 'A site is in TX, in OK, or in no claim at all.' }));

const siteFields = {
  // The full legacy name with its school-year prefix: it is the identity every
  // screen shows and every URL carries.
  name: z.string().trim().min(3, 'The full site name is required.').max(200),
  state: stateOptional.optional(),
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
    state: stateRequired,
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
  // The same check the daily count uses. The prefix alone said nothing about
  // whether the bytes decode, and this is the signature on the document with the
  // most legal weight in the app - the one place where an unrenderable image
  // would be discovered by the claim failing to build.
  signature: z
    .string()
    .startsWith('data:image/png;base64,', 'A signature is required.')
    .max(400_000)
    .refine(isRenderableSignature, 'That signature did not come through. Sign again.'),
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
