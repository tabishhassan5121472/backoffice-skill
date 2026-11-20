# Blueprint: agency, studio or consultancy

**Core record:** the project. `proposed → scheduled → in_progress → on_hold → completed`, or `cancelled`.
Everything else answers "what are we working on, how many hours has it used, and what is owed to us?"

**Roles**
- `owner`: everything, including rates and staff cost.
- `project_manager`: clients, projects, tasks; approves time. Reads invoices. Never sees staff cost.
- `team_member`: works on tasks and logs time. No rates, budgets or invoices.
- `accountant`: raises and chases invoices. Reads projects and time.

**Entities, in order**
1. `services` (catalogue, exact rows): name, rate (money per hour), description.
2. `staff`: name, role_title, email, weekly_hours, cost_rate (hide from everyone but the owner).
   Status: active / left.
3. `clients`: name, contact, email, phone, industry. Status: prospect → active → archived.
4. `projects`: name, client (ref), service (ref), manager (ref staff), start_date, deadline, budget_hours,
   hourly_rate (`calc: 'service_id.rate'`, hide from team_member), completed_on.
5. `tasks`: title, project (ref), assignee (ref staff), due, estimate_hours, done_on.
   Status: to_do → in_progress → in_review → done.
6. `time_entries`: ref (`T-{seq:5}`), date, person (ref staff), project (ref), hours, billable,
   description, rate and amount (`compute`, hide from team_member). Status: submitted → approved / rejected.
7. `invoices`: number (`INV-{seq:4}`), project (ref), stage (deposit, interim, final), hours, rate
   (`calc` from the project), amount (`compute: 'hours * rate'`), issued, due (issued + 14), paid_on.
   Status: draft → sent → paid / overdue, or void (owner only).

**Rules and coherence**
- Projects: `deadline >= start_date`, `unique: ['client_id', 'name']`. "Start work" has
  `when: 'start_date <= today'` and makes the client active.
- Time: `unique: ['staff_id', 'project_id', 'date']`, `hours > 0 and hours <= 16`, `date <= today`,
  `date >= project_id.start_date`, and no time on proposed, scheduled or cancelled projects. Seed time
  only on projects that have been running a while (`{ ref: { status: ['in_progress', 'completed'], start_date: { lte: 'today-20' } } }`).
- Invoices: `unique: ['project_id', 'stage']`, `due >= issued`, `issued >= project_id.start_date`;
  "Mark overdue" has `when: 'due < today'`.
- Project `status.seed` follows the dates: not started is proposed / scheduled, past the deadline is
  mostly completed, otherwise in_progress / on_hold.

**Dashboard**
Projects in progress · Hours logged in the last 7 days (sum) · Paid in 30 days · Owed to us ·
Invoiced over 60 days (line) · Projects by status (donut) · Open tasks by person (bar) ·
Overdue invoices (list) · Tasks due this week (list).

**Signature screen:** a weekly timesheet: people down the side, days across, hours per cell, totals and
share of capacity, with a "where the week went" table by project.
