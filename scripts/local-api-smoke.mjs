import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = new URL(process.env.EDUTRACK_TEST_URL || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Local API tests only run against localhost.');
const origin = { Origin: base.origin, Referer: `${base.origin}/` };
const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toLowerCase();
const owner = { username: `qa_owner_${suffix}`, password: `QAO_${randomUUID()}_local` };
const teacher = { username: `qa_teacher_${suffix}`, password: `QAT_${randomUUID()}_local` };
const studentLogin = { username: `qa_student_${suffix}`, password: `QAS_${randomUUID()}_local` };
const moderatorLogin = { username: `qa_mod_${suffix}`, password: `QAM_${randomUUID()}_local` };

async function request(path, { method = 'GET', body, rawBody, contentType, auth } = {}) {
  const headers = { ...origin, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (rawBody !== undefined) headers['Content-Type'] = contentType || 'application/octet-stream';
  if (auth?.cookie) headers.Cookie = auth.cookie;
  if (auth?.csrf && method !== 'GET') headers['X-CSRF-Token'] = auth.csrf;
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : rawBody
  });
  const type = response.headers.get('content-type') || '';
  const result = type.includes('application/json') ? await response.json().catch(() => ({})) : null;
  const cookie = response.headers.get('set-cookie')?.split(';')[0] || '';
  return { response, result, cookie };
}

async function login(credentials, role) {
  const output = await request('/api/login', { method: 'POST', body: { ...credentials, role } });
  assert.equal(output.response.status, 200, `${role} login failed.`);
  assert.equal(output.result.user?.role, role, `Login did not return the ${role} role.`);
  return { cookie: output.cookie, csrf: output.result.csrf, user: output.result.user };
}

const registered = await request('/api/register-college', {
  method: 'POST',
  body: { collegeName: `Edutrack Local QA ${suffix}`, fullName: 'Local QA Owner', username: owner.username, password: owner.password }
});
assert.equal(registered.response.status, 201, 'Could not register the isolated local QA college.');
const ownerAuth = { cookie: registered.cookie, csrf: registered.result.csrf, user: registered.result.user };

const teacherCreated = await request('/api/teachers', {
  method: 'POST', auth: ownerAuth,
  body: { fullName: 'Local QA Teacher', username: teacher.username, password: teacher.password }
});
assert.equal(teacherCreated.response.status, 201, 'Owner could not create a teacher.');
const teacherAuth = await login(teacher, 'TEACHER');
const wrongRole = await request('/api/login', { method: 'POST', body: { ...teacher, role: 'OWNER' } });
assert.equal(wrongRole.response.status, 401, 'Login accepted a mismatched requested role.');
const ownerOnly = await request('/api/teachers', { auth: teacherAuth });
assert.equal(ownerOnly.response.status, 403, 'Teacher reached owner-only teacher administration.');

const department = await request('/api/departments', { method: 'POST', auth: ownerAuth, body: { name: `QA ${suffix}` } });
assert.equal(department.response.status, 201, 'Owner could not create test department data.');
const course = await request('/api/courses', {
  method: 'POST', auth: ownerAuth,
  body: { departmentId: department.result.id, name: `QA Course ${suffix}`, degree: 'QA', semesterCount: 1 }
});
assert.equal(course.response.status, 201, 'Owner could not create test course data.');

const subject = await request('/api/subjects', {
  method: 'POST', auth: teacherAuth,
  body: { departmentId: department.result.id, courseId: course.result.id, semesterOrdinal: 1, name: 'QA Attendance', code: `QA${suffix}`, section: 'A', facultyName: 'Local QA Teacher' }
});
assert.equal(subject.response.status, 201, 'Teacher could not create a subject.');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const studentCreated = await request('/api/students', {
  method: 'POST', auth: teacherAuth,
  body: {
    fullName: 'Local QA Student', username: studentLogin.username, password: studentLogin.password,
    rollNumber: `R${suffix}`, registrationNumber: '', departmentId: department.result.id,
    courseId: course.result.id, semesterOrdinal: 1, academicYear: '2026-27', section: 'A'
  }
});
assert.equal(studentCreated.response.status, 201, 'Teacher could not create a student without a registration number.');
assert.ok(!studentCreated.result.student?.registrationNumber, 'Blank registration number was not stored as optional.');
assert.ok(studentCreated.result.accessCode, 'New student did not receive a one-time access code.');
const studentAuth = await login({ ...studentLogin, accessCode: studentCreated.result.accessCode }, 'STUDENT');
const studentDenied = await request('/api/students', { auth: studentAuth });
assert.equal(studentDenied.response.status, 403, 'Student reached student-management APIs.');

