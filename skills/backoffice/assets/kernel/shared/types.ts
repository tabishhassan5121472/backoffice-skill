// The shape of system.config.ts. The whole app (database, API, screens, demo data)
// is generated from one System object. See references/config-reference.md in the skill.

export type FieldType =
  | 'text' | 'longtext' | 'number' | 'money' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'email' | 'phone' | 'ref';

export type Seed =
  | 'name' | 'firstName' | 'lastName' | 'company' | 'email' | 'phone'
  | 'address' | 'city' | 'sentence' | 'paragraph'
  | { pick: (string | number | boolean)[]; weights?: number[] }
  | { int: [number, number] }
  | { money: [number, number] }
  /** Days relative to today: negative is the past, e.g. [-90, 0] or [1, 30]. */
  | { days: [number, number] }
  /** e.g. 'INV-{seq:4}' gives INV-0001, INV-0002 ... */
  | { template: string }
  /** A string of random digits, e.g. { digits: 6 } gives '408213'. */
  | { digits: number }
  /** A date that many days after another date in the same row (or a linked one: 'class_id.starts_at'). */
  | { after: string; days: [number, number]; notAfter?: 'today' }
  /** An expression over the row: 'plan_id.price', 'nights * daily_rate'. See shared/expr.ts. */
  | { calc: string }
  /** Different data depending on the rest of the row: { when: "status == 'paid'", then: {...} }. No `else` leaves it empty. */
  | { when: string; then: Seed; else?: Seed }
  /** For ref fields: link only to rows that match, e.g. { ref: { status: 'returned' } }. Same syntax as a dashboard `where`. */
  | { ref: Where };

export type Scalar = string | number | boolean | null;

export interface Field {
  name: string;                 // snake_case column name
  label?: string;               // defaults to a title-cased name
  type: FieldType;
  required?: boolean;
  options?: string[];           // for 'select'
  ref?: string;                 // for 'ref': the entity name it points to
  /** Show as a column in the list table. Defaults to the first five fields. */
  list?: boolean;
  /** Offer a dropdown filter above the list ('select', 'boolean' and 'ref' fields). */
  filter?: boolean;
  /** Hide this field (list, detail, form, export) from these roles. */
  hideFrom?: string[];
  seed?: Seed;
  /** Calculated, read-only: an expression such as 'days(pickup_on, return_on) * daily_rate'. */
  compute?: string;
  /** Read-only code filled in when a record is created, e.g. 'BK-{seq:5}'. */
  auto?: string;
}

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue';

export interface StatusFlow {
  /** Column that holds the state. Do not also list it in `fields`. */
  field: string;
  initial: string;
  states: { name: string; label?: string; tone: Tone; weight?: number }[];
  transitions: Transition[];
  /** Demo data: status weights that depend on the row. The first rule whose `when` is true wins. */
  seed?: { when: string; weights: Record<string, number> }[];
}

export interface Transition {
  from: string[]; to: string; label: string; roles?: string[];
  /** The step is refused unless this is true, e.g. "vehicle_id.status == 'available'". Give a `message`. */
  when?: string;
  message?: string;
  /** Fields of this record to fill in when the step is taken. 'today' and 'now' are understood. */
  set?: Record<string, Scalar>;
  /** Changes to a linked record: { update: 'vehicle_id', set: { status: 'rented' } }. */
  then?: { update: string; set: Record<string, Scalar>; when?: string }[];
}

export type Rule =
  /** Must be true to save, e.g. 'return_on >= pickup_on'. */
  | { check: string; message: string }
  /** No two records may share these values. */
  | { unique: string[]; message?: string }
  /** No two records for the same `per` may overlap in time (or share the same `start` when there is no `end`). */
  | { noOverlap: { per: string; start: string; end?: string }; unless?: Record<string, Scalar | Scalar[]>; message?: string }
  /** At most `max` records per linked record. `max` is a number or a field of the linked record. */
  | { capacity: { per: string; max: number | string }; unless?: Record<string, Scalar | Scalar[]>; message?: string };

export type Action = 'read' | 'create' | 'update' | 'delete';

export interface Entity {
  name: string;                 // snake_case plural: 'members', 'class_bookings'
  label: string;                // 'Members'
  singular: string;             // 'Member'
  icon?: string;                // a lucide icon name in PascalCase, e.g. 'Users'
  group?: string;               // sidebar section heading
  title: string;                // field shown when another record links here
  fields: Field[];
  status?: StatusFlow;
  /** Business rules checked on every save and status change. */
  rules?: Rule[];
  /** Per-role actions. Omit to give every role full access. The first role always has full access. */
  permissions?: Record<string, Action[]>;
  /** How many demo rows per tenant, or the exact rows (ref values are the title of the linked row). */
  seed: number | Record<string, string | number | boolean | null>[];
}

/** Dates may be written as 'today', 'today+7', 'today-30'. */
export type Where = Record<string, string | number | boolean | (string | number)[] | {
  not?: string | number | (string | number)[]; lt?: string | number; lte?: string | number;
  gt?: string | number; gte?: string | number; between?: [string | number, string | number];
}>;

export type Widget =
  | { type: 'stat'; label: string; entity: string; agg: 'count' | 'sum'; field?: string; where?: Where; format?: 'number' | 'money' }
  | { type: 'bar' | 'donut'; label: string; entity: string; groupBy: string; where?: Where }
  | { type: 'line'; label: string; entity: string; dateField: string; agg: 'count' | 'sum'; field?: string; days?: number; where?: Where; format?: 'number' | 'money' }
  | { type: 'list'; label: string; entity: string; where?: Where; sort?: string; dir?: 'asc' | 'desc'; limit?: number };

export interface System {
  name: string;                 // product name shown in the sidebar and login page
  tagline: string;
  accent: string;               // hex colour, e.g. '#4f46e5'
  currency: string;             // ISO code, e.g. 'USD'
  /** The first role is the owner and can do everything, including team and audit log. */
  roles: { name: string; label: string; description: string }[];
  /** Demo organisations. Each gets its own isolated copy of the demo data. */
  tenants: { name: string; slug: string }[];
  /** Order matters: an entity may only reference entities listed before it (or itself). */
  entities: Entity[];
  dashboard: Widget[];
}

export const defineSystem = (s: System) => s;

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const fieldLabel = (f: Field) => f.label ?? titleCase(f.name.replace(/_id$/, ''));
