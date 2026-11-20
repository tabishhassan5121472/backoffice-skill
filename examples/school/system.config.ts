import { defineSystem } from './shared/types';

// A pupil in Grade N is about N + 5 years old, so the date of birth follows the class.
const birthFor = (grade: number) => ({ days: [-(grade + 6) * 365 - 300, -(grade + 5) * 365 - 30] as [number, number] });
const dobSeed: any = [1, 2, 3, 4, 5].reduceRight(
  (rest, g) => ({ when: `class_id.grade == '${g}'`, then: birthFor(g), else: rest }),
  birthFor(6) as any,
);

const SUBJECTS = ['Mathematics', 'English', 'Science', 'History', 'Geography'];
const exams = [
  ...SUBJECTS.map((s) => ({ name: `Monthly Test · ${s}`, term: 'monthly test', subject: s, max_marks: 50 })),
  ...SUBJECTS.map((s) => ({ name: `Mid-Term · ${s}`, term: 'mid-term', subject: s, max_marks: 100 })),
  ...SUBJECTS.map((s) => ({ name: `Final · ${s}`, term: 'final', subject: s, max_marks: 100 })),
];

export default defineSystem({
  name: 'Chalkline',
  tagline: 'Admissions, attendance, exams and fees for a small private school.',
  accent: '#1d4ed8',
  currency: 'USD',
  roles: [
    { name: 'principal', label: 'Principal', description: 'Sees and changes everything, including salaries and the team.' },
    { name: 'registrar', label: 'Registrar', description: 'Runs admissions, classes and the attendance register. Cannot see salaries or enter marks.' },
    { name: 'teacher', label: 'Teacher', description: 'Takes attendance and enters exam marks. Cannot see fees or salaries.' },
    { name: 'accountant', label: 'Accountant', description: 'Issues and collects fee invoices. Cannot see attendance, marks or medical notes.' },
  ],
  tenants: [{ name: 'Maple Grove Academy', slug: 'maplegrove' }, { name: 'Aldwyn House School', slug: 'aldwyn' }],
  entities: [
    {
      name: 'teachers', label: 'Teachers', singular: 'Teacher', icon: 'GraduationCap', group: 'School', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true, seed: 'name' },
        { name: 'subject', type: 'select', options: [...SUBJECTS, 'Art', 'Physical Education'], filter: true },
        { name: 'email', type: 'email', seed: 'email' },
        { name: 'phone', type: 'phone', seed: 'phone' },
        { name: 'employment', type: 'select', options: ['full time', 'part time'], seed: { pick: ['full time', 'part time'], weights: [4, 1] } },
        { name: 'joined', type: 'date', seed: { days: [-3200, -120] } },
        { name: 'monthly_salary', type: 'money', list: false, seed: { pick: [2400, 2650, 2900, 3200, 3500] }, hideFrom: ['registrar', 'teacher'] },
      ],
      permissions: { registrar: ['read'], teacher: ['read'], accountant: ['read'] },
      seed: [
        { name: 'Helen Marsh', subject: 'English' }, { name: 'David Okafor', subject: 'Mathematics' },
        { name: 'Priya Nair', subject: 'Science' }, { name: 'Thomas Reid', subject: 'History' },
        { name: 'Sofia Alvarez', subject: 'Geography' }, { name: 'James Whitlock', subject: 'Mathematics' },
        { name: 'Amara Bello', subject: 'Art' }, { name: 'Lucas Brandt', subject: 'Physical Education' },
      ],
    },
    {
      name: 'classes', label: 'Classes', singular: 'Class', icon: 'School', group: 'School', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'grade', type: 'text', required: true },
        { name: 'teacher_id', type: 'ref', ref: 'teachers', required: true, label: 'Class teacher' },
        { name: 'room', type: 'text' },
        { name: 'capacity', type: 'number', required: true },
        { name: 'monthly_fee', type: 'money', required: true },
      ],
      rules: [{ check: 'capacity > 0', message: 'A class needs at least one place.' }],
      permissions: { registrar: ['read', 'create', 'update'], teacher: ['read'], accountant: ['read'] },
      seed: [
        { name: 'Grade 1', grade: '1', teacher_id: 'Helen Marsh', room: 'Room 101', capacity: 18, monthly_fee: 320 },
        { name: 'Grade 2', grade: '2', teacher_id: 'David Okafor', room: 'Room 102', capacity: 18, monthly_fee: 320 },
        { name: 'Grade 3', grade: '3', teacher_id: 'Priya Nair', room: 'Room 103', capacity: 20, monthly_fee: 360 },
        { name: 'Grade 4', grade: '4', teacher_id: 'Thomas Reid', room: 'Room 201', capacity: 20, monthly_fee: 360 },
        { name: 'Grade 5', grade: '5', teacher_id: 'Sofia Alvarez', room: 'Room 202', capacity: 16, monthly_fee: 410 },
        { name: 'Grade 6', grade: '6', teacher_id: 'James Whitlock', room: 'Room 203', capacity: 16, monthly_fee: 410 },
      ],
    },
    {
      name: 'students', label: 'Students', singular: 'Student', icon: 'Users', group: 'School', title: 'name',
      fields: [
        { name: 'admission_no', type: 'text', auto: 'ADM-{seq:4}', label: 'Admission no.' },
        { name: 'name', type: 'text', required: true, seed: 'name' },
        // Demo data: only the top class graduates.
        { name: 'class_id', type: 'ref', ref: 'classes', required: true, filter: true,
          seed: { when: "status == 'graduated'", then: { ref: { grade: '6' } }, else: { ref: {} } } },
        { name: 'guardian_name', type: 'text', required: true, seed: 'name', label: 'Parent / guardian' },
        { name: 'guardian_phone', type: 'phone', seed: 'phone' },
        { name: 'date_of_birth', type: 'date', list: false, seed: dobSeed },
        { name: 'address', type: 'text', list: false, seed: 'address' },
        { name: 'enrolled_on', type: 'date', list: false, seed: { when: "status != 'applied'", then: { days: [-900, -80] } } },
        { name: 'left_on', type: 'date', list: false, seed: { when: "status == 'withdrawn' or status == 'graduated'", then: { days: [-25, -1] } } },
        { name: 'medical_notes', type: 'longtext', list: false, hideFrom: ['accountant'],
          seed: { pick: ['', '', '', '', 'Nut allergy. EpiPen kept in the office.', 'Asthma. Carries an inhaler.', 'Wears glasses for board work.', 'Lactose intolerant.'] } },
      ],
      status: {
        field: 'status', initial: 'applied',
        states: [
          { name: 'applied', tone: 'blue', weight: 3 }, { name: 'enrolled', tone: 'green', weight: 26 },
          { name: 'on_leave', tone: 'amber', weight: 1, label: 'On leave' },
          { name: 'graduated', tone: 'neutral', weight: 2 }, { name: 'withdrawn', tone: 'red', weight: 2 },
        ],
        transitions: [
          { from: ['applied'], to: 'enrolled', label: 'Enrol', set: { enrolled_on: 'today' }, roles: ['registrar'] },
          { from: ['enrolled'], to: 'on_leave', label: 'Put on leave', roles: ['registrar'] },
          { from: ['on_leave'], to: 'enrolled', label: 'Return from leave', roles: ['registrar'] },
          { from: ['enrolled'], to: 'graduated', label: 'Graduate', set: { left_on: 'today' }, roles: ['principal'] },
          { from: ['applied', 'enrolled', 'on_leave'], to: 'withdrawn', label: 'Withdraw', set: { left_on: 'today' }, roles: ['registrar'] },
        ],
      },
      rules: [
        { capacity: { per: 'class_id', max: 'capacity' }, unless: { status: ['applied', 'graduated', 'withdrawn'] },
          message: 'This class is full. Raise its capacity or choose another class.' },
      ],
      permissions: { registrar: ['read', 'create', 'update'], teacher: ['read'], accountant: ['read'] },
      seed: 84,
    },
    {
      name: 'attendance', label: 'Attendance', singular: 'Attendance mark', icon: 'CalendarCheck', group: 'Teaching', title: 'entry',
      fields: [
        { name: 'entry', type: 'text', compute: "student_id.name + ' · ' + day", list: false },
        { name: 'student_id', type: 'ref', ref: 'students', required: true, seed: { ref: { status: 'enrolled' } } },
        { name: 'class_id', type: 'ref', ref: 'classes', required: true, filter: true, seed: { calc: 'student_id.class_id' } },
        { name: 'day', type: 'date', required: true, label: 'Date', seed: { days: [-13, 0] } },
        { name: 'mark', type: 'select', required: true, filter: true, options: ['present', 'absent', 'late', 'excused'],
          seed: { pick: ['present', 'absent', 'late', 'excused'], weights: [44, 3, 3, 2] } },
        { name: 'note', type: 'text',
          seed: { when: "mark == 'excused'", then: { pick: ['Medical appointment', 'Family event', 'Unwell, parent phoned'] },
            else: { when: "mark == 'late'", then: { pick: ['Bus delayed', 'Arrived after first bell', 'Traffic'] } } } },
      ],
      rules: [
        { unique: ['student_id', 'day'], message: 'Attendance is already marked for this student on that date.' },
        { check: 'day <= today', message: 'Attendance cannot be marked for a future date.' },
        { check: 'weekday(day) <= 5', message: 'Attendance is only taken on school days, Monday to Friday.' },
      ],
      permissions: { registrar: ['read', 'create', 'update', 'delete'], teacher: ['read', 'create', 'update'], accountant: [] },
      seed: 500,
    },
    {
      name: 'exams', label: 'Exams', singular: 'Exam', icon: 'ClipboardList', group: 'Teaching', title: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'term', type: 'select', required: true, options: ['monthly test', 'mid-term', 'final'], filter: true },
        { name: 'subject', type: 'select', required: true, options: SUBJECTS, filter: true },
        { name: 'exam_date', type: 'date', required: true,
          seed: { when: "term == 'monthly test'", then: { days: [-62, -50] },
            else: { when: "term == 'mid-term'", then: { days: [-24, -12] }, else: { days: [12, 26] } } } },
        { name: 'max_marks', type: 'number', required: true },
        { name: 'teacher_id', type: 'ref', ref: 'teachers', required: true, label: 'Set by' },
        { name: 'published_on', type: 'date', list: false, seed: { when: "status == 'published'", then: { after: 'exam_date', days: [5, 10] } } },
      ],
      status: {
        field: 'status', initial: 'scheduled',
        states: [
          { name: 'scheduled', tone: 'blue' }, { name: 'marking', tone: 'amber' }, { name: 'published', tone: 'green' },
        ],
        transitions: [
          { from: ['scheduled'], to: 'marking', label: 'Exam held, start marking',
            when: 'exam_date <= today', message: 'This exam has not taken place yet.' },
          { from: ['marking'], to: 'published', label: 'Publish results', set: { published_on: 'today' }, roles: ['principal'] },
        ],
        seed: [
          { when: 'exam_date < addDays(today, -40)', weights: { published: 1 } },
          { when: 'exam_date < today', weights: { published: 2, marking: 3 } },
          { when: 'exam_date >= today', weights: { scheduled: 1 } },
        ],
      },
      rules: [{ check: 'max_marks > 0', message: 'Maximum marks must be more than zero.' }],
      permissions: { registrar: ['read'], teacher: ['read', 'create', 'update'], accountant: [] },
      seed: exams,
    },
    {
      name: 'exam_results', label: 'Exam results', singular: 'Exam result', icon: 'Award', group: 'Teaching', title: 'entry',
      fields: [
        { name: 'entry', type: 'text', compute: "student_id.name + ' · ' + exam_id.name", list: false },
        { name: 'exam_id', type: 'ref', ref: 'exams', required: true, filter: true, seed: { ref: { status: ['marking', 'published'] } } },
        { name: 'student_id', type: 'ref', ref: 'students', required: true, seed: { ref: { status: 'enrolled' } } },
        { name: 'marks', type: 'number', required: true,
          seed: { when: 'exam_id.max_marks == 50', then: { int: [19, 50] }, else: { int: [38, 100] } } },
        { name: 'percent', type: 'number', compute: 'round(marks / exam_id.max_marks * 100, 1)', label: 'Percent' },
        { name: 'grade', type: 'text', filter: false,
          compute: "if(marks / exam_id.max_marks >= 0.85, 'A', if(marks / exam_id.max_marks >= 0.7, 'B', if(marks / exam_id.max_marks >= 0.55, 'C', if(marks / exam_id.max_marks >= 0.4, 'D', 'F'))))" },
        { name: 'remarks', type: 'text', list: false,
          seed: { when: 'marks / exam_id.max_marks < 0.5', then: { pick: ['Needs extra support before the next paper.', 'Parents to be invited for a meeting.'] },
            else: { when: 'marks / exam_id.max_marks >= 0.85', then: { pick: ['Excellent work.', 'Outstanding paper.'] } } } },
      ],
      rules: [
        { unique: ['exam_id', 'student_id'], message: 'This student already has a result for that exam.' },
        { check: 'marks >= 0 and marks <= exam_id.max_marks', message: 'Marks must be between zero and the maximum for this exam.' },
        { check: "exam_id.status != 'scheduled'", message: 'Marks cannot be entered before the exam has been held.' },
      ],
      permissions: { registrar: ['read'], teacher: ['read', 'create', 'update', 'delete'], accountant: [] },
      seed: 240,
    },
    {
      name: 'fee_invoices', label: 'Fee invoices', singular: 'Fee invoice', icon: 'Receipt', group: 'Fees', title: 'number',
      fields: [
        { name: 'number', type: 'text', auto: 'FEE-{seq:5}' },
        { name: 'student_id', type: 'ref', ref: 'students', required: true, seed: { ref: { status: ['enrolled', 'on_leave'] } } },
        { name: 'fee_type', type: 'select', required: true, filter: true, options: ['tuition', 'transport', 'books', 'exam fee'],
          seed: { pick: ['tuition', 'transport', 'books', 'exam fee'], weights: [12, 3, 2, 1] } },
        { name: 'amount', type: 'money', required: true, list: false,
          seed: { when: "fee_type == 'tuition'", then: { calc: 'student_id.class_id.monthly_fee' },
            else: { when: "fee_type == 'transport'", then: { pick: [60, 85] }, else: { when: "fee_type == 'books'", then: { pick: [45, 70, 95] }, else: { pick: [25] } } } } },
        { name: 'discount', type: 'money', required: true, list: false,
          seed: { when: "fee_type == 'tuition'", then: { pick: [0, 20, 40], weights: [8, 1, 1] }, else: { pick: [0] } } },
        { name: 'total', type: 'money', compute: 'amount - discount' },
        { name: 'issued', type: 'date', required: true, seed: { days: [-70, 0] } },
        { name: 'due', type: 'date', required: true, seed: { after: 'issued', days: [14, 14] } },
        { name: 'paid_on', type: 'date', seed: { when: "status == 'paid'", then: { after: 'issued', days: [0, 13], notAfter: 'today' } } },
        { name: 'method', type: 'select', list: false, options: ['cash', 'bank transfer', 'card'],
          seed: { when: "status == 'paid'", then: { pick: ['bank transfer', 'cash', 'card'], weights: [5, 3, 2] } } },
      ],
      status: {
        field: 'status', initial: 'issued',
        states: [
          { name: 'issued', tone: 'blue' }, { name: 'paid', tone: 'green' },
          { name: 'overdue', tone: 'red' }, { name: 'waived', tone: 'neutral' },
        ],
        transitions: [
          { from: ['issued', 'overdue'], to: 'paid', label: 'Mark paid', set: { paid_on: 'today' }, roles: ['accountant'] },
          { from: ['issued'], to: 'overdue', label: 'Mark overdue', roles: ['accountant'],
            when: 'due < today', message: 'This invoice is not past its due date yet.' },
          { from: ['issued', 'overdue'], to: 'waived', label: 'Waive', roles: ['principal'] },
        ],
        seed: [
          { when: 'due < today', weights: { paid: 16, overdue: 4, waived: 1 } },
          { when: 'due >= today', weights: { issued: 5, paid: 2 } },
        ],
      },
      rules: [
        { check: 'due >= issued', message: 'The due date cannot be before the issue date.' },
        { check: 'amount > 0', message: 'The amount must be more than zero.' },
        { check: 'discount >= 0 and discount <= amount', message: 'The discount cannot be more than the amount.' },
      ],
      permissions: { registrar: ['read'], teacher: [], accountant: ['read', 'create', 'update'] },
      seed: 110,
    },
  ],
  dashboard: [
    { type: 'stat', label: 'Enrolled students', entity: 'students', agg: 'count', where: { status: 'enrolled' } },
    { type: 'stat', label: 'Absent today', entity: 'attendance', agg: 'count', where: { day: 'today', mark: 'absent' } },
    { type: 'stat', label: 'Fees collected, 30 days', entity: 'fee_invoices', agg: 'sum', field: 'total', where: { status: 'paid', paid_on: { gte: 'today-30' } }, format: 'money' },
    { type: 'stat', label: 'Fees outstanding', entity: 'fee_invoices', agg: 'sum', field: 'total', where: { status: ['issued', 'overdue'] }, format: 'money' },
    { type: 'line', label: 'Fees invoiced', entity: 'fee_invoices', dateField: 'issued', agg: 'sum', field: 'total', days: 60, format: 'money' },
    { type: 'bar', label: 'Students by class', entity: 'students', groupBy: 'class_id', where: { status: ['enrolled', 'on_leave'] } },
    { type: 'donut', label: 'Students by status', entity: 'students', groupBy: 'status' },
    { type: 'donut', label: 'Attendance, last two weeks', entity: 'attendance', groupBy: 'mark' },
    { type: 'bar', label: 'Results entered by exam', entity: 'exam_results', groupBy: 'exam_id' },
    { type: 'list', label: 'Overdue fee invoices', entity: 'fee_invoices', where: { status: 'overdue' }, sort: 'due', dir: 'asc', limit: 6 },
  ],
});