const noticeTitle = `Local QA Notice ${suffix}`;
const noticeCreated = await request('/api/notices', {
  method: 'POST', auth: teacherAuth,
  body: { title: noticeTitle, body: 'Text-only notice test.', visibility: 'students', pinned: true }
});
assert.equal(noticeCreated.response.status, 201, 'Teacher could not publish a text-only notice.');
const studentNotices = await request('/api/notices', { auth: studentAuth });
assert.ok(studentNotices.result.notices?.some(item => item.id === noticeCreated.result.id && item.title === noticeTitle), 'Student could not read the notice addressed to students.');
const studentNoticeAdmin = await request('/api/notices?manage=1', { auth: studentAuth });
assert.equal(studentNoticeAdmin.response.status, 403, 'Student reached notice-management APIs.');
const imageRoute = await request(`/api/notices/${encodeURIComponent(noticeCreated.result.id)}/image`, { auth: studentAuth });
assert.equal(imageRoute.response.status, 404, 'The no-R2 deployment unexpectedly exposed a notice-image route.');
const noticeUpdated = await request(`/api/notices/${encodeURIComponent(noticeCreated.result.id)}`, {
  method: 'PATCH', auth: teacherAuth,
  body: { title: noticeTitle, body: 'Updated text-only notice.', visibility: 'all', pinned: false }
});
assert.equal(noticeUpdated.response.status, 200, 'Teacher could not edit a notice.');
const managedNotices = await request('/api/notices?manage=1', { auth: teacherAuth });
assert.ok(managedNotices.result.notices?.some(item => item.id === noticeCreated.result.id && item.body === 'Updated text-only notice.'), 'Notice edit did not persist.');
const noticeDeleted = await request(`/api/notices/${encodeURIComponent(noticeCreated.result.id)}`, { method: 'DELETE', auth: teacherAuth });
assert.equal(noticeDeleted.response.status, 200, 'Teacher could not delete a notice.');

const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
const routine = await request('/api/routines', {
  method: 'POST', auth: teacherAuth,
  body: {
    departmentId: department.result.id, courseId: course.result.id, subjectId: subject.result.id,
    semesterName: 'Semester 1', section: 'A', weekday, effectiveFrom: today,
    startsAt: '00:00', endsAt: '00:50', periodType: 'class', roomNumber: 'QA-1'
  }
});
assert.equal(routine.response.status, 201, 'Teacher could not add a routine period.');
const recess = await request('/api/routines', {
  method: 'POST', auth: teacherAuth,
  body: {
    departmentId: department.result.id, courseId: course.result.id, subjectId: subject.result.id,
    semesterName: 'Semester 1', section: 'A', weekday, effectiveFrom: today,
    startsAt: '00:50', endsAt: '01:00', periodType: 'break'
  }
});
assert.equal(recess.response.status, 201, 'Teacher could not add a dedicated recess period.');
const routines = await request('/api/routines', { auth: teacherAuth });
assert.ok(routines.result.periods?.some(item => item.periodType === 'break' && item.subjectName === 'RECESS'), 'Recess did not persist in the weekly routine.');
assert.ok(routines.result.periods?.some(item => item.subjectId === subject.result.id && item.facultyName === 'Local QA Teacher'), 'Routine did not use the subject’s assigned teacher.');

