# Blueprint: car, van or equipment rental

**Core record:** the booking. `reserved → on_rent → returned`, or `cancelled` / `no_show`. Everything
else answers "which vehicle is free on these dates, where is it now, and what did it cost us?"

**Roles**
- `owner`: everything, including purchase prices.
- `rental_agent`: customers and bookings, hands over keys and checks cars in. No purchase prices.
- `mechanic`: the fleet and damage reports. No customers, no money.
- `accountant`: reads everything, manages invoices. Licence details hidden.

**Entities, in order**
1. `locations` (exact rows): name, address, phone.
2. `vehicle_classes` (catalogue, exact rows): name, daily_rate, deposit, seats.
3. `vehicles` (exact rows): name, plate, class (ref), year, purchase_price (hide from agent and mechanic).
   Status: available / on_rent / in_workshop / retired. Give `on_rent` `weight: 0`; bookings set it.
4. `customers`: name, email, phone, licence_no and licence_expiry (hide from accountant).
5. `bookings`: reference (`BK-{seq:5}`), customer (ref), vehicle (ref), pickup_on, return_on, location
   (ref), daily_rate (`calc` from the class), days and total (`compute`), extras, picked_up_at, returned_on.
6. `damage_reports`: booking (ref), vehicle (ref), reported_on, description, repair_cost, repaired_on.
   Status: reported → in_repair → repaired, or closed.
7. `invoices`: number, booking (ref), amount (`calc` from the booking total), issued, due, paid_on.
   Status: draft → sent → paid / overdue, or void.

**Rules and coherence**
- Bookings: `noOverlap: { per: 'vehicle_id', start: 'pickup_on', end: 'return_on' }` unless cancelled or
  no_show; `return_on > pickup_on`; `customer_id.licence_expiry >= return_on`; vehicle not retired.
- "Hand over keys" stamps `picked_up_at` and puts the vehicle on rent; "Check in" stamps `returned_on`
  and frees it. "Send to workshop" on a damage report moves the vehicle to in_workshop; give that change
  a `when` so it does not override a car that is out on rent.
- Booking `status.seed`: past bookings are returned, ones covering today are on_rent, future ones reserved.
- Damage reports only on returned bookings (`booking_id.status == 'returned'`), dated on or before today.

**Dashboard**
Cars on rent · Cars available · Pick-ups in 7 days (`pickup_on` between today and today+7) · Taken in
30 days · Invoiced over 45 days (line) · Fleet by status (donut) · Bookings by status (bar) ·
Due back next (list, sorted by return date) · Open damage reports (list).

**Signature screen:** a fleet board, vehicles down the side, two weeks across, one bar per booking
coloured by status, with a line for today.
