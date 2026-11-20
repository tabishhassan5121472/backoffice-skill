# Blueprint: gym or fitness studio

**Core record:** the membership. `trial → active → frozen → lapsed → cancelled`. Everything else answers
"may this person train right now, and have they paid?"

**Roles**
- `owner`: everything
- `manager`: everything except deleting invoices
- `front_desk`: members, check-ins, bookings, taking payments. No delete. Cannot cancel a membership.
- `trainer`: classes, bookings and members (read). No invoices at all. Member phone and email hidden.

**Entities, in order**
1. `plans` (catalogue, exact rows): name, price (money), billing (monthly / annual / pack), class_limit
   (number), notes. Examples: Unlimited Monthly, Off-Peak, Annual Saver, 10-Class Pack, Student.
2. `trainers`: name, specialty (select: strength, HIIT, yoga, pilates, boxing, spin), email, phone,
   hourly_rate (money, hide from front_desk and trainer), active (boolean).
3. `members`: member_no (`M-{seq:5}`), name, email, phone, plan (ref plans, filter), joined (date),
   renews (date, next 30 days), emergency_contact, notes. Status = the membership lifecycle above.
   Transitions: Activate, Freeze, Resume, Mark lapsed, Cancel (manager only).
4. `classes`: name (select-like text: HIIT Express, Sunrise Yoga, Spin 45, Boxing Basics, Strength
   Foundations, Pilates Core), trainer (ref), starts_at (datetime, -7 to +14 days), room (select: Studio A,
   Studio B, Spin Room, Gym Floor), capacity (number 10 to 24). Status: scheduled → completed / cancelled.
5. `bookings`: member (ref), class (ref), booked_at (datetime). Status: booked → attended / no_show /
   cancelled. Trainers can mark attended.
6. `check_ins`: member (ref), at (datetime, last 30 days), method (select: front desk, QR, PIN).
7. `invoices`: number (`INV-{seq:4}`), member (ref), description (pick: Monthly membership, Annual
   membership, Class pack, Personal training, Day pass), amount (money 20 to 480), issued (date, last 60
   days), due (date). Status: draft → sent → paid / overdue → written_off (owner only). Trainers: none.
8. `enquiries` (optional): name, email, phone, source (select: walk-in, website, referral, Instagram),
   interested_in (ref plans). Status: new → contacted → trial_booked → joined / lost.

**Rules and coherence**
- `member_no`, booking `reference` and invoice `number` are `auto` codes (`M-{seq:5}`, `BK-{seq:5}`, `INV-{seq:4}`).
- Bookings: `unique: ['member_id', 'class_id']`; `capacity: { per: 'class_id', max: 'capacity' }` unless cancelled.
- Class `status.seed`: past classes are completed, future ones scheduled. Booking `status.seed` follows
  the class: attended / no_show when the class is past, booked when it is ahead, cancelled if the class is.
  `booked_at` is `{ after: 'class_id.starts_at', days: [-9, -1] }`.
- Invoices: `due` is 14 days after `issued`; `paid_on` only when paid ("Mark paid" sets it to today);
  amount comes from the description (`calc: 'member_id.plan_id.price'` for memberships, fixed picks for
  day pass, class pack and personal training); `status.seed`: past due is paid / overdue / written_off,
  not yet due is draft / sent / paid. Rule: `due >= issued`.
- Ref fields are named `<thing>_id` (`plan_id`, `trainer_id`, `member_id`, `class_id`).

**Dashboard**
Active members (stat) · Check-ins today (`where: { at: 'today' }`) · Renewals in 7 days
(`renews` between today and today+7) · Collected (sum of paid invoices) · Outstanding (sum of
sent + overdue) · Revenue over 60 days (line) · Members by status (donut) · Members by plan (bar) ·
Overdue invoices (list) · Classes today (list).

**Signature screen:** this week's class timetable grouped by day, each class showing trainer, room and
booked / capacity.
