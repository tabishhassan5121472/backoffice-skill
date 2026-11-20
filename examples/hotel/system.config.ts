import { defineSystem } from './shared/types';

// The 40 rooms of the house: four floors of ten. A fixed catalogue, so exact rows.
const TYPE_BY_POSITION = ['Standard Queen', 'Standard Queen', 'Standard Queen', 'Standard Twin', 'Standard Twin', 'Deluxe King', 'Deluxe King', 'Deluxe King', 'Family Room', 'Junior Suite'];
const ROOMS = [1, 2, 3, 4].flatMap((floor) =>
  TYPE_BY_POSITION.map((type, i) => ({
    number: String(floor * 100 + i + 1),
    room_type_id: floor === 4 && i === 9 ? 'Executive Suite' : type,
    floor: String(floor),
    view: i % 2 ? 'city' : 'courtyard',
    ...(floor * 100 + i + 1 === 207 || floor * 100 + i + 1 === 404 ? { status: 'out_of_service' } : {}),
  })),
);

export default defineSystem({
  name: 'Innkeep',
  tagline: 'Rooms, reservations, housekeeping and guest bills for a city hotel.',
  accent: '#1d4ed8',
  currency: 'USD',
  roles: [
    { name: 'manager', label: 'General manager', description: 'Sees and changes everything, including rates, the team and the activity log.' },
    { name: 'front_desk', label: 'Front desk', description: 'Takes reservations, checks guests in and out and settles bills. Cannot change rates, void bills or delete.' },
    { name: 'housekeeping', label: 'Housekeeping', description: 'Sees rooms, who is in house and the cleaning list. No guest details, rates or bills.' },
    { name: 'accounts', label: 'Accounts', description: 'Works on bills and reads reservations. Cannot change bookings or rooms.' },
  ],
  tenants: [{ name: 'The Marlowe Hotel', slug: 'marlowe' }, { name: 'Hotel Alder Square', slug: 'alder' }],
  entities: [
    {
      name: 'room_types', label: 'Room types', singular: 'Room type', icon: 'BedDouble', group: 'Hotel', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'nightly_rate', type: 'money', required: true, hideFrom: ['housekeeping'] },
        { name: 'max_guests', type: 'number', required: true },
        { name: 'beds', type: 'text' },
        { name: 'description', type: 'longtext', list: false },
      ],
      rules: [{ check: 'nightly_rate > 0 and max_guests > 0', message: 'A room type needs a nightly rate and at least one guest.' }],
      permissions: { front_desk: ['read'], housekeeping: ['read'], accounts: ['read'] },
      seed: [
        { name: 'Standard Queen', nightly_rate: 129, max_guests: 2, beds: '1 queen', description: 'Compact room with a queen bed, desk and walk-in shower.' },
        { name: 'Standard Twin', nightly_rate: 135, max_guests: 2, beds: '2 singles', description: 'Two single beds, desk and walk-in shower.' },
        { name: 'Deluxe King', nightly_rate: 179, max_guests: 2, beds: '1 king', description: 'Larger corner room with a king bed, armchair and bathtub.' },
        { name: 'Family Room', nightly_rate: 219, max_guests: 4, beds: '1 king, 2 singles', description: 'Room for four with a king bed and two singles.' },
        { name: 'Junior Suite', nightly_rate: 259, max_guests: 3, beds: '1 king, sofa bed', description: 'Bedroom with a sitting area and sofa bed.' },
        { name: 'Executive Suite', nightly_rate: 389, max_guests: 4, beds: '1 king, sofa bed', description: 'Top-floor suite with separate living room and skyline view.' },
      ],
    },
    {
      name: 'rooms', label: 'Rooms', singular: 'Room', icon: 'DoorOpen', group: 'Hotel', title: 'number',
      fields: [
        { name: 'number', type: 'text', required: true, label: 'Room' },
        { name: 'room_type_id', type: 'ref', ref: 'room_types', required: true, filter: true },
        { name: 'floor', type: 'select', options: ['1', '2', '3', '4'], filter: true },
        { name: 'view', type: 'select', options: ['city', 'courtyard'] },
        { name: 'notes', type: 'longtext', list: false, seed: { when: "status == 'out_of_service'", then: { pick: ['Bathroom being re-tiled.', 'Air conditioning unit awaiting a part.'] } } },
      ],
      status: {
        field: 'status', initial: 'available',
        // Occupied and needs-cleaning are set by reservations and housekeeping, never seeded directly.
        states: [
          { name: 'available', tone: 'green', weight: 1 },
          { name: 'occupied', tone: 'blue', weight: 0 },
          { name: 'needs_cleaning', tone: 'amber', weight: 0 },
          { name: 'out_of_service', tone: 'red', weight: 0 },
        ],
        transitions: [
          { from: ['needs_cleaning'], to: 'available', label: 'Mark clean', roles: ['housekeeping', 'front_desk'] },
          { from: ['available', 'occupied'], to: 'needs_cleaning', label: 'Mark as needs cleaning', roles: ['housekeeping', 'front_desk'] },
          { from: ['available', 'needs_cleaning'], to: 'out_of_service', label: 'Take out of service', roles: ['housekeeping'] },
          { from: ['out_of_service'], to: 'available', label: 'Return to service', roles: ['housekeeping'] },
          { from: ['available'], to: 'occupied', label: 'Mark occupied', roles: ['manager'] },
        ],
      },
      rules: [{ unique: ['number'], message: 'There is already a room with that number.' }],
      permissions: { front_desk: ['read', 'update'], housekeeping: ['read', 'update'], accounts: ['read'] },
      seed: ROOMS,
    },
    {
      name: 'guests', label: 'Guests', singular: 'Guest', icon: 'Users', group: 'Front desk', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: 'name' },
        { name: 'email', type: 'email', seed: 'email' },
        { name: 'phone', type: 'phone', seed: 'phone' },
        { name: 'city', type: 'text', seed: 'city' },
        { name: 'vip', type: 'boolean', label: 'VIP', filter: true, seed: { pick: [false, true], weights: [9, 1] } },
        { name: 'id_document', type: 'text', label: 'Passport / ID number', list: false, hideFrom: ['accounts'], seed: { digits: 9 } },
        { name: 'preferences', type: 'longtext', list: false, seed: { pick: ['High floor, away from the lift.', 'Feather-free pillows.', 'Late check-out when possible.', 'Travels for work, needs invoices by email.', 'Quiet room facing the courtyard.', 'Extra towels.'] } },
      ],
      permissions: { front_desk: ['read', 'create', 'update'], housekeeping: [], accounts: ['read'] },
      seed: 140,
    },
    {
      name: 'housekeepers', label: 'Housekeepers', singular: 'Housekeeper', icon: 'UserCheck', group: 'Housekeeping', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: 'name' },
        { name: 'phone', type: 'phone', seed: 'phone' },
        { name: 'shift', type: 'select', options: ['morning', 'afternoon'], filter: true, seed: { pick: ['morning', 'afternoon'], weights: [2, 1] } },
        { name: 'floors', type: 'select', options: ['floors 1-2', 'floors 3-4', 'all floors'], label: 'Usual floors' },
        { name: 'hourly_wage', type: 'money', hideFrom: ['front_desk', 'housekeeping'], seed: { pick: [16.5, 17, 18, 19.5] } },
      ],
      permissions: { front_desk: ['read'], housekeeping: ['read'], accounts: [] },
      seed: 6,
    },
    {
      name: 'reservations', label: 'Reservations', singular: 'Reservation', icon: 'CalendarCheck', group: 'Front desk', title: 'code',
      fields: [
        { name: 'code', type: 'text', auto: 'RES-{seq:5}', label: 'Reservation' },
        { name: 'guest_id', type: 'ref', ref: 'guests', required: true },
        { name: 'room_id', type: 'ref', ref: 'rooms', required: true, filter: true, seed: { ref: { status: { not: 'out_of_service' } } } },
        { name: 'check_in', type: 'date', required: true, seed: { days: [-45, 21] } },
        { name: 'check_out', type: 'date', required: true, seed: { after: 'check_in', days: [1, 5] } },
        { name: 'nights', type: 'number', list: false, compute: 'days(check_in, check_out)' },
        { name: 'adults', type: 'number', required: true, list: false, label: 'Guests', seed: { pick: [1, 2], weights: [2, 3] } },
        // Stored, so a later change to the catalogue does not rewrite a booking that was already quoted.
        { name: 'nightly_rate', type: 'money', required: true, list: false, hideFrom: ['housekeeping'], seed: { calc: 'room_id.room_type_id.nightly_rate' } },
        { name: 'room_total', type: 'money', hideFrom: ['housekeeping'], compute: 'days(check_in, check_out) * nightly_rate' },
        { name: 'source', type: 'select', options: ['direct', 'phone', 'booking site', 'corporate', 'walk-in'], list: false, filter: true, seed: { pick: ['direct', 'phone', 'booking site', 'corporate', 'walk-in'], weights: [4, 2, 6, 3, 1] } },
        { name: 'checked_in_at', type: 'datetime', list: false, seed: { when: "status == 'checked_in' or status == 'checked_out'", then: { after: 'check_in', days: [0, 0], notAfter: 'today' } } },
        { name: 'checked_out_at', type: 'datetime', list: false, seed: { when: "status == 'checked_out'", then: { after: 'check_out', days: [0, 0], notAfter: 'today' } } },
        { name: 'requests', type: 'longtext', list: false, label: 'Special requests', seed: { pick: ['', '', '', 'Late arrival, after 22:00.', 'Cot in the room.', 'Anniversary: flowers on arrival.', 'Airport pick-up requested.', 'Early check-in if possible.'] } },
      ],
      status: {
        field: 'status', initial: 'reserved',
        states: [
          { name: 'reserved', tone: 'blue' },
          { name: 'checked_in', tone: 'green', label: 'In house' },
          { name: 'checked_out', tone: 'neutral' },
          { name: 'no_show', tone: 'amber', label: 'No-show' },
          { name: 'cancelled', tone: 'red' },
        ],
        transitions: [
          { from: ['reserved'], to: 'checked_in', label: 'Check in', roles: ['front_desk'],
            when: "room_id.status == 'available'", message: 'This room is not ready: it is occupied, waiting for cleaning or out of service.',
            set: { checked_in_at: 'now' },
            then: [{ update: 'room_id', set: { status: 'occupied' } }] },
          { from: ['checked_in'], to: 'checked_out', label: 'Check out', roles: ['front_desk'],
            set: { checked_out_at: 'now' },
            // A check-out from last week must not leave the room dirty today.
            then: [{ update: 'room_id', set: { status: 'needs_cleaning' }, when: 'checked_out_at >= today' }] },
          { from: ['reserved'], to: 'no_show', label: 'Mark no-show', roles: ['front_desk'] },
          { from: ['reserved'], to: 'cancelled', label: 'Cancel', roles: ['front_desk'] },
        ],
        seed: [
          { when: 'check_out < today', weights: { checked_out: 22, cancelled: 2, no_show: 1 } },
          { when: 'check_in > today', weights: { reserved: 14, cancelled: 1 } },
          { when: 'check_in == today', weights: { reserved: 3, checked_in: 2 } },
          { when: 'check_out == today', weights: { checked_in: 1, checked_out: 1 } },
          { when: 'check_in < today', weights: { checked_in: 1 } },
        ],
      },
      rules: [
        { check: 'check_out > check_in', message: 'Check-out must be at least one night after check-in.' },
        { check: 'adults >= 1 and adults <= room_id.room_type_id.max_guests', message: 'That is more guests than this room type sleeps.' },
        { noOverlap: { per: 'room_id', start: 'check_in', end: 'check_out' }, unless: { status: ['cancelled', 'no_show'] },
          message: 'This room is already reserved for some of those nights.' },
      ],
      permissions: { front_desk: ['read', 'create', 'update'], housekeeping: ['read'], accounts: ['read'] },
      seed: 520,
    },
    {
      name: 'housekeeping_tasks', label: 'Housekeeping', singular: 'Housekeeping task', icon: 'Sparkles', group: 'Housekeeping', title: 'code',
      fields: [
        { name: 'code', type: 'text', auto: 'HK-{seq:4}', label: 'Task' },
        // Tasks in the demo follow a recent stay: a clean after check-out, or a service for a guest in house.
        { name: 'reservation_id', type: 'ref', ref: 'reservations', label: 'For stay', list: false,
          seed: { ref: { status: ['checked_out', 'checked_in'], check_out: { gte: 'today-6' } } } },
        { name: 'room_id', type: 'ref', ref: 'rooms', required: true, filter: true, seed: { calc: 'reservation_id.room_id' } },
        { name: 'task', type: 'select', options: ['check-out clean', 'stay-over service', 'deep clean', 'inspection'], filter: true,
          seed: { when: "reservation_id.status == 'checked_out'", then: { pick: ['check-out clean'] }, else: { pick: ['stay-over service'] } } },
        { name: 'scheduled_for', type: 'date', required: true, label: 'Date',
          seed: { when: "reservation_id.status == 'checked_out'", then: { after: 'reservation_id.check_out', days: [0, 0] }, else: { days: [0, 0] } } },
        { name: 'housekeeper_id', type: 'ref', ref: 'housekeepers', label: 'Assigned to', filter: true },
        { name: 'finished_at', type: 'datetime', list: false, seed: { when: "status == 'done'", then: { after: 'scheduled_for', days: [0, 0], notAfter: 'today' } } },
        { name: 'notes', type: 'longtext', list: false, seed: { pick: ['', '', '', 'Replace bathrobe.', 'Minibar restocked.', 'Guest asked for extra pillows.', 'Check the shower drain.'] } },
      ],
      status: {
        field: 'status', initial: 'to_do',
        states: [
          { name: 'to_do', tone: 'amber' },
          { name: 'in_progress', tone: 'blue' },
          { name: 'done', tone: 'green' },
          { name: 'skipped', tone: 'neutral' },
        ],
        transitions: [
          { from: ['to_do'], to: 'in_progress', label: 'Start', roles: ['housekeeping'] },
          { from: ['to_do', 'in_progress'], to: 'done', label: 'Mark done', roles: ['housekeeping'],
            set: { finished_at: 'now' },
            // Free the room only if it was waiting for cleaning; an occupied room stays occupied.
            // (finished_at keeps last week's finished tasks in the demo data from "cleaning" a room vacated today.)
            then: [{ update: 'room_id', set: { status: 'available' }, when: "room_id.status == 'needs_cleaning' and finished_at >= today" }] },
          { from: ['to_do'], to: 'skipped', label: 'Skip (do not disturb)', roles: ['housekeeping'] },
        ],
        seed: [
          { when: 'scheduled_for < today', weights: { done: 1 } },
          { when: "task == 'stay-over service'", weights: { to_do: 4, in_progress: 1, done: 3, skipped: 1 } },
          { when: 'scheduled_for >= today', weights: { to_do: 3, in_progress: 1, done: 2 } },
        ],
      },
      rules: [
        { unique: ['room_id', 'scheduled_for', 'task'], message: 'This room already has that task on that date.' },
      ],
      permissions: { front_desk: ['read', 'create'], housekeeping: ['read', 'create', 'update'], accounts: [] },
      seed: 44,
    },
    {
      name: 'bills', label: 'Guest bills', singular: 'Bill', icon: 'Receipt', group: 'Money', title: 'number',
      fields: [
        { name: 'number', type: 'text', auto: 'BILL-{seq:5}', label: 'Bill' },
        { name: 'reservation_id', type: 'ref', ref: 'reservations', required: true, seed: { ref: { status: ['checked_out', 'checked_in'] } } },
        { name: 'guest_id', type: 'ref', ref: 'guests', required: true, seed: { calc: 'reservation_id.guest_id' } },
        { name: 'room_charges', type: 'money', required: true, seed: { calc: 'reservation_id.room_total' } },
        { name: 'restaurant_bar', type: 'money', list: false, label: 'Restaurant and bar', seed: { pick: [0, 0, 18, 24, 36.5, 42, 58, 74, 96, 131.5] } },
        { name: 'minibar_laundry', type: 'money', list: false, label: 'Minibar and laundry', seed: { pick: [0, 0, 0, 6, 9.5, 12, 15, 22, 28] } },
        { name: 'city_tax', type: 'money', list: false, label: 'Tax (8%)', compute: 'round((room_charges + coalesce(restaurant_bar, 0) + coalesce(minibar_laundry, 0)) * 0.08, 2)' },
        { name: 'total', type: 'money', compute: 'round((room_charges + coalesce(restaurant_bar, 0) + coalesce(minibar_laundry, 0)) * 1.08, 2)' },
        { name: 'issued_on', type: 'date', seed: { when: "status != 'open'", then: { after: 'reservation_id.check_out', days: [0, 0], notAfter: 'today' } } },
        { name: 'paid_on', type: 'date', list: false, seed: { when: "status == 'paid'", then: { after: 'issued_on', days: [0, 2], notAfter: 'today' } } },
        { name: 'payment_method', type: 'select', options: ['card', 'cash', 'bank transfer', 'company account'], list: false,
          seed: { when: "status == 'paid'", then: { pick: ['card', 'cash', 'bank transfer', 'company account'], weights: [8, 1, 1, 2] } } },
      ],
      status: {
        field: 'status', initial: 'open',
        states: [
          { name: 'open', tone: 'blue' },
          { name: 'issued', tone: 'amber', label: 'Awaiting payment' },
          { name: 'paid', tone: 'green' },
          { name: 'void', tone: 'red', weight: 0 },
        ],
        transitions: [
          { from: ['open'], to: 'issued', label: 'Close and issue', roles: ['front_desk', 'accounts'], set: { issued_on: 'today' } },
          { from: ['issued'], to: 'paid', label: 'Mark paid', roles: ['front_desk', 'accounts'], set: { paid_on: 'today' } },
          { from: ['open', 'issued'], to: 'void', label: 'Void', roles: ['accounts'] },
        ],
        seed: [
          { when: "reservation_id.status == 'checked_in'", weights: { open: 1 } },
          { when: 'reservation_id.check_out < addDays(today, -5)', weights: { paid: 1 } },
          { when: "reservation_id.status == 'checked_out'", weights: { paid: 5, issued: 2 } },
        ],
      },
      rules: [
        { unique: ['reservation_id'], message: 'This reservation already has a bill.' },
        { check: 'room_charges >= 0 and coalesce(restaurant_bar, 0) >= 0 and coalesce(minibar_laundry, 0) >= 0', message: 'Charges cannot be negative.' },
      ],
      permissions: { front_desk: ['read', 'create', 'update'], housekeeping: [], accounts: ['read', 'create', 'update'] },
      seed: 240,
    },
  ],
  dashboard: [
    { type: 'stat', label: 'Rooms occupied', entity: 'rooms', agg: 'count', where: { status: 'occupied' } },
    { type: 'stat', label: 'Arrivals still to come today', entity: 'reservations', agg: 'count', where: { check_in: 'today', status: 'reserved' } },
    { type: 'stat', label: 'Departures due today', entity: 'reservations', agg: 'count', where: { check_out: 'today', status: 'checked_in' } },
    { type: 'stat', label: 'Bills awaiting payment', entity: 'bills', agg: 'sum', field: 'total', where: { status: 'issued' }, format: 'money' },
    { type: 'line', label: 'Billed', entity: 'bills', dateField: 'issued_on', agg: 'sum', field: 'total', days: 45, format: 'money' },
    { type: 'donut', label: 'Rooms by status', entity: 'rooms', groupBy: 'status' },
    { type: 'bar', label: 'Reservations by source', entity: 'reservations', groupBy: 'source' },
    { type: 'list', label: 'Arriving today', entity: 'reservations', where: { check_in: 'today', status: 'reserved' }, sort: 'code', dir: 'asc', limit: 8 },
    { type: 'list', label: 'Housekeeping still to do', entity: 'housekeeping_tasks', where: { status: ['to_do', 'in_progress'] }, sort: 'scheduled_for', dir: 'asc', limit: 8 },
  ],
});
