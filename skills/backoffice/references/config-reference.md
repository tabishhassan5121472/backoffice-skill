# `system.config.ts` reference

One default export built with `defineSystem({...})`. The types live in `shared/types.ts`; the server
checks the file on start and lists every problem in plain language. `system.config.ts` in a fresh project
is a small complete example worth reading once.

```ts
import { defineSystem } from './shared/types';

export default defineSystem({
  name: 'GymWren',                    // product name
  tagline: 'Memberships, classes and billing for independent gyms.',
  accent: '#0f766e',                  // 6-digit hex
  currency: 'USD',                    // ISO code, used for every money field
  roles: [...], tenants: [...], entities: [...], dashboard: [...],
});
```

## roles
```ts
roles: [
  { name: 'owner', label: 'Owner', description: 'Sees and changes everything.' },   // first = owner
  { name: 'front_desk', label: 'Front desk', description: 'Checks members in and takes payments.' },
]
```
The first role always has full access and is the only one that sees Team and the Activity log. Names are
snake_case. A demo account is created for every role in every tenant.

## tenants
```ts
tenants: [{ name: 'Ironside Fitness', slug: 'ironside' }, { name: 'Northgate Gym', slug: 'northgate' }]
```
Two is the right number: it shows that organisations are isolated. Each gets its own demo data.
Demo sign-ins are `<role>@<slug>.demo` (underscores in the role become dots).

## entities
Order matters: a `ref` field may only point to an entity defined earlier (or to itself).

```ts
{
  name: 'members',            // snake_case plural; also the URL and table name
  label: 'Members',
  singular: 'Member',
  icon: 'Users',              // any lucide icon name in PascalCase
  group: 'People',            // sidebar heading; entities with the same group sit together
  title: 'name',              // the field shown when another record links to this one
  fields: [...],
  status: {...},              // optional lifecycle
  permissions: {...},         // optional
  seed: 40,                   // demo rows per tenant, or an array of exact rows
}
```
`id`, `tenant_id`, `created_at` and `updated_at` are added automatically. Do not declare them.

### fields
```ts
{ name: 'email', type: 'email', required: true, label: 'Email address', seed: 'email' }
```

| type | stored as | form input |
|---|---|---|
| `text`, `longtext` | text | one line / text area |
| `number`, `money` | number | number (money is shown in the system currency) |
| `date` | `YYYY-MM-DD` | date picker |
| `datetime` | ISO timestamp | date and time picker |
| `boolean` | 0 / 1 | checkbox |
| `select` | one of `options: [...]` | dropdown |
| `email`, `phone` | text | validated email / phone |
| `ref` | id of a row in `ref: '<entity>'` | dropdown of that entity's titles |

Other field options:

- `required: true`
- `label`: defaults to the name in title case (`client_id` becomes "Client")
- `list: true | false`: show as a table column. By default the first five fields are shown.
- `filter: true`: adds a dropdown filter above the table (`select`, `boolean` and `ref` fields)
- `hideFrom: ['role']`: the field does not exist for those roles (table, record page, form, export, API)
- `seed`: how to make demo values (below)
- `compute: 'hours * rate'`: a calculated, read-only field. It is worked out on every save, never typed.
  See "Expressions" below.
- `auto: 'BK-{seq:5}'`: a read-only code filled in when the record is created (text fields only). Use it
  as the `title` of records that have no natural name (bookings, invoices, tickets), so staff never have
  to invent a reference.

### seed values
| seed | gives |
|---|---|
| `'name'`, `'firstName'`, `'lastName'` | a person's name |
| `'company'` | a company name |
| `'email'` | an email built from the name earlier in the same row |
| `'phone'`, `'address'`, `'city'` | what they say |
| `'sentence'`, `'paragraph'` | a short realistic note |
| `{ pick: ['A', 'B'], weights: [3, 1] }` | one of the values (weights optional) |
| `{ int: [1, 20] }` | a whole number in the range |
| `{ money: [20, 400] }` | an amount in the range |
| `{ days: [-60, 0] }` | a date that many days from today (negative is the past). Works for `date` and `datetime`. |
| `{ template: 'INV-{seq:4}' }` | `INV-0001`, `INV-0002`, ... (prefer `auto` on the field for codes) |
| `{ digits: 6 }` | six random digits, as text |
| `{ after: 'issued', days: [14, 30] }` | a date that many days after another date in the row. The other date may be on a linked record: `'class_id.starts_at'`. Negative days mean before. |
| `{ after: 'issued', days: [0, 12], notAfter: 'today' }` | the same, but never in the future (payment dates, check-out stamps) |
| `{ ref: { status: 'returned' } }` | for `ref` fields: link only to rows that match (same syntax as a dashboard `where`). "Invoices only for returned bookings." |
| `{ calc: 'plan_id.price' }` | the result of an expression: a linked record's value, or arithmetic |
| `{ when: "status == 'paid'", then: {...}, else: {...} }` | one seed or another depending on the row. Without `else` the field stays empty. |