const enrollment = await request('/api/enrollments', {
  method: 'POST', auth: teacherAuth,
  body: { studentId: studentCreated.result.student.id, subjectId: subject.result.id, startsOn: today }
});
assert.equal(enrollment.response.status, 201, 'Teacher could not enroll the student.');
const started = await request('/api/classrooms', {
  method: 'POST', auth: teacherAuth,
  body: { subjectId: subject.result.id, heldOn: today, startsAt: '00:00', endsAt: '23:59', roomNumber: 'QA-1' }
});
assert.equal(started.response.status, 201, 'Teacher could not start a classroom.');
const classroomId = started.result.id;
const classroom = await request(`/api/classrooms/${encodeURIComponent(classroomId)}`, { auth: teacherAuth });
assert.equal(classroom.response.status, 200, 'Classroom roster did not synchronize.');
assert.equal(classroom.result.roster?.length, 1, 'Classroom roster is missing the enrolled student.');
const marked = await request(`/api/classrooms/${encodeURIComponent(classroomId)}/attendance`, {
  method: 'PUT', auth: teacherAuth,
  body: { entries: [{ studentId: studentCreated.result.student.id, status: 'present' }] }
});
assert.equal(marked.response.status, 200, 'Teacher could not save attendance.');
const ended = await request(`/api/classrooms/${encodeURIComponent(classroomId)}`, { method: 'PATCH', auth: teacherAuth, body: { action: 'end' } });
assert.equal(ended.response.status, 200, 'Teacher could not end a classroom.');
const history = await request(`/api/attendance/history?subjectId=${encodeURIComponent(subject.result.id)}&details=1`, { auth: teacherAuth });
assert.ok(history.result.records?.some(row => row.studentId === studentCreated.result.student.id && row.status === 'present'), 'Attendance history did not include the saved mark.');
const reports = await request('/api/reports', { auth: teacherAuth });
assert.ok(reports.result.subjects?.some(row => row.code === `QA${suffix}` && row.present >= 1), 'Attendance analytics did not include the saved mark.');
const studentSummary = await request('/api/student/summary', { auth: studentAuth });
assert.equal(studentSummary.result.attendance?.attended, 1, 'Student attendance summary did not include the saved mark.');

const moderatorCreated = await request('/api/moderators', {
  method: 'POST', auth: ownerAuth,
  body: { fullName: 'Local QA Moderator', username: moderatorLogin.username, password: moderatorLogin.password }
});
assert.equal(moderatorCreated.response.status, 201, 'Owner could not create a moderator.');
const permissions = await request(`/api/moderators/${encodeURIComponent(moderatorCreated.result.moderator.id)}/permissions`, {
  method: 'PUT', auth: ownerAuth,
  body: { permissions: [{ permission: 'view_routines', scopeType: 'subject', scopeId: subject.result.id }] }
});
assert.equal(permissions.response.status, 200, 'Owner could not scope moderator permissions.');
const moderatorAuth = await login(moderatorLogin, 'MODERATOR');
const moderatorRoutines = await request('/api/routines', { auth: moderatorAuth });
assert.ok(moderatorRoutines.result.periods?.some(item => item.subjectId === subject.result.id), 'Moderator’s assigned routine scope was not applied.');
const moderatorQr = await request(`/api/students/${encodeURIComponent(studentCreated.result.student.id)}/qr-code`, { method: 'POST', auth: moderatorAuth, body: {} });
assert.equal(moderatorQr.response.status, 403, 'Moderator received QR management access without permission.');

const issued = await request(`/api/students/${encodeURIComponent(studentCreated.result.student.id)}/qr-code`, { method: 'POST', auth: teacherAuth, body: {} });
assert.equal(issued.response.status, 200, 'Teacher could not issue a QR login token.');
const qrLogin = await request('/api/login/qr', { method: 'POST', body: { token: issued.result.token } });
assert.equal(qrLogin.response.status, 200, 'One-time student QR login failed.');
assert.equal(qrLogin.result.user?.role, 'STUDENT');
const replay = await request('/api/login/qr', { method: 'POST', body: { token: issued.result.token } });
assert.equal(replay.response.status, 401, 'A used QR login token was replayed.');
const toRevoke = await request(`/api/students/${encodeURIComponent(studentCreated.result.student.id)}/qr-code`, { method: 'POST', auth: teacherAuth, body: {} });
const revoked = await request(`/api/students/${encodeURIComponent(studentCreated.result.student.id)}/qr-code`, { method: 'DELETE', auth: teacherAuth });
assert.equal(revoked.response.status, 200, 'Teacher could not revoke the QR token.');
const revokedLogin = await request('/api/login/qr', { method: 'POST', body: { token: toRevoke.result.token } });
assert.equal(revokedLogin.response.status, 401, 'A revoked QR login token was accepted.');

const security = await request('/');
assert.equal(security.response.headers.get('x-frame-options'), 'DENY', 'The app response is missing X-Frame-Options.');
process.stdout.write('Local API smoke passed: owner, teacher, moderator, and student login; role checks; optional registration; text notice create/read/edit/delete; routines/recess; classroom and attendance; reports; QR issue/use/replay/revoke; and security headers.\n');
