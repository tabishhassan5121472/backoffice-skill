# Blueprint: clinic or practice (medical, dental, physio, vet)

**Core record:** the appointment. `booked → arrived → in_consultation → completed`, with `no_show` and
`cancelled` as exits. The front desk drives the first half, the practitioner the second.

**Roles**
- `owner` (practice manager): everything
- `practitioner`: patients, appointments, clinical notes, prescriptions. No invoices or payments.
- `reception`: patients, appointments, invoices. Clinical notes and prescriptions do not exist for them.
- `billing`: invoices and patients (read). Cannot change appointments. Clinical notes hidden.

**Entities, in order**
1. `services` (catalogue, exact rows): name, duration_min (number), fee (money), category (select).
   Examples: New patient consultation (30 min), Follow-up (15), Annual check-up (45), Vaccination (10),
   Minor procedure (60). Adapt to the specialty.
2. `practitioners`: name, title (select: Dr, Nurse, Therapist, Hygienist), specialty, email, phone,
   room (select: Room 1 to Room 4), active (boolean).
3. `patients`: patient_no (`P-{seq:5}`), name, date_of_birth (date, long ago), sex (select), phone, email,
   address, insurer (pick of a few made-up insurers, or Self-pay), allergies (longtext, hide from billing
   and reception), notes. Status: active / inactive only if useful; usually none.
4. `appointments`: patient (ref), practitioner (ref, filter), service (ref), starts_at (datetime, -14 to
   +14 days), reason (short text). Status as above. Transitions: Check in (reception), Start consultation
   (practitioner), Complete (practitioner), Mark no-show, Cancel.
5. `clinical_notes`: appointment (ref), patient (ref), practitioner (ref), summary (longtext), diagnosis
   (text), follow_up_weeks (number). Permissions: practitioner and owner only.
6. `prescriptions`: patient (ref), practitioner (ref), medication (pick of common generic names), dosage,
   duration_days, issued (date). Status: active → completed / stopped. Practitioner and owner only.
7. `invoices`: number (`INV-{seq:4}`), patient (ref), service (ref), amount (money), issued (date),
   payer (select: patient, insurer). Status: draft → sent → paid / overdue → written_off (owner only).
   Practitioners: none.

**Rules and coherence**
- `patient_no` and invoice `number` are `auto` codes; give appointments an `auto` reference (`APT-{seq:5}`) as their title.
- Appointments: `noOverlap: { per: 'practitioner_id', start: 'starts_at' }` unless cancelled or no_show
  (one patient per practitioner per slot). "Check in" sets `arrived_at: 'now'`.
- Appointment `status.seed`: past ones are completed (mostly), no_show or cancelled; future ones booked.
- Invoices: amount is `calc: 'service_id.fee'`; `due` 14 days after `issued`; `paid_on` only when paid;
  `status.seed` by due date. Rule: `due >= issued`.
- Prescriptions: `issued` in the past; status follows `addDays(issued, duration_days) < today`.

**Dashboard**
Appointments today (stat, `where: { starts_at: 'today' }`) · Patients (stat) · Collected (sum paid) · Outstanding
(sum sent + overdue) · Appointments over 30 days (line by starts_at) · Appointments by status (donut) ·
Appointments by practitioner (bar) · Today's appointments (list, `starts_at: 'today'`, sorted by starts_at).

**Signature screen:** today's schedule, one column per practitioner, appointments in time order with
patient, service and status, and a "Check in" button for reception.

**Care:** all demo patients are invented. Say in the hand-over that a real clinic needs to meet its
local health-data rules before using any system with real patients.
