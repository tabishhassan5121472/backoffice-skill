import { defineSystem } from './shared/types';

// Placeholder system so the template runs on its own. The skill replaces this whole file.
export default defineSystem({
  name: 'Deskwell',
  tagline: 'Clients, jobs and invoices for a small studio.',
  accent: '#4f46e5',
  currency: 'USD',
  roles: [
    { name: 'owner', label: 'Owner', description: 'Sees and changes everything, including the team.' },
    { name: 'staff', label: 'Staff', description: 'Works on clients and jobs. Cannot see invoices.' },
  ],
  tenants: [{ name: 'Harbor Studio', slug: 'harbor' }, { name: 'Cedar & Co', slug: 'cedar' }],
  entities: [
    {
      name: 'clients', label: 'Clients', singular: 'Client', icon: 'Users', group: 'Work', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: 'company' },
        { name: 'contact', type: 'text', seed: 'name' },
        { name: 'email', type: 'email', seed: 'email' },
        { name: 'phone', type: 'phone', seed: 'phone' },
        { name: 'city', type: 'text', seed: 'city' },
        { name: 'notes', type: 'longtext', list: false, seed: 'sentence' },
      ],
      seed: 18,
    },
    {
      name: 'jobs', label: 'Jobs', singular: 'Job', icon: 'Briefcase', group: 'Work', title: 'title',
      fields: [
        { name: 'title', type: 'text', required: true, seed: { pick: ['Website refresh', 'Brand guide', 'Product photos', 'Launch video', 'Packaging', 'Annual report'] } },
        { name: 'client_id', type: 'ref', ref: 'clients', required: true, filter: true },
        { name: 'kind', type: 'select', options: ['design', 'photo', 'video', 'print'], filter: true },
        { name: 'budget', type: 'money', seed: { money: [800, 12000] }, hideFrom: ['staff'] },
        { name: 'due', type: 'date', seed: { days: [-20, 45] } },
      ],
      status: {
        field: 'status', initial: 'quoted',
        states: [
          { name: 'quoted', tone: 'neutral', weight: 2 }, { name: 'active', tone: 'blue', weight: 4 },
          { name: 'delivered', tone: 'green', weight: 3 }, { name: 'cancelled', tone: 'red', weight: 1 },
        ],
        transitions: [
          { from: ['quoted'], to: 'active', label: 'Start job' },
          { from: ['active'], to: 'delivered', label: 'Mark delivered' },
          { from: ['quoted', 'active'], to: 'cancelled', label: 'Cancel', roles: ['owner'] },
        ],
        // Demo data: a job that is past its due date is finished, not still being quoted.
        seed: [{ when: 'due < today', weights: { delivered: 8, cancelled: 1 } }, { when: 'due >= today', weights: { quoted: 2, active: 5 } }],
      },
      seed: 30,
    },
    {
      name: 'invoices', label: 'Invoices', singular: 'Invoice', icon: 'Receipt', group: 'Money', title: 'number',
      fields: [
        { name: 'number', type: 'text', auto: 'INV-{seq:4}' },                       // filled in on create
        { name: 'client_id', type: 'ref', ref: 'clients', required: true, filter: true },
        { name: 'job_id', type: 'ref', ref: 'jobs' },
        { name: 'hours', type: 'number', required: true, seed: { int: [4, 80] } },
        { name: 'rate', type: 'money', required: true, seed: { pick: [85, 110, 140] } },
        { name: 'amount', type: 'money', compute: 'hours * rate' },                   // calculated, read-only
        { name: 'issued', type: 'date', required: true, seed: { days: [-60, 0] } },
        { name: 'due', type: 'date', seed: { after: 'issued', days: [14, 14] } },
        { name: 'paid_on', type: 'date', list: false, seed: { when: "status == 'paid'", then: { after: 'issued', days: [1, 13] } } },
      ],
      status: {
        field: 'status', initial: 'draft',
        states: [
          { name: 'draft', tone: 'neutral' }, { name: 'sent', tone: 'blue', weight: 2 },
          { name: 'paid', tone: 'green', weight: 4 }, { name: 'overdue', tone: 'amber' },
        ],
        transitions: [
          { from: ['draft'], to: 'sent', label: 'Send' },
          { from: ['sent', 'overdue'], to: 'paid', label: 'Mark paid', set: { paid_on: 'today' } },
          { from: ['sent'], to: 'overdue', label: 'Mark overdue' },
        ],
        seed: [{ when: 'due < today', weights: { paid: 8, overdue: 2 } }, { when: 'due >= today', weights: { draft: 1, sent: 4, paid: 2 } }],
      },
      rules: [{ check: 'due >= issued', message: 'The due date cannot be before the issue date.' }],
      permissions: { staff: [] },
      seed: 40,
    },
  ],
  dashboard: [
    { type: 'stat', label: 'Due this week', entity: 'jobs', agg: 'count', where: { due: { between: ['today', 'today+7'] }, status: 'active' } },
    { type: 'stat', label: 'Active jobs', entity: 'jobs', agg: 'count', where: { status: 'active' } },
    { type: 'stat', label: 'Paid', entity: 'invoices', agg: 'sum', field: 'amount', where: { status: 'paid' }, format: 'money' },
    { type: 'stat', label: 'Outstanding', entity: 'invoices', agg: 'sum', field: 'amount', where: { status: ['sent', 'overdue'] }, format: 'money' },
    { type: 'line', label: 'Invoiced', entity: 'invoices', dateField: 'issued', agg: 'sum', field: 'amount', days: 60, format: 'money' },
    { type: 'donut', label: 'Jobs by status', entity: 'jobs', groupBy: 'status' },
    { type: 'bar', label: 'Jobs by kind', entity: 'jobs', groupBy: 'kind' },
    { type: 'list', label: 'Due soon', entity: 'jobs', where: { status: 'active' }, sort: 'due', dir: 'asc', limit: 6 },
  ],
});
