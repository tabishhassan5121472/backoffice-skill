# Blueprint: hotel or guesthouse

**Core record:** the reservation. `reserved → checked_in → checked_out`, or `no_show` / `cancelled`.
Everything else answers "which room is free, who is in house, and has the bill been settled?"

**Roles**
- `manager` (owner): everything, including rates.
- `front_desk`: guests, reservations, check-in and check-out, settling bills. Cannot change rates, void
  bills or delete.
- `housekeeping`: rooms and the cleaning list. No guest details, rates or bills.
- `accounts`: bills; reads reservations. Cannot change bookings or rooms. ID numbers hidden.

**Entities, in order**
1. `room_types` (catalogue, exact rows): name, nightly_rate (money), max_guests, beds, description.
2. `rooms` (exact rows, one per room): number, floor, room_type (ref). Status: available / occupied /
   needs_cleaning / out_of_service. Give `occupied` and `needs_cleaning` `weight: 0`; reservations set them.
3. `guests`: name, email, phone, nationality, id_number (hide from housekeeping and accounts).
4. `housekeepers`: name, phone, shift, hourly_wage (hide from front_desk).
5. `reservations`: code (`RES-{seq:5}`), guest (ref), room (ref), check_in, check_out, adults, source
   (select: direct, booking site, corporate, phone, walk-in), nightly_rate (`calc` from the room type),
   nights and room_total (`compute`), checked_in_at, checked_out_at (set by the steps).
6. `housekeeping_tasks`: code (`HK-{seq:4}`), room (ref), task (select: check-out clean, stay-over tidy,
   deep clean), scheduled_for, housekeeper (ref), finished_at. Status: to_do → in_progress → done / skipped.
7. `bills`: number (`BILL-{seq:5}`), reservation (ref), room_charges (`calc: 'reservation_id.room_total'`),
   restaurant_bar, minibar_laundry, tax and total (`compute`), issued_on, paid_on.
   Status: open → issued → paid, or void (accounts only).

**Rules and coherence**
- Reservations: `noOverlap: { per: 'room_id', start: 'check_in', end: 'check_out' }` unless cancelled or
  no_show; `check_out > check_in`; `adults <= room_id.room_type_id.max_guests`.
- Bills: `unique: ['reservation_id']`. Tasks: `unique: ['room_id', 'scheduled_for', 'task']`.
- "Check in" has `when: "room_id.status == 'available'"` and sets the room to occupied. "Check out" sets
  the room to needs_cleaning only `when: 'checked_out_at >= today'`, so last month's stays do not dirty
  today's rooms. "Mark done" on a task frees the room `when` it is waiting for cleaning and the task
  finished today.
- Reservation `status.seed`: past stays are checked_out, stays covering today are checked_in, future
  ones reserved. Seed reservations only on rooms that are not out of service (`{ ref: { status: { not: 'out_of_service' } } }`).

**Dashboard**
Rooms occupied · Arrivals still to come today (`check_in: 'today'`, reserved) · Departures due today ·
Bills awaiting payment (sum) · Billed over 45 days (line) · Rooms by status (donut) · Reservations by
source (bar) · Arriving today (list) · Housekeeping still to do (list).

**Signature screen:** a room board, rooms down the side grouped by floor, two weeks across, one bar per
stay, with earlier / later paging.
