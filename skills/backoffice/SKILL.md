---
name: backoffice
description: Builds a complete, running, multi-tenant business management system (admin panel, back office, internal tool, CRM, booking, inventory, POS or billing system) from a one-line description of the business. Produces sign-in, roles and permissions, searchable tables, forms, status workflows, a dashboard, an activity log, CSV export and realistic demo data, then proves it works with an automated check. Use when the user asks for an admin dashboard, management system, back office, internal tool or "a system for my gym / clinic / shop / school / agency", or wants a working demo of one.
---

# Backoffice

Turn one sentence about a business into a working management system the user can open in a browser.

The app is driven by a single file, `system.config.ts`. A ready-made template (in `assets/kernel`) turns that file into the
database, the API, every screen and the demo data. Your job is the part that needs judgement: deciding
what this business actually tracks, who works there, and what each person should see. You do not write
CRUD code.

## Workflow

### 1. Understand the business
Work from what the user said. Do not interview them. Ask one question only if you cannot tell what kind
of business it is. Decide everything else yourself and say what you assumed at the end. When nobody is there to answer
(you are running unattended), never stop to ask: decide and note it.

### 2. Design it on paper first
Read `references/domain-design.md`, then write a short plan (in your reply, before any code):

- the **core record** and its lifecycle (the thing everything else hangs off)
- 5 to 9 entities, in dependency order
- 3 or 4 roles, and what each one must **not** see or do
- 6 to 8 dashboard widgets that answer what the owner asks every morning
- the 2 to 5 **rules** this business lives by (what can never be double-booked, what a step changes
  elsewhere, what is calculated instead of typed)

If `references/blueprints/` has a file for this kind of business, start from it and adapt it to what the
user said. Blueprints are distilled from systems that were built and shipped. Available: `gym.md`,
`clinic.md`.

### 3. Create the project
```bash
node <this-skill-folder>/scripts/create.mjs <target-folder>
cd <target-folder> && npm install
```
Needs Node 22.13 or newer. A warning from npm about install scripts can be ignored. Nothing else: the database is a local SQLite file built into Node.

### 4. Write `system.config.ts`
Replace the placeholder file completely. `references/config-reference.md` documents every option. Rules
that matter most:

- An entity may only reference entities defined **before** it.
- Give every field that needs believable demo data a `seed`. Names, prices, dates and codes should look
  like this business, not like "Text 1".
- Put small fixed catalogues (plans, services, rooms, tables) in as exact `seed` rows.
- Use `status` for the lifecycle. Every state needs a transition that leads to it.
- Make the data hold together: link dates with `after`, take prices from the catalogue with `calc`, and
  give every dated status a `status.seed` so past things are finished and future things are not.
- Make the system behave: `compute` for totals, `auto` for codes, `rules` for what must never happen
  (double bookings, full classes, an end before a start), and `set` / `then` on transitions so one step
  updates everything it should (checking a car in frees the car).
- Use `permissions` and `hideFrom` to make the roles genuinely different.

### 5. Prove it works
```bash
npm run verify
```
It type-checks, builds the web app, boots the server and exercises every section as every role, including
the business rules, the side effects of each status change and your custom routes. Fix what
it reports and run it again until every check passes. Fix problems in `system.config.ts`. Only touch the
template code if the config truly cannot express what is needed. Do not tell the user it works before
this passes.

### 6. Add one signature screen (when the business has one)
Most businesses have one screen that is not a table: a restaurant floor, a class timetable, a pipeline
board, today's appointments. If it is obvious what that is, build it:

- the screen goes in `web/custom/` and is listed in `web/custom/index.tsx`
- any extra API route goes in `server/custom.ts` (always filter by `req.user.tenant_id`)

Read `web/pages/Dashboard.tsx` first and match its look, reusing `PageHeader` and `Icon` from
`web/components/Shell.tsx`, `StatusBadge` and the formatters from `web/format.tsx`, and the `card`, `btn`,
`th`, `td` and `tnum` classes. Run `npm run verify` again afterwards. Skip this
step if no such screen is obvious.

### 7. Hand over
Start it with `npm run dev` (http://localhost:5173, or set `PORT`). Then tell the user, briefly:

- the address, and that the sign-in page lists a demo account for every role
- what the system covers, in the business's own words
- the assumptions you made
- what is **not** included: real payments, email or SMS sending, file uploads, and production hosting.
  The demo data is rebuilt whenever `system.config.ts` changes.

## What every generated system has
Sign-in with hashed passwords and sessions; separate organisations that cannot see each other's data;
roles with per-section and per-field permissions; searchable, sortable, filterable tables with CSV
export; create and edit forms with validation; status workflows with role-restricted steps; record pages
with linked records and history; calculated fields, automatic codes and business rules (no double
booking, capacity limits, steps that update linked records); a dashboard with date-aware tiles; team management and an activity log for the owner.