Without a `seed`, each type has a sensible default (`ref` picks a random existing row, `select` picks an
option, `date` is in the last 90 days), but `text` becomes "Label 1", "Label 2", so always give text
fields a `seed`.

### Making demo data hold together
People spot nonsense in seconds, so link values instead of generating each one alone:

```ts
{ name: 'issued', type: 'date', seed: { days: [-60, 0] } },
{ name: 'due', type: 'date', seed: { after: 'issued', days: [14, 14] } },                       // always 14 days later
{ name: 'paid_on', type: 'date', seed: { when: "status == 'paid'", then: { after: 'issued', days: [0, 12] } } },
{ name: 'amount', type: 'money', seed: { calc: 'member_id.plan_id.price' } },                    // the real plan price
{ name: 'booked_at', type: 'datetime', seed: { after: 'class_id.starts_at', days: [-9, -1] } }, // booked before the class
```
A field may depend on any other field of its row, in any order, including the status. Two fields must
not depend on each other. `calc` also works on text and on `ref` fields (`room_id: { calc: 'reservation_id.room_id' }`
copies the link), and `when` can be nested inside `else`.

An optional `ref` without a seed is left empty in about one row in ten; mark it `required` if other
fields are calculated through it. Rows whose `required` fields come out empty are regenerated.
Store years, plate numbers and other "numbers you never add up" as `text`, so they are not shown as 2,023.

### exact rows
For catalogues, give the rows instead of a count. A `ref` value is the **title** of the linked row.
Fields you leave out are generated. Exact rows are not checked against `rules`.
```ts
seed: [
  { name: 'Unlimited Monthly', price: 59, billing: 'monthly' },
  { name: 'Off-Peak', price: 35, billing: 'monthly' },
]
```

### status
```ts
status: {
  field: 'status',            // do NOT also list this in fields
  initial: 'trial',           // every new record starts here
  states: [
    { name: 'trial', tone: 'blue', weight: 2 },      // tone: neutral | green | amber | red | blue
    { name: 'active', tone: 'green', weight: 6 },    // weight: how common it is in demo data
    { name: 'frozen', tone: 'amber' },
    { name: 'cancelled', tone: 'red', label: 'Cancelled' },
  ],
  transitions: [
    { from: ['trial', 'frozen'], to: 'active', label: 'Activate' },
    { from: ['active'], to: 'frozen', label: 'Freeze' },
    { from: ['trial', 'active', 'frozen'], to: 'cancelled', label: 'Cancel', roles: ['manager'] },
  ],
}
```
**Status that follows the dates** (demo data only). Without this, a class from last week is still
"scheduled" and a booking for tomorrow is already "attended". The first rule whose `when` is true decides
the weights; if none matches, the `weight` on each state is used (default 1):
```ts
status: {
  ...,
  seed: [
    { when: 'starts_at < now', weights: { completed: 12, cancelled: 1 } },
    { when: 'starts_at >= now', weights: { scheduled: 14, cancelled: 1 } },
  ],
}
// on a booking, following its class:
seed: [
  { when: "class_id.status == 'cancelled'", weights: { cancelled: 1 } },
  { when: 'class_id.starts_at < now', weights: { attended: 10, no_show: 2 } },
  { when: 'class_id.starts_at >= now', weights: { booked: 12, cancelled: 1 } },
]
```

