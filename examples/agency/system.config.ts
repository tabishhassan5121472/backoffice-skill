import { defineSystem } from './shared/types';

// Studioledger: a back office for a small digital agency.
// Core record: the project (proposed -> scheduled -> in progress -> completed), with tasks, time and invoices hanging off it.
export default defineSystem({
  name: 'Studioledger',
  tagline: 'Clients, projects, time and invoices for a small digital agency.',
  accent: '#4338ca',
  currency: 'USD',
  roles: [
    { name: 'owner', label: 'Owner', description: 'Sees and changes everything, including rates, costs and the team.' },
    { name: 'project_manager', label: 'Project manager', description: 'Runs clients, projects and tasks and approves time. Sees invoices but cannot change them, and never sees staff cost.' },
    { name: 'team_member', label: 'Team member', description: 'Works on tasks and logs time. Sees no rates, budgets or invoices.' },
    { name: 'accountant', label: 'Accountant', description: 'Raises and chases invoices. Reads projects and time but cannot change the work.' },
  ],
  tenants: [{ name: 'Pixel & Pine', slug: 'pixelpine' }, { name: 'Northlight Digital', slug: 'northlight' }],
  entities: [
    {
      name: 'services', label: 'Services', singular: 'Service', icon: 'Layers', group: 'Studio', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: { pick: ['Consulting'] } },
        { name: 'rate', type: 'money', required: true, label: 'Hourly rate', seed: { money: [80, 160] }, hideFrom: ['team_member'] },
        { name: 'description', type: 'text', seed: 'sentence' },
      ],
      permissions: { project_manager: ['read'], team_member: ['read'], accountant: ['read'] },
      seed: [
        { name: 'Web design', rate: 120, description: 'Site design, UX and prototypes.' },
        { name: 'Web development', rate: 140, description: 'Front-end and back-end builds.' },
        { name: 'Branding', rate: 110, description: 'Identity, logo and brand guidelines.' },
        { name: 'SEO', rate: 95, description: 'Audits, technical fixes and content plans.' },
        { name: 'Content & copy', rate: 85, description: 'Copywriting, blog and email content.' },
        { name: 'Strategy', rate: 160, description: 'Discovery workshops and digital roadmaps.' },
      ],
    },
    {
      name: 'staff', label: 'People', singular: 'Person', icon: 'UserRound', group: 'Studio', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: 'name' },
        { name: 'discipline', type: 'select', options: ['design', 'development', 'strategy', 'content', 'project management'], filter: true,
          seed: { pick: ['design', 'development', 'strategy', 'content', 'project management'], weights: [3, 4, 1, 2, 1] } },
        { name: 'email', type: 'email', seed: 'email' },
        { name: 'weekly_hours', type: 'number', label: 'Weekly hours', seed: { pick: [40, 40, 40, 32, 24] } },
        { name: 'cost_rate', type: 'money', label: 'Cost per hour', seed: { money: [28, 70] }, hideFrom: ['project_manager', 'team_member'] },
      ],
      status: {
        field: 'status', initial: 'active',
        states: [{ name: 'active', tone: 'green', weight: 9 }, { name: 'left', tone: 'neutral', weight: 1 }],
        transitions: [
          { from: ['active'], to: 'left', label: 'Mark as left', roles: ['owner'] },
          { from: ['left'], to: 'active', label: 'Bring back', roles: ['owner'] },
        ],
      },
      permissions: { project_manager: ['read'], team_member: ['read'], accountant: ['read'] },
      seed: 9,
    },
    {
      name: 'clients', label: 'Clients', singular: 'Client', icon: 'Building2', group: 'Work', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: 'company' },
        { name: 'contact', type: 'text', label: 'Contact person', seed: 'name' },
        { name: 'email', type: 'email', seed: 'email' },
        { name: 'phone', type: 'phone', seed: 'phone' },
        { name: 'city', type: 'text', seed: 'city' },
        { name: 'industry', type: 'select', options: ['retail', 'hospitality', 'healthcare', 'software', 'non-profit', 'finance'], filter: true, list: false },
        { name: 'notes', type: 'longtext', list: false, seed: 'sentence' },
      ],
      status: {
        field: 'status', initial: 'prospect',
        states: [{ name: 'prospect', tone: 'blue', weight: 2 }, { name: 'active', tone: 'green', weight: 8 }, { name: 'archived', tone: 'neutral', weight: 1 }],
        transitions: [
          { from: ['prospect', 'archived'], to: 'active', label: 'Make active' },
          { from: ['prospect', 'active'], to: 'archived', label: 'Archive', roles: ['project_manager'] },
          { from: ['archived'], to: 'prospect', label: 'Reopen as prospect' },
        ],
      },
      permissions: { project_manager: ['read', 'create', 'update'], team_member: ['read'], accountant: ['read', 'update'] },
      seed: 16,
    },
    {
      name: 'projects', label: 'Projects', singular: 'Project', icon: 'FolderKanban', group: 'Work', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: { pick: [
          'Website redesign', 'Online store build', 'Brand refresh', 'SEO overhaul', 'Booking portal', 'Launch campaign site',
          'Mobile app landing page', 'Customer portal', 'Design system', 'Annual report microsite', 'Email onboarding series',
          'Product catalogue', 'Membership site', 'Blog migration', 'Analytics dashboard', 'Checkout optimisation',
          'Careers site', 'Brand guidelines', 'Content strategy', 'Accessibility audit', 'Intranet rebuild', 'Event microsite',
        ] } },
        { name: 'client_id', type: 'ref', ref: 'clients', required: true, filter: true,
          // Demo data: only a proposal may belong to a prospect; real work is always for an active client.
          seed: { when: "status == 'proposed'", then: { ref: { status: ['prospect', 'active'] } }, else: { ref: { status: 'active' } } } },
        { name: 'service_id', type: 'ref', ref: 'services', required: true, filter: true, label: 'Service' },
        { name: 'lead_id', type: 'ref', ref: 'staff', label: 'Project lead', list: false, required: true, seed: { ref: { status: 'active' } } },
        { name: 'start_date', type: 'date', required: true, label: 'Start', seed: { days: [-110, 28] } },
        { name: 'deadline', type: 'date', required: true, seed: { after: 'start_date', days: [40, 85] } },
        { name: 'completed_on', type: 'date', list: false, seed: { when: "status == 'completed'", then: { after: 'deadline', days: [-6, 4], notAfter: 'today' } } },
        { name: 'hourly_rate', type: 'money', required: true, list: false, seed: { calc: 'service_id.rate' }, hideFrom: ['team_member'] },
        { name: 'budget_hours', type: 'number', required: true, list: false, seed: { pick: [40, 60, 80, 100, 120, 160, 200] } },
        { name: 'budget', type: 'money', compute: 'budget_hours * hourly_rate', hideFrom: ['team_member'] },
      ],
      status: {
        field: 'status', initial: 'proposed',
        states: [
          { name: 'proposed', tone: 'neutral' }, { name: 'scheduled', tone: 'blue' },
          { name: 'in_progress', tone: 'green', label: 'In progress' }, { name: 'on_hold', tone: 'amber', label: 'On hold' },
          { name: 'completed', tone: 'green' }, { name: 'cancelled', tone: 'red' },
        ],
        transitions: [
          { from: ['proposed'], to: 'scheduled', label: 'Client approved', roles: ['project_manager'] },
          { from: ['scheduled'], to: 'in_progress', label: 'Start work', roles: ['project_manager'],
            when: 'start_date <= today', message: 'Work cannot start before the project start date. Move the start date first.',
            then: [{ update: 'client_id', set: { status: 'active' } }] },
          { from: ['in_progress'], to: 'on_hold', label: 'Put on hold', roles: ['project_manager'] },
          { from: ['on_hold'], to: 'in_progress', label: 'Resume', roles: ['project_manager'] },
          { from: ['in_progress'], to: 'completed', label: 'Mark completed', roles: ['project_manager'], set: { completed_on: 'today' } },
          { from: ['proposed', 'scheduled', 'on_hold'], to: 'cancelled', label: 'Cancel', roles: ['owner'] },
        ],
        // Demo data: a project that has not started is not in progress; one past its deadline is finished.
        seed: [
          { when: 'start_date > today', weights: { proposed: 3, scheduled: 5, cancelled: 1 } },
          { when: 'deadline < today', weights: { completed: 12, cancelled: 1 } },
          { when: 'start_date <= today', weights: { in_progress: 10, on_hold: 1 } },
        ],
      },
      rules: [
        { check: 'deadline >= start_date', message: 'The deadline cannot be before the start date.' },
        { check: 'budget_hours > 0', message: 'Budget hours must be more than zero.' },
        { unique: ['client_id', 'name'], message: 'This client already has a project with that name.' },
      ],
      permissions: { project_manager: ['read', 'create', 'update'], team_member: ['read'], accountant: ['read'] },
      seed: 28,
    },
    {
      name: 'tasks', label: 'Tasks', singular: 'Task', icon: 'ListChecks', group: 'Work', title: 'title',
      fields: [
        { name: 'title', type: 'text', required: true, seed: { pick: [
          'Kick-off workshop', 'Sitemap and wireframes', 'Homepage design', 'Design review with client', 'Build page templates',
          'CMS setup', 'Content migration', 'Write page copy', 'Keyword research', 'Technical SEO fixes', 'Logo concepts',
          'Colour and type system', 'Checkout flow', 'Contact and lead forms', 'Analytics and tracking', 'Performance pass',
          'Accessibility checks', 'Cross-browser QA', 'Client training session', 'Launch checklist',
        ] } },
        { name: 'project_id', type: 'ref', ref: 'projects', required: true, filter: true, seed: { ref: { status: ['scheduled', 'in_progress', 'on_hold', 'completed'] } } },
        { name: 'assignee_id', type: 'ref', ref: 'staff', required: true, filter: true, label: 'Assignee', seed: { ref: { status: 'active' } } },
        { name: 'due', type: 'date', required: true, seed: { after: 'project_id.start_date', days: [3, 38] } },
        { name: 'estimate_hours', type: 'number', label: 'Estimate (h)', seed: { pick: [2, 4, 6, 8, 12, 16] } },
        { name: 'done_on', type: 'date', list: false, seed: { when: "status == 'done'", then: { after: 'due', days: [-3, 1], notAfter: 'today' } } },
        { name: 'notes', type: 'longtext', list: false, seed: 'sentence' },
      ],
      status: {
        field: 'status', initial: 'to_do',
        states: [
          { name: 'to_do', tone: 'neutral', label: 'To do' }, { name: 'in_progress', tone: 'blue', label: 'In progress' },
          { name: 'in_review', tone: 'amber', label: 'In review' }, { name: 'done', tone: 'green' },
        ],
        transitions: [
          { from: ['to_do'], to: 'in_progress', label: 'Start',
            when: "project_id.status == 'in_progress'", message: 'This project is not in progress, so its tasks cannot be started.' },
          { from: ['in_progress'], to: 'in_review', label: 'Send for review' },
          { from: ['in_review'], to: 'in_progress', label: 'Request changes', roles: ['project_manager'] },
          { from: ['in_progress', 'in_review'], to: 'done', label: 'Mark done', set: { done_on: 'today' } },
          { from: ['done'], to: 'to_do', label: 'Reopen', roles: ['project_manager'] },
        ],
        seed: [
          { when: "project_id.status == 'completed'", weights: { done: 1 } },
          { when: "project_id.status == 'scheduled'", weights: { to_do: 1 } },
          { when: "project_id.status == 'on_hold' and due >= today", weights: { to_do: 1 } },
          { when: "project_id.status == 'on_hold'", weights: { to_do: 1, done: 3 } },
          { when: 'due < today', weights: { done: 10, in_review: 1, in_progress: 1 } },
          { when: 'due >= today', weights: { to_do: 6, in_progress: 4, in_review: 1 } },
        ],
      },
      rules: [
        { check: 'due >= project_id.start_date', message: 'A task cannot be due before its project starts.' },
      ],
      permissions: { project_manager: ['read', 'create', 'update', 'delete'], team_member: ['read', 'create', 'update'], accountant: [] },
      seed: 60,
    },
    {
      name: 'time_entries', label: 'Time', singular: 'Time entry', icon: 'Clock', group: 'Work', title: 'ref',
      fields: [
        { name: 'ref', type: 'text', auto: 'T-{seq:5}', label: 'Entry', list: false },
        // Demo data: on a finished project, time sits inside its run; on a running one, in the last three weeks
        // (the project link below only picks projects that started at least three weeks ago).
        { name: 'date', type: 'date', required: true,
          seed: { when: "project_id.status == 'completed'", then: { after: 'project_id.start_date', days: [0, 30] }, else: { days: [-20, 0] } } },
        { name: 'staff_id', type: 'ref', ref: 'staff', required: true, filter: true, label: 'Person', seed: { ref: { status: 'active' } } },
        { name: 'project_id', type: 'ref', ref: 'projects', required: true, filter: true,
          seed: { ref: { status: ['in_progress', 'completed'], start_date: { lte: 'today-20' } } } },
        { name: 'hours', type: 'number', required: true, seed: { pick: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5], weights: [1, 3, 2, 4, 2, 4, 4, 2] } },
        { name: 'billable', type: 'boolean', filter: true, seed: { pick: [true, false], weights: [9, 1] } },
        { name: 'description', type: 'text', label: 'Work done', list: false, seed: { pick: [
          'Design iterations', 'Front-end build', 'Client call and notes', 'Bug fixes', 'Copy edits', 'QA and testing',
          'Sprint planning', 'Wireframes', 'CMS configuration', 'SEO audit', 'Feedback round', 'Deployment and checks',
        ] } },
        { name: 'rate', type: 'money', compute: 'project_id.hourly_rate', hideFrom: ['team_member'], list: false },
        { name: 'amount', type: 'money', compute: 'hours * project_id.hourly_rate', hideFrom: ['team_member'] },
      ],
      status: {
        field: 'status', initial: 'submitted',
        states: [
          { name: 'submitted', tone: 'blue' }, { name: 'approved', tone: 'green' }, { name: 'rejected', tone: 'red' },
        ],
        transitions: [
          { from: ['submitted', 'rejected'], to: 'approved', label: 'Approve', roles: ['project_manager'] },
          { from: ['submitted'], to: 'rejected', label: 'Reject', roles: ['project_manager'] },
          { from: ['rejected'], to: 'submitted', label: 'Resubmit' },
        ],
        // Demo data: older time has been reviewed; this week's is still waiting.
        seed: [
          { when: 'date < addDays(today, -6)', weights: { approved: 14, rejected: 1 } },
          { when: 'date >= addDays(today, -6)', weights: { submitted: 5, approved: 2 } },
        ],
      },
      rules: [
        { unique: ['staff_id', 'project_id', 'date'], message: 'This person already has time on this project for that day. Edit that entry instead.' },
        { check: 'hours > 0 and hours <= 16', message: 'Hours must be more than 0 and no more than 16 for one entry.' },
        { check: 'date <= today', message: 'Time cannot be logged for a day that has not happened yet.' },
        { check: 'date >= project_id.start_date', message: 'This project had not started on that day.' },
        { check: "project_id.status != 'proposed' and project_id.status != 'scheduled' and project_id.status != 'cancelled'",
          message: 'Time can only be logged on a project that has started.' },
      ],
      permissions: { project_manager: ['read', 'create', 'update', 'delete'], team_member: ['read', 'create', 'update'], accountant: ['read'] },
      seed: 170,
    },
    {
      name: 'invoices', label: 'Invoices', singular: 'Invoice', icon: 'Receipt', group: 'Money', title: 'number',
      fields: [
        { name: 'number', type: 'text', auto: 'INV-{seq:4}' },
        { name: 'project_id', type: 'ref', ref: 'projects', required: true, filter: true,
          seed: { ref: { status: ['in_progress', 'completed'], start_date: { lte: 'today-35' } } } },
        { name: 'client_id', type: 'ref', ref: 'clients', required: true, filter: true, seed: { calc: 'project_id.client_id' } },
        // Staged billing: 25% deposit, 50% interim, 25% final. A final invoice only exists for a finished project.
        { name: 'stage', type: 'select', options: ['deposit', 'interim', 'final'], required: true, filter: true,
          seed: { when: "project_id.status == 'completed'", then: { pick: ['deposit', 'interim', 'final'] }, else: { pick: ['deposit', 'interim'], weights: [3, 2] } } },
        { name: 'hours', type: 'number', required: true, seed: { calc: "round(project_id.budget_hours * if(stage == 'interim', 0.5, 0.25), 0)" } },
        { name: 'rate', type: 'money', required: true, list: false, seed: { calc: 'project_id.hourly_rate' } },
        { name: 'amount', type: 'money', compute: 'hours * rate' },
        { name: 'issued', type: 'date', required: true, seed: { after: 'project_id.start_date', days: [10, 35] } },
        { name: 'due', type: 'date', required: true, seed: { after: 'issued', days: [14, 14] } },
        { name: 'paid_on', type: 'date', list: false, seed: { when: "status == 'paid'", then: { after: 'issued', days: [1, 13], notAfter: 'today' } } },
      ],
      status: {
        field: 'status', initial: 'draft',
        states: [
          { name: 'draft', tone: 'neutral' }, { name: 'sent', tone: 'blue' }, { name: 'paid', tone: 'green' },
          { name: 'overdue', tone: 'amber' }, { name: 'void', tone: 'red' },
        ],
        transitions: [
          { from: ['draft'], to: 'sent', label: 'Send to client', roles: ['accountant'] },
          { from: ['sent', 'overdue'], to: 'paid', label: 'Mark paid', roles: ['accountant'], set: { paid_on: 'today' } },
          { from: ['sent'], to: 'overdue', label: 'Mark overdue', roles: ['accountant'],
            when: 'due < today', message: 'This invoice is not past its due date yet.' },
          { from: ['draft', 'sent', 'overdue'], to: 'void', label: 'Void', roles: ['owner'] },
        ],
        seed: [
          { when: 'due < today', weights: { paid: 16, overdue: 4, void: 1 } },
          { when: 'due >= today', weights: { draft: 2, sent: 6, paid: 2 } },
        ],
      },
      rules: [
        { check: 'due >= issued', message: 'The due date cannot be before the issue date.' },
        { check: 'hours > 0', message: 'An invoice needs at least some hours on it.' },
        { unique: ['project_id', 'stage'], message: 'This project already has an invoice for that stage.' },
        { check: 'issued >= project_id.start_date', message: 'An invoice cannot be dated before its project started.' },
      ],
      permissions: { project_manager: ['read'], team_member: [], accountant: ['read', 'create', 'update'] },
      seed: 26,
    },
  ],
  dashboard: [
    { type: 'stat', label: 'Projects in progress', entity: 'projects', agg: 'count', where: { status: 'in_progress' } },
    { type: 'stat', label: 'Hours logged, last 7 days', entity: 'time_entries', agg: 'sum', field: 'hours', where: { date: { gte: 'today-6' } } },
    { type: 'stat', label: 'Paid in 30 days', entity: 'invoices', agg: 'sum', field: 'amount', where: { status: 'paid', paid_on: { gte: 'today-30' } }, format: 'money' },
    { type: 'stat', label: 'Owed to us', entity: 'invoices', agg: 'sum', field: 'amount', where: { status: ['sent', 'overdue'] }, format: 'money' },
    { type: 'line', label: 'Invoiced', entity: 'invoices', dateField: 'issued', agg: 'sum', field: 'amount', days: 60, format: 'money' },
    { type: 'donut', label: 'Projects by status', entity: 'projects', groupBy: 'status' },
    { type: 'bar', label: 'Open tasks by person', entity: 'tasks', groupBy: 'assignee_id', where: { status: { not: 'done' } } },
    { type: 'list', label: 'Overdue invoices', entity: 'invoices', where: { status: 'overdue' }, sort: 'due', dir: 'asc', limit: 6 },
    { type: 'list', label: 'Deadlines in the next 14 days', entity: 'projects', where: { status: ['in_progress', 'on_hold'], deadline: { between: ['today', 'today+14'] } }, sort: 'deadline', dir: 'asc', limit: 6 },
  ],
});
