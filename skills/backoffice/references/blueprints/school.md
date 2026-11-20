# Blueprint: school or tuition centre

**Core record:** the student. `applied → enrolled → on_leave → graduated`, or `withdrawn`. Everything
else answers "is this child in class, how are they doing, and are the fees paid?"

**Roles**
- `principal` (owner): everything, including salaries.
- `registrar`: admissions, classes, the attendance register. No salaries; reads marks only.
- `teacher`: takes attendance and enters marks. No fee invoices, no salaries.
- `accountant`: fee invoices. No attendance, marks or medical notes.

**Entities, in order**
1. `teachers`: name, subject, email, phone, joined, monthly_salary (hide from registrar, teacher, accountant).
2. `classes` (catalogue, exact rows): name, grade, teacher (ref), room, capacity, monthly_fee.
3. `students`: admission_no (`ADM-{seq:4}`), name, class (ref), date_of_birth (seeded from the class's
   grade with a `when` chain), guardian_name, guardian_phone, medical_notes (hide from accountant),
   enrolled_on, left_on. Steps: Enrol (sets enrolled_on), Put on leave, Return, Graduate, Withdraw.
4. `attendance`: student (ref), class (`calc: 'student_id.class_id'`), day, mark (select: present, late,
   absent, excused), note.
5. `exams`: name, subject, held_on, max_marks, published_on. Status: scheduled → marking → published.
6. `exam_results`: exam (ref), student (ref), marks, remark.
7. `fee_invoices`: number (`FEE-{seq:5}`), student (ref), kind (tuition, books, transport, trip), amount
   (`calc` from the class's monthly fee for tuition), discount, total (`compute: 'amount - discount'`),
   issued, due, paid_on, method. Status: issued → paid / overdue → waived (principal only).

**Rules and coherence**
- Students: `capacity: { per: 'class_id', max: 'capacity' }` unless applied, graduated or withdrawn, so
  an applicant does not take a place until enrolled.
- Attendance: `unique: ['student_id', 'day']`, `day <= today`, `weekday(day) <= 5`. Seed it only for
  enrolled students (`{ ref: { status: 'enrolled' } }`).
- Results: `unique: ['exam_id', 'student_id']`, `marks <= exam_id.max_marks`, and no marks while the exam
  is still scheduled.
- Invoices: `due >= issued`, `discount <= amount`; "Mark overdue" has `when: 'due < today'`;
  `status.seed`: past due is paid / overdue, not yet due is issued / paid; `paid_on` only when paid,
  with `notAfter: 'today'`; issued after the student's enrolment date.

**Dashboard**
Enrolled students · Absent today (`day: 'today'`, absent) · Fees collected in 30 days · Fees outstanding ·
Fees invoiced over 60 days (line) · Students by class (bar) · Students by status (donut) · Attendance in
the last two weeks (donut) · Overdue fee invoices (list).

**Signature screen:** an attendance register: pick a class and a day, one row per student with
Present / Late / Absent / Excused buttons, the last five school days as dots, and "Mark the rest present".