**Steps that do something.** A transition can fill in fields of its own record and change a linked one:
```ts
{ from: ['reserved'], to: 'on_rent', label: 'Hand over keys',
  set: { picked_up_at: 'now' },                                   // 'today' and 'now' are understood
  then: [{ update: 'vehicle_id', set: { status: 'on_rent' } }] }, // vehicle_id is a ref field of this record
{ from: ['on_rent'], to: 'returned', label: 'Check in',
  set: { returned_on: 'today' },
  then: [{ update: 'vehicle_id', set: { status: 'available' } }] },
```
A step can have a condition, and so can each change:
```ts
{ from: ['reserved'], to: 'on_rent', label: 'Hand over keys',
  when: "vehicle_id.status == 'available'", message: 'This car is not available right now.',
  then: [{ update: 'vehicle_id', set: { status: 'on_rent' } }] },
{ from: ['to_do'], to: 'done', label: 'Mark done', set: { finished_at: 'now' },
  // free the room only if it was waiting for cleaning; an occupied room stays occupied
  then: [{ update: 'room_id', set: { status: 'available' }, when: "room_id.status == 'needs_cleaning'" }] },
```
`then` writes the linked record directly (it does not go through that record's own transitions or roles).

The demo data obeys `then` as well: a booking seeded as `on_rent` leaves its vehicle `on_rent`, and
records still in progress win over finished ones. So give the linked entity's "busy" states
(`on_rent`, `occupied`) `weight: 0` and let the bookings set them. Finished records are applied first
across all entities, then the ones in progress; if two in-progress records of different entities
disagree about one linked record, the entity defined later wins. When finishing a record should only
sometimes change the linked one (a check-out from last month should not leave the room dirty today),
put a `when` on the change: `when: 'checked_out_at >= addDays(today, -1)'`.

Each transition becomes a button on the record page. `roles` limits who may press it (the owner always
may). The status can only change through a transition, never through the edit form. Every state other
than `initial` needs at least one transition leading to it. The list page gets status tabs for free.

### rules
Business rules, checked on every save and every status change. A broken rule shows its message on the
form. The demo data obeys them too (a row that breaks a rule is regenerated, or skipped if nothing fits,
so an entity with rules may end up with fewer rows than `seed` asks for). With `unique` on a ref
(one invoice per booking) keep the `seed` count well below the number of rows it can link to, so the
demo leaves room to create one more; and use a `{ ref: {...} }` seed, not a rule, to choose which rows get linked.
`noOverlap` with an `end` treats the end as exclusive: a return and the next pick-up on the same day do not clash.
```ts
rules: [
  { check: 'return_on >= pickup_on', message: 'The return date cannot be before the pick-up date.' },
  { unique: ['member_id', 'class_id'], message: 'This member is already booked on that class.' },
  // No double booking: two bookings for the same vehicle may not overlap. Cancelled ones do not count.
  { noOverlap: { per: 'vehicle_id', start: 'pickup_on', end: 'return_on' }, unless: { status: ['cancelled', 'no_show'] },
    message: 'This vehicle is already booked for those dates.' },
  // Without `end`, two records clash when they have the same `start` (one table, one slot).
  { noOverlap: { per: 'room_id', start: 'starts_at' } },
  // A class cannot take more bookings than its capacity. `max` is a number or a field of the linked record.
  { capacity: { per: 'class_id', max: 'capacity' }, unless: { status: 'cancelled' }, message: 'This class is full.' },
]
```

### Expressions
`compute`, rule `check`, seed `calc` / `when` and `status.seed` share one small language:

| write | meaning |
|---|---|
| `quantity * unit_price` | arithmetic on fields of the same record: `+ - * /` and brackets |
| `plan_id.price`, `member_id.plan_id.price` | a field of a linked record, through `ref` fields |
| `days(pickup_on, return_on)` | whole days from the first date to the second |
| `addDays(issued, 14)` | a date moved by a number of days |
| `round(x, 2)`, `min(a, b)`, `max(a, b)`, `coalesce(a, b)`, `if(cond, a, b)` | what they say |
| `a >= b`, `==`, `!=`, `<`, `>`, `and`, `or`, `not` | comparisons, for `check` and `when` |
| `status == 'paid'` | text goes in single quotes |
| `today`, `now` | the current date, and the current date and time |

`true`, `false` and `null` can be used; `min` and `max` work on dates as well as numbers.
An empty value makes the result empty; a `check` whose result is empty passes.
A calculated field is refreshed when its own record is saved or changes status, not when a linked
record changes; to keep a price as it was at the time, store it in an ordinary field. Joining text works with
`+`, which makes a calculated title: `compute: "member_id.name + ' · ' + class_id.name"`.
Typical computed fields: `{ name: 'total', type: 'money', compute: 'days(pickup_on, return_on) * daily_rate' }`.

### permissions
```ts
permissions: {
  manager: ['read', 'create', 'update', 'delete'],
  front_desk: ['read', 'create', 'update'],
  trainer: [],                // no access: the section disappears for trainers
}
```
Omit `permissions` to give every role full access. A role you leave out of the object has no access.

## dashboard
Widgets appear in this order: stat tiles first, then the rest in a two-column grid (`line` and `list`
take the full width). A widget is hidden from roles that cannot read its entity or field.

```ts
dashboard: [
  { type: 'stat', label: 'Active members', entity: 'members', agg: 'count', where: { status: 'active' } },
  { type: 'stat', label: 'Collected', entity: 'invoices', agg: 'sum', field: 'amount', where: { status: 'paid' }, format: 'money' },
  { type: 'line', label: 'Revenue', entity: 'invoices', dateField: 'issued', agg: 'sum', field: 'amount', days: 60, format: 'money' },
  { type: 'donut', label: 'Members by status', entity: 'members', groupBy: 'status' },
  { type: 'bar', label: 'Members by plan', entity: 'members', groupBy: 'plan_id' },
  { type: 'list', label: 'Overdue invoices', entity: 'invoices', where: { status: 'overdue' }, sort: 'issued', dir: 'asc', limit: 6 },
]
```
`where` matches exact values; give an array to match any of several (`{ status: ['sent', 'overdue'] }`).
For dates and ranges use an object: `not`, `lt`, `lte`, `gt`, `gte`, `between`. Dates can be written as
`'today'`, `'today+7'`, `'today-30'`, and work on both `date` and `datetime` fields:
```ts
{ type: 'stat', label: 'Appointments today', entity: 'appointments', agg: 'count', where: { starts_at: 'today' } },
{ type: 'stat', label: 'Renewals in 7 days', entity: 'members', agg: 'count', where: { renews: { between: ['today', 'today+7'] } } },
{ type: 'stat', label: 'Taken this month', entity: 'payments', agg: 'sum', field: 'amount', where: { paid_on: { gte: 'today-30' } }, format: 'money' },
{ type: 'list', label: 'Overdue', entity: 'invoices', where: { due: { lt: 'today' }, status: { not: ['paid', 'written_off'] } }, sort: 'due', dir: 'asc' },
```
A `list` widget shows the first four fields plus the status (or the fields marked `list: true`), five at most.
`groupBy` works on `select`, `ref`, `boolean` and the status field. Use four `stat` widgets.

## Custom screens and routes
- `web/custom/index.tsx`: add `{ path, label, icon, group, roles, component }`. Served at `/x/<path>`.
- `server/custom.ts`: add Express routes under `/api/custom/...`. `req.user` has `id`, `tenant_id`,
  `name`, `email`, `role`. Always filter by `req.user.tenant_id`.
- The generated API a screen can call with `api()` from `web/api.ts`:
  `GET /e/<entity>?q=&page=&pageSize=&sort=&dir=&f_<field>=<value>&from_<field>=<date>&to_<field>=<date>`
  (dates as `YYYY-MM-DD`, `today` or `today+7`), `GET /e/<entity>/<id>`,
  `POST /e/<entity>`, `PATCH /e/<entity>/<id>`, `POST /e/<entity>/<id>/transition {to}`,
  `DELETE /e/<entity>/<id>`, `GET /e/<entity>/options`. Rows carry `<field>__label` for every ref.

`npm run verify` calls every custom `GET` route as every role and as a second organisation, so use
`can(req.user.role, entity('x')!, 'read')` from `./auth` for anything a role should not see.

## Good to know
- The config is ordinary TypeScript and is also loaded by the browser. Keep secrets and Node-only code out of it.
- Exact seed rows may set the status column, and are the same in every demo organisation.
- An unknown `icon` name fails `npm run verify`. Use names from lucide.dev in PascalCase.
- Select options are shown in title case (`front desk` appears as "Front Desk").
- Dates are stored and compared in UTC.
- Changing the config rebuilds the demo data and signs everyone out.

## Commands
`npm run dev` starts it. `npm run verify` checks everything. `npm run reset` wipes the demo data so it is
rebuilt on the next start (this also happens automatically whenever the config changes).
