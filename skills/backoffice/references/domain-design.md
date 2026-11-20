# Designing a business system

These rules come from building seventeen of these systems for real business types. Apply them before
writing any config.

## 1. Find the record everything hangs off
Every business has one record with a lifecycle that the rest of the system serves.

| Business | Core record | Lifecycle |
|---|---|---|
| Gym | membership | trial → active → frozen → lapsed → cancelled |
| Clinic | appointment | booked → arrived → in consultation → completed / no-show |
| Warehouse | stock movement / order | draft → picking → shipped → received |
| Restaurant | order (ticket) | open → sent to kitchen → served → paid |
| Agency or trades | job | quoted → scheduled → in progress → done → invoiced |
| Property | lease | applied → active → notice given → ended |
| School | enrolment | applied → enrolled → on leave → graduated / withdrawn |
| Hotel | reservation | reserved → checked in → checked out / cancelled |

If you cannot name it, you do not understand the business yet. Model its lifecycle as a `status` with
transitions, and name the transitions the way staff say them ("Check in", "Freeze", "Mark paid").

## 2. Then add only what that record needs
A good first system has 5 to 9 entities:

- **who** it is for (members, patients, customers, tenants)
- **what** is sold or scheduled (plans, services, rooms, products). Usually a small fixed catalogue.
- **the core record** itself
- **the money** (invoices or payments), with its own short lifecycle
- **who does the work** when it is assignable (trainers, practitioners, technicians) as an entity,
  separate from the people who can sign in
- one or two things that make this business itself (class bookings, prescriptions, stock counts)

Leave out settings tables, tags, generic "notes" entities and anything the user did not hint at.

## 3. Roles are defined by what they cannot see
Three or four roles. The first is the owner. For each other role, decide what is off limits. That is what
makes the demo convincing:

- front desk books and takes payments but cannot delete or see wages
- a practitioner sees their schedule and clinical notes but not revenue
- a trainer sees classes and members but no invoices (`permissions: { trainer: [] }` on invoices)
- an accountant sees money but cannot change bookings

Use `hideFrom` for single sensitive fields (cost price, salary, medical notes) and `roles` on a
transition for steps only some people may take (refund, cancel, write off).

## 4. The dashboard answers the owner's morning questions
Four stat tiles, then charts and one list:

- how many (active members, appointments today, open orders)
- how much money came in, and how much is owed
- a trend over 30 to 60 days (revenue, bookings, sign-ups)
- a breakdown by status of the core record
- a list of what needs attention now (overdue invoices, low stock, expiring memberships)

## 5. Demo data must look like the business
People judge the system in ten seconds by its demo data.

- Catalogues are exact rows with real-sounding names and prices ("Unlimited Monthly — 59").
- Codes follow a pattern (`INV-{seq:4}`, `M-{seq:5}`).
- Weight the statuses the way the real world is: mostly active, a few cancelled.
- Dates for schedules span the past and the next two weeks; money dates span the last 60 days.
- Put 20 to 60 rows in the busy entities so tables, search and paging have something to show.

- Values must agree with each other. A due date follows its issue date, a paid invoice has a payment
  date, an amount is the price of the plan it is for, a class from last week is completed and its
  bookings are attended. Use `after`, `calc`, `when` and `status.seed` for this; never seed two related
  fields independently.

## 6. Decide what the system enforces
A table that accepts anything is a spreadsheet. Pick the few rules this business lives by:

- **What can never clash?** One vehicle, room, table or practitioner at a time (`noOverlap`). A class or
  a tour with limited places (`capacity`). One enrolment per student per course (`unique`).
- **What does a step change elsewhere?** Handing over keys puts the car on rent; checking out frees the
  room; receiving stock closes the order (`then` on the transition). Stamp the moment it happened
  (`set: { checked_in_at: 'now' }`).
- **What is calculated, not typed?** Line totals, nights, balances (`compute`). Codes and numbers (`auto`).
- **What is plainly wrong?** An end before a start, a negative quantity (`check`).

Two to five rules is right. Each needs a message a receptionist would understand.

## 7. Name things in the business's own words
"Members" not "Customers" for a gym. "Patients" for a clinic. "Covers" and "Tables" for a restaurant.
Pick a product name, a one-line tagline, an accent colour and a currency that fit.
