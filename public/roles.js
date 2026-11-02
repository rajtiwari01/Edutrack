(() => {
  const app = window.edutrack;
  if (!app) return;
  const { state, api, toast, esc, fmtDate, today, stat, button, badge, empty, table, field, selectField, textareaField, modalForm, confirmDialog, original } = app;
  const roles = ['OWNER', 'TEACHER', 'MODERATOR', 'STUDENT'];
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isNoticeManager = () => state.user?.role === 'OWNER' || state.user?.role === 'TEACHER' || state.user?.permissions?.includes('manage_notices');

  if (Array.isArray(app.PERMISSIONS) && !app.PERMISSIONS.some(item => item[0] === 'manage_notices')) app.PERMISSIONS.push(['manage_notices', 'Manage notices']);

  function navItems() {
    if (state.user.role === 'OWNER') return [['overview','Overview'],['students','Students'],['teachers','Teachers'],['moderators','Moderators'],['academics','Academics'],['attendance','Attendance'],['routines','Class routine'],['holidays','Holidays'],['reports','Reports & audit'],['notices','Notices'],['security','Security']];
    if (state.user.role === 'TEACHER') return [['overview','Overview'],['students','Students'],['subjects','Subjects'],['attendance','Attendance'],['routines','Class routine'],['history','Attendance history'],['reports','Analytics'],['notices','Notices'],['security','Security']];
    if (state.user.role === 'STUDENT') return [['overview','Overview'],['history','Attendance history'],['routine','My timetable'],['holidays','Holidays'],['notices','Notices']];
    const permissions = state.user.permissions || [], items = [['overview','Overview']];
    if (permissions.some(item => ['view_attendance','mark_attendance'].includes(item))) items.push(['attendance','Attendance']);
    if (permissions.some(item => ['view_assigned_subjects','manage_assigned_subjects'].includes(item))) items.push(['subjects','Subjects']);
    if (permissions.includes('view_attendance_history')) items.push(['history','Attendance history']);
    if (permissions.some(item => ['view_routines','manage_routines'].includes(item))) items.push(['routine','Class routine']);
    if (permissions.includes('view_holidays')) items.push(['holidays','Holidays']);
    items.push(['notices','Notices']);
    return items;
  }

  function selectAuthMode(mode) {
    if (mode === 'register') {
      document.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-current', button.dataset.authMode === mode ? 'page' : 'false'));
      const panel = document.querySelector('#auth-panel');
      panel.innerHTML = `<p class="mobile-note">Register a college workspace and create its first OWNER account.</p><form id="register-form" class="form">${field('collegeName','College name','text','','required maxlength="180" autocomplete="organization"')}${field('fullName','Owner full name','text','','required maxlength="180" autocomplete="name"')}${field('username','Owner username','text','','required minlength="3" maxlength="64" autocomplete="username"')}${field('password','Password','password','','required minlength="12" maxlength="200" autocomplete="new-password"')}<button class="button primary full">Register your college</button></form>`;
      panel.querySelector('#register-form').addEventListener('submit', window.registerCollege);
      return;
    }
    const role = roles.includes(mode) ? mode : 'OWNER';
    state.loginRole = role;
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-current', button.dataset.authMode === role ? 'page' : 'false'));
    const panel = document.querySelector('#auth-panel');
    const student = role === 'STUDENT';
    panel.innerHTML = `<p class="mobile-note">${role === 'OWNER' ? 'Sign in to your college owner workspace.' : role === 'TEACHER' ? 'Sign in to your teaching workspace.' : role === 'MODERATOR' ? 'Sign in with your moderator account.' : 'Students can sign in with their username, password, and personal access code.'}</p><form id="login-form" class="form">${field('username','Username','text','','autocomplete="username" required')}${field('password','Password','password','','autocomplete="current-password" required')}${student ? field('accessCode','Student access code','password','','autocomplete="one-time-code"') : ''}<button class="button primary full">Sign in as ${esc(role.toLowerCase())}</button>${student ? '<button class="button soft full" type="button" data-action="scan-qr">Scan student QR code</button>' : ''}</form>`;
    panel.querySelector('#login-form').addEventListener('submit', window.login);
  }

  function renderLogin() {
    document.querySelector('#identity').hidden = true;
    document.querySelector('#logout').hidden = true;
    document.querySelector('#college-name').textContent = 'College academic platform';
    document.querySelector('#college-name').hidden = false;
    document.querySelector('#notification-button').hidden = true;
    document.querySelector('#app').innerHTML = `<div class="login-wrap"><section class="login-card"><p class="eyebrow">College academic platform</p><h1>Edutrack</h1><p class="subtle">Secure attendance and academic management for your college.</p><nav class="nav auth-options" aria-label="Choose your sign-in role"><button data-auth-mode="OWNER">OWNER</button><button data-auth-mode="TEACHER">TEACHER</button><button data-auth-mode="MODERATOR">MODERATOR</button><button data-auth-mode="STUDENT">STUDENT</button><button data-auth-mode="register">REGISTER COLLEGE</button></nav><div id="auth-panel"></div><details id="owner-recovery" style="margin-top:18px"><summary>Owner account recovery</summary><p class="mobile-note">Use the private recovery code issued when the college was registered.</p><form id="recovery-form" class="form">${field('username','Owner username','text','','required autocomplete="username"')}${field('recoveryKey','Owner recovery code','password','','required autocomplete="off"')}${field('password','New password','password','','required minlength="12" autocomplete="new-password"')}<button class="button soft full">Reset owner password</button></form></details></section></div>`;
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => selectAuthMode(button.dataset.authMode)));
    document.querySelector('#recovery-form').addEventListener('submit', window.recoverOwner);
    selectAuthMode('OWNER');
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector('button[type=submit],button:not([type])');
    submit.disabled = true;
    try {
      const credentials = Object.fromEntries(new FormData(form));
      credentials.role = state.loginRole || 'OWNER';
      const result = await api('/api/login', { method: 'POST', body: credentials });
      state.user = result.user; state.csrf = result.csrf;
      await original.loadDashboard();
    } catch (error) { toast(error.message); }
    finally { submit.disabled = false; }
  }

  function noticeCard(notice, canManage = false) {
    return `<article class="notice-card ${notice.pinned ? 'is-pinned' : ''}"><div class="notice-card-head"><h3>${esc(notice.title)}</h3>${notice.pinned ? badge('IMPORTANT','warn') : ''}</div>${notice.imageUrl ? `<img class="notice-image" src="${esc(notice.imageUrl)}" alt="${esc(notice.title)}" loading="lazy">` : ''}<p class="notice-body">${esc(notice.body)}</p><div class="notice-meta"><span>${esc(notice.authorName || 'College')}</span><time>${fmtDate((notice.publishedAt || '').slice(0,10))}</time>${notice.expiresAt ? `<small>Until ${fmtDate(notice.expiresAt.slice(0,10))}</small>` : ''}</div>${canManage ? `<div class="row-actions"><button class="button small soft" data-action="notice-edit" data-id="${esc(notice.id)}">Edit</button><button class="button small danger" data-action="notice-delete" data-id="${esc(notice.id)}">Delete</button></div>` : ''}</article>`;
  }

  function noticePanel(notices, compact = false) {
    const canManage = isNoticeManager();
    return `<article class="card span-12 notice-panel"><div class="section-title"><div><p class="eyebrow">College updates</p><h2>Notices & announcements</h2></div><div class="row-actions">${compact ? button('All notices','go-notices','soft small') : ''}${canManage ? button('Publish notice','new-notice','primary small') : ''}</div></div>${notices.length ? `<div class="notice-grid">${notices.slice(0, compact ? 4 : 100).map(item => noticeCard(item, canManage && !compact)).join('')}</div>` : empty('No notices yet','New college announcements will appear here.')}</article>`;
  }

  async function viewNotices() {
    const data = await api(`/api/notices${isNoticeManager() ? '?manage=1' : ''}`);
    return `<div class="grid">${noticePanel(data.notices || [])}</div>`;
  }

  async function viewOverview() {
    if (state.user.role === 'MODERATOR') {
      const notices = await api('/api/notices');
      return `${window.viewModeratorOverview()}<div class="grid">${noticePanel(notices.notices || [], true)}</div>`;
    }
    if (state.user.role === 'STUDENT') {
      const notices = await api('/api/notices');
      const html = await original.viewOverview();
      return html.replace(/<\/div>$/, `${noticePanel(notices.notices || [], true)}</div>`);
    }
    if (state.user.role === 'OWNER') {
      const [html, notices] = await Promise.all([original.viewOverview(), api('/api/notices')]);
      return html.replace(/<\/div>$/, `${noticePanel(notices.notices || [], true)}</div>`);
    }
    const [dashboard, routines, classrooms, notices] = await Promise.all([
      api('/api/dashboard'), api('/api/routines'), api(`/api/classrooms?date=${encodeURIComponent(today())}`), api('/api/notices')
    ]);
    const weekday = new Date(`${today()}T00:00:00Z`).getUTCDay();
    const todayPeriods = (routines.periods || []).filter(period => period.weekday === weekday).sort((a,b) => a.startsAt.localeCompare(b.startsAt));
    const active = (classrooms.sessions || []).filter(item => item.status === 'live');
    const upcoming = (classrooms.scheduled || []).filter(item => item.status === 'upcoming' || item.status === 'scheduled');
    const routineHtml = todayPeriods.length ? `<div class="routine-track">${todayPeriods.map(period => `<article class="timetable-cell ${period.periodType === 'break' ? 'is-recess' : ''}"><small>${esc(period.startsAt)}–${esc(period.endsAt)}</small><strong>${esc(period.subjectName)}</strong><span>${esc(period.facultyName || 'Faculty TBA')}</span></article>`).join('')}</div>` : empty('No classes scheduled today');
    const activeHtml = active.length ? active.map(item => `<div class="row"><div class="row-main"><strong>${esc(item.subjectName)}</strong><small>${esc(item.teacherName || 'Teacher')} · ${esc(item.startsAt || '')} · ${esc(item.roomNumber || 'Room TBA')}</small></div>${badge('LIVE','success')}</div>`).join('') : empty('No active classrooms');
    const upcomingHtml = upcoming.length ? `<h3>Upcoming classes</h3>${upcoming.slice(0,3).map(item => `<div class="row"><div class="row-main"><strong>${esc(item.subjectName)}</strong><small>${esc(item.startsAt)}–${esc(item.endsAt)} · ${esc(item.facultyName || 'Faculty TBA')}</small></div></div>`).join('')}` : '';
    return `<div class="grid">${stat('Students',dashboard.students,'Active student accounts')}${stat('Subjects',dashboard.subjects,'Active subjects')}${stat('Classes today',dashboard.classesToday,'Scheduled or recorded today')}${stat('Attendance below 75%',dashboard.attendance.lowAttendance,'Students who may need support')}<article class="card span-6"><h2>Today's routine</h2>${routineHtml}</article><article class="card span-6"><h2>Classrooms</h2>${activeHtml}${upcomingHtml}</article><article class="card span-12"><h2>Quick actions</h2><div class="row-actions">${button('Manage students','students','soft')}${button('Take attendance','go-attendance','primary')}${button('Class routine','go-routines','soft')}${button('Attendance analytics','go-reports','soft')}</div></article>${noticePanel(notices.notices || [], true)}</div>`;
  }

  async function viewStudents() {
    const { students } = await api('/api/students'), owner = state.user.role === 'OWNER';
    const actionButtons = student => {
      if (student.status === 'deleted') return '';
      const controls = [
        `<button class="button small soft" data-action="student-edit" data-id="${esc(student.id)}">Edit</button>`,
        `<button class="button small soft" data-action="student-code" data-id="${esc(student.id)}">New access code</button>`,
        `<button class="button small quiet" data-action="student-qr-revoke" data-id="${esc(student.id)}">Revoke QR</button>`,
        `<button class="button small ${student.status === 'active' ? 'danger' : 'soft'}" data-action="student-status" data-id="${esc(student.id)}" data-status="${esc(student.status)}">${student.status === 'active' ? 'Suspend' : 'Reactivate'}</button>`
      ];
      if (owner) controls.push(`<button class="button small soft" data-action="student-password" data-id="${esc(student.id)}">Reset password</button>`, `<button class="button small soft" data-action="student-promote" data-id="${esc(student.id)}">Promote to moderator</button>`, `<button class="button small danger" data-action="student-delete" data-id="${esc(student.id)}">Safely delete</button>`);
      return controls.join('');
    };
    return `<div class="section-title"><h2>Student accounts</h2><div class="row-actions">${owner ? `${button('CSV template','import-template','soft')}${button('Import CSV','import-students','soft')}${button('Export CSV','export-students','soft')}` : ''}${button('Create student','new-student','primary')}</div></div><p class="mobile-note">Registration number is optional. Student IDs remain the internal record key. QR login codes expire after five minutes and work once.</p>${table(['Student','Roll / registration','Course','Status','Actions'],students.map(student => `<tr><td><b>${esc(student.fullName)}</b><br><small>${esc(student.username)}</small></td><td>${esc(student.rollNumber || '—')}<br><small>${esc(student.registrationNumber || '—')}</small><button class="button small quiet" data-action="student-qr" data-id="${esc(student.id)}">Show QR</button></td><td>${esc([student.department,student.branch,student.course,student.semester].filter(Boolean).join(' · ') || '—')}</td><td>${badge(student.status,student.status === 'active' ? '' : 'warn')}</td><td><div class="row-actions">${actionButtons(student)}</div></td></tr>`))}`;
  }

  async function viewTeachers() {
    const data = await api('/api/teachers');
    return `<div class="section-title"><h2>Teachers</h2>${button('Add teacher','new-teacher','primary')}</div><p class="subtle">Teachers can manage academic, attendance, classroom, student, and notice workflows. Owner, moderator, and system controls stay restricted.</p>${data.teachers.length ? data.teachers.map(teacher => `<article class="card teacher-card"><div><strong>${esc(teacher.fullName)}</strong><div class="mobile-note">${esc(teacher.username)} · ${badge(teacher.status,teacher.status === 'active' ? '' : 'warn')}</div></div><div class="row-actions"><button class="button small soft" data-action="teacher-edit" data-id="${esc(teacher.id)}" data-name="${esc(teacher.fullName)}" data-status="${esc(teacher.status)}">Edit / status</button></div></article>`).join('') : empty('No teachers yet','Create a separate teacher account to enable the teaching workspace.')}`;
  }

  async function viewSubjects() {
    if (state.user.role === 'MODERATOR') return original.viewSubjects();
    const data = await api('/api/academics');
    return `<div class="section-title"><h2>Subjects</h2>${button('Add subject','new-subject','primary')}</div>${data.subjects.length ? table(['Subject','Code','Department','Course / semester','Teacher','Status','Actions'],data.subjects.map(subject => `<tr><td>${esc(subject.name)}</td><td>${esc(subject.code)}</td><td>${esc(subject.departmentName)}</td><td>${esc([subject.courseName,subject.semesterName].filter(Boolean).join(' · ') || '—')}</td><td>${esc(subject.facultyName || '—')}</td><td>${subject.active ? 'Active' : 'Inactive'}</td><td><div class="row-actions"><button class="button small soft" data-action="subject-edit" data-id="${esc(subject.id)}">Edit</button><button class="button small soft" data-action="subject-enrollments" data-id="${esc(subject.id)}">Enroll students</button></div></td></tr>`)) : empty('No subjects yet')}`;
  }

  function routineCell(period, edit, index, count) {
    const recess = period.periodType === 'break';
    const actions = edit ? `<div class="row-actions"><button class="button small soft" data-action="routine-edit" data-id="${esc(period.periodId)}">Edit</button><button class="button small danger" data-action="routine-delete" data-id="${esc(period.periodId)}">Delete</button></div>` : '';
    return `<article class="timetable-cell ${recess ? 'is-recess' : ''}"><div class="timetable-time">${esc(period.startsAt)}–${esc(period.endsAt)}</div><strong>${recess ? badge('RECESS','recess-badge') : esc(period.subjectName)}</strong><span>${recess ? 'Break' : esc(period.facultyName || 'Faculty TBA')}</span>${period.roomNumber ? `<small>${esc(period.roomNumber)}</small>` : ''}${actions}</article>`;
  }

  async function viewRoutines() {
    const data = await api('/api/routines'), periods = data.periods || [], canEdit = state.user.role === 'OWNER' || state.user.role === 'TEACHER' || state.user.permissions?.includes('manage_routines');
    const nav = weekdays.map((day, index) => `<button class="weekday-button" type="button" data-routine-scroll="${index}"><span>${day.slice(0,3).toUpperCase()}</span></button>`).join('');
    const days = weekdays.map((day, weekday) => {
      const selected = periods.filter(period => period.weekday === weekday).sort((a,b) => a.startsAt.localeCompare(b.startsAt));
      return `<section class="routine-day-row" id="routine-day-${weekday}"><div class="routine-day-label"><p class="eyebrow">${weekday === new Date(`${today()}T00:00:00Z`).getUTCDay() ? 'Today' : 'Weekly timetable'}</p><h3>${day}</h3><span>${selected.length} ${selected.length === 1 ? 'period' : 'periods'}</span></div><div class="routine-horizontal-scroll"><div class="routine-track">${selected.length ? selected.map((period,index) => routineCell(period,canEdit,index,selected.length)).join('') : `<div class="routine-empty">No classes scheduled</div>`}</div></div></section>`;
    }).join('');
    return `<div class="section-title"><div><p class="eyebrow">Weekly timetable</p><h2>${state.user.role === 'STUDENT' ? 'My class routine' : 'Class routine'}</h2></div>${canEdit ? `<div class="row-actions">${button('Add period','new-routine','soft')}${button('Add RECESS','new-recess','primary')}${button('Copy a day','copy-routine','soft')}</div>` : ''}</div><nav class="weekday-strip routine-jump" aria-label="Jump to timetable day">${nav}</nav><div class="routine-week">${days}</div>`;
  }

  async function viewReports() {
    if (state.user.role !== 'TEACHER') return original.viewReports();
    const data = await api('/api/reports');
    return `<div class="section-title"><div><p class="eyebrow">Teaching workspace</p><h2>Attendance analytics</h2></div>${button('Download CSV','export-reports','soft')}</div><div class="grid">${stat('Overall attendance',data.percentage == null ? '—' : `${data.percentage}%`,'Present marks across held classes')}${stat('Classes held',data.held)}${stat('Present',data.present)}${stat('Absent',data.absent)}<article class="card span-12"><h2>Attendance by subject</h2>${data.subjects.length ? table(['Subject','Code','Classes','Present','Attendance'],data.subjects.map(subject => `<tr><td>${esc(subject.name)}</td><td>${esc(subject.code)}</td><td>${subject.held}</td><td>${subject.present}</td><td>${subject.percentage == null ? '—' : `${subject.percentage}%`}</td></tr>`)) : empty('No attendance data yet')}</article></div>`;
  }

  async function createStudent() {
    const data = await api('/api/academics');
    const content = field('fullName','Full name','text','','required') + field('username','Username','text','','required minlength="3"') + field('password','Initial password','password','','required minlength="12" autocomplete="new-password"') + field('rollNumber','Roll number','text','','required') + field('registrationNumber','Registration number (optional)') + selectField('departmentId','Department',data.departments.map(item => ({value:item.id,label:item.name})),'','required') + selectField('branchId','Branch',data.branches.map(item => ({value:item.id,label:`${item.name} · ${item.departmentName}`}))) + selectField('courseId','Course',data.courses.map(item => ({value:item.id,label:`${item.name} · ${item.departmentName}`})),'','required') + field('semesterOrdinal','Semester number','number','','required min="1"') + selectField('academicSessionId','Academic session',data.sessions.filter(item => item.status === 'active').map(item => ({value:item.id,label:item.name}))) + field('academicYear','Academic year','text','','required') + field('section','Section / class','text','','required');
    const values = await modalForm('Create student account',content,'Create student');
    if (!values) return;
    try { const result = await api('/api/students',{method:'POST',body:values}); await stateRender('students'); await modalForm('Student access code',`<p>Share this fallback code with ${esc(result.student.fullName)} through a secure channel.</p><div class="callout"><code>${esc(result.accessCode)}</code></div>`,'Done'); } catch (error) { toast(error.message); }
  }

  async function editStudent(id) {
    const { students } = await api('/api/students'), student = students.find(item => item.id === id);
    if (!student) return;
    const data = await api('/api/academics');
    const content = field('fullName','Full name','text',student.fullName,'required') + field('rollNumber','Roll number','text',student.rollNumber,'required') + field('registrationNumber','Registration number (optional)','text',student.registrationNumber || '') + selectField('departmentId','Department',data.departments.map(item => ({value:item.id,label:item.name})),student.departmentId,'required') + selectField('branchId','Branch',data.branches.map(item => ({value:item.id,label:`${item.name} · ${item.departmentName}`})),student.branchId) + selectField('courseId','Course',data.courses.map(item => ({value:item.id,label:`${item.name} · ${item.departmentName}`})),student.courseId,'required') + field('semesterOrdinal','Semester number','number',student.semesterOrdinal || '','required min="1"') + field('academicYear','Academic year','text',student.academicYear || '','required') + field('section','Section','text',student.section || '','required');
    const values = await modalForm(`Edit ${student.fullName}`,content);
    if (!values) return;
    try { await api(`/api/students/${encodeURIComponent(id)}`,{method:'PATCH',body:values}); toast('Student updated'); await stateRender('students'); } catch (error) { toast(error.message); }
  }

  async function showQrLogin(id) {
    try {
      const issued = await api(`/api/students/${encodeURIComponent(id)}/qr-code`,{method:'POST',body:{}});
      if (typeof window.qrcode !== 'function') throw new Error('QR generator did not load. Reload and try again.');
      const qr = window.qrcode(0,'H'); qr.addData(issued.token,'Byte'); qr.make();
      const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.createSvgTag(6,8))}`;
      await modalForm('One-time student QR login',`<p>This QR code works once and expires in five minutes. Keep it private and show it directly to the student.</p><div class="qr-preview"><img src="${esc(image)}" alt="Short-lived student login QR code"></div><p class="mobile-note">Expires ${new Date(issued.expiresAt).toLocaleTimeString()} · Keep this screen private.</p>`,'Done');
    } catch (error) { toast(error.message); }
  }

  async function scanQrLogin() {
    const dialog = document.querySelector('#dialog');
    dialog.innerHTML = `<div class="dialog-inner qr-scanner"><div class="dialog-head"><div><p class="eyebrow">Student sign in</p><h2>Scan your QR code</h2></div><button type="button" class="icon-button" data-scan-close aria-label="Close scanner">×</button></div><p class="subtle">Ask an owner or teacher for a fresh QR code. It expires in five minutes and can be used once.</p><video id="qr-video" playsinline muted></video><canvas id="qr-canvas" hidden></canvas><p id="qr-status" class="mobile-note" aria-live="polite">Allow camera access to scan.</p><label class="field">Scan an image<input id="qr-image" type="file" accept="image/*" capture="environment"></label><label class="field">Or paste a one-time code<input id="qr-manual" type="text" autocomplete="off" spellcheck="false"></label><button class="button primary full" type="button" data-qr-submit>Sign in with code</button></div>`;
    dialog.showModal();
    const video = dialog.querySelector('#qr-video'), canvas = dialog.querySelector('#qr-canvas'), context = canvas.getContext('2d',{willReadFrequently:true}), status = dialog.querySelector('#qr-status');
    let stream = null, scanning = true;
    const stop = () => { scanning = false; if (stream) stream.getTracks().forEach(track => track.stop()); stream = null; };
    dialog.addEventListener('close',stop,{once:true});
    dialog.querySelector('[data-scan-close]').addEventListener('click',()=>dialog.close());
    const signIn = async token => {
      const value = String(token || '').trim();
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) { status.textContent = 'This does not look like a valid Edutrack QR code.'; return; }
      stop();
      status.textContent='Signing in with this one-time QR code…';
      try { const result = await api('/api/login/qr',{method:'POST',body:{token:value}}); state.user=result.user;state.csrf=result.csrf;dialog.close();await original.loadDashboard(); }
      catch (error) { status.textContent=error.message; }
    };
    dialog.querySelector('[data-qr-submit]').addEventListener('click',()=>signIn(dialog.querySelector('#qr-manual').value));
    dialog.querySelector('#qr-image').addEventListener('change',async event=>{
      const image=event.target.files?.[0];if(!image)return;
      const bitmap=await createImageBitmap(image);canvas.width=bitmap.width;canvas.height=bitmap.height;context.drawImage(bitmap,0,0);bitmap.close();
      const result=window.jsQR?.(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});
      if(result?.data){stop();dialog.querySelector('#qr-manual').value=result.data;status.textContent='QR code detected. Continue only if this is your student sign-in code.';dialog.querySelector('[data-qr-submit]').focus()}else status.textContent='No QR code was found in that image.';
    });
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof window.jsQR !== 'function') { status.textContent='Camera scanning is unavailable here. Choose an image or paste the one-time code.'; return; }
    try {
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=stream;await video.play();status.textContent='Point the camera at the student QR code.';
      const scanFrame=()=>{if(!scanning||video.readyState<2)return requestAnimationFrame(scanFrame);const width=Math.min(video.videoWidth,640),height=Math.round(video.videoHeight*(width/video.videoWidth));canvas.width=width;canvas.height=height;context.drawImage(video,0,0,width,height);const result=window.jsQR(context.getImageData(0,0,width,height).data,width,height,{inversionAttempts:'dontInvert'});if(result?.data){dialog.querySelector('#qr-manual').value=result.data;status.textContent='QR code detected. Continue only if this is your student sign-in code.';dialog.querySelector('[data-qr-submit]').focus();stop();return}setTimeout(()=>requestAnimationFrame(scanFrame),160)};requestAnimationFrame(scanFrame);
    } catch { status.textContent='Camera access was blocked. Choose a QR image or paste the one-time code.'; }
  }

  async function noticeForm(id = '') {
    const data = id ? await api('/api/notices?manage=1') : null, notice = data?.notices.find(item => item.id === id);
    if (id && !notice) return;
    const content = field('title','Notice title','text',notice?.title || '','required maxlength="180"') + textareaField('body','Description',notice?.body || '','required maxlength="5000" rows="6"') + selectField('visibility','Visible to',[{value:'all',label:'Everyone'},{value:'students',label:'Students'},{value:'staff',label:'Teachers, moderators, and owners'}],notice?.visibility || 'all','required') + field('expiresOn','Expiry date (optional)','date',notice?.expiresAt?.slice(0,10) || '') + `<label class="field">Notice image (JPEG, PNG, or WebP · max 5 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label>${notice?.imageUrl ? `<label class="permission notice-pin"><input type="checkbox" name="removeImage" value="true"><span>Remove current image</span></label>` : ''}<label class="permission notice-pin"><input type="checkbox" name="pinned" value="true" ${notice?.pinned ? 'checked' : ''}><span>Mark as important and pin near the top</span></label><p class="mobile-note">Images are stored in the college R2 bucket. Uploads are limited to 5 MB and checked against their file signatures.</p>`;
    const values = await modalForm(id ? 'Edit notice' : 'Publish notice',content,id ? 'Save changes' : 'Publish');
    if (!values) return;
    const file=values.image instanceof File && values.image.size ? values.image : null, removeImage=Boolean(values.removeImage);values.pinned=Boolean(values.pinned);delete values.image;delete values.removeImage;
    let noticeId=id;
    try {
      if(id) await api(`/api/notices/${encodeURIComponent(id)}`,{method:'PATCH',body:values});
      else noticeId=(await api('/api/notices',{method:'POST',body:values})).id;
      if(removeImage&&!file) await api(`/api/notices/${encodeURIComponent(noticeId)}/image`,{method:'DELETE'});
      if(file){if(file.size>5*1024*1024)throw new Error('Images must be 5 MB or smaller.');const response=await fetch(`/api/notices/${encodeURIComponent(noticeId)}/image`,{method:'PUT',headers:{'Content-Type':file.type,'X-CSRF-Token':state.csrf},body:file,credentials:'same-origin'});const result=await response.json().catch(()=>({error:'Image upload failed.'}));if(!response.ok)throw new Error(result.error||`Image upload failed (${response.status}).`);}
      toast(id ? 'Notice updated' : 'Notice published');await stateRender('notices');
    } catch (error) { toast(noticeId&&!id ? `Notice saved, but its image could not be uploaded: ${error.message}` : error.message);if(noticeId)await stateRender('notices'); }
  }

  async function stateRender(view) { state.view = view; await window.render(); }

  async function addRoutine(periodType = 'class') {
    const data = await api('/api/routines/options');
    const days = weekdays.map((name,value)=>({value,label:name}));
    const content = selectField('departmentId','Department',data.departments.map(item=>({value:item.id,label:item.name})),'','required') + selectField('courseId','Course',data.courses.map(item=>({value:item.id,label:item.name}))) + selectField('subjectId','Subject / class group',data.subjects.map(item=>({value:item.id,label:`${item.name} · ${item.code}`})),'','required') + field('semesterName','Semester label','text','','required') + field('section','Section') + selectField('weekday','Day of week',days,String(new Date(`${today()}T00:00:00Z`).getUTCDay()),'required') + field('effectiveFrom','Effective from','date',today(),'required') + field('startsAt','Start time','time','','required') + field('endsAt','End time','time','','required') + field('roomNumber','Room number') + field('facultyName','Teacher / faculty') + textareaField('notes','Notes') + field('periodType','Period type','hidden',periodType);
    const pending = modalForm(periodType === 'break' ? 'Add a recess' : 'Add a class period',content,periodType === 'break' ? 'Add RECESS' : 'Save period');
    const subjectSelect = document.querySelector('#dialog [name="subjectId"]');
    const fillFaculty=()=>{const subject=data.subjects.find(item=>item.id===subjectSelect?.value);const faculty=document.querySelector('#dialog [name="facultyName"]');if(faculty)faculty.value=subject?.facultyName||''};
    subjectSelect?.addEventListener('change',fillFaculty);fillFaculty();
    const values = await pending;
    if (!values) return;
    try { await api('/api/routines',{method:'POST',body:values});toast(periodType === 'break' ? 'Recess added to the timetable' : 'Class period saved');await stateRender('routines'); }
    catch (error) { toast(error.message); }
  }

  async function viewTeachersForm() {
    const values = await modalForm('Add teacher',field('fullName','Full name','text','','required')+field('username','Username','text','','required minlength="3"')+field('password','Initial password','password','','required minlength="12" autocomplete="new-password"'),'Create teacher');
    if (!values) return;
    try { await api('/api/teachers',{method:'POST',body:values});toast('Teacher account created');await stateRender('teachers'); }
    catch (error) { toast(error.message); }
  }

  async function teacherStatus(id, element) {
    const values = await modalForm('Edit teacher',field('fullName','Full name','text',element.dataset.name,'required')+selectField('status','Account status',[{value:'active',label:'Active'},{value:'suspended',label:'Suspended'}],element.dataset.status,'required'),'Save changes');
    if (!values) return;
    try { await api(`/api/teachers/${encodeURIComponent(id)}`,{method:'PATCH',body:values});toast('Teacher account updated');await stateRender('teachers'); }
    catch (error) { toast(error.message); }
  }

  async function delegatedAction(action,id,element) {
    if (action === 'scan-qr') return scanQrLogin();
    if (action === 'student-qr') return showQrLogin(id);
    if (action === 'student-qr-revoke') {
      if (await confirmDialog('Revoke QR login?','Any unused QR token for this student will stop working immediately.','Revoke QR',true)) {
        await api(`/api/students/${encodeURIComponent(id)}/qr-code`,{method:'DELETE'});toast('QR login revoked');return stateRender('students');
      }
      return;
    }
    if (action === 'new-teacher') return viewTeachersForm();
    if (action === 'teacher-edit') return teacherStatus(id,element);
    if (action === 'new-notice') return noticeForm();
    if (action === 'notice-edit') return noticeForm(id);
    if (action === 'notice-delete') {
      if (await confirmDialog('Delete notice?','This removes the notice from every dashboard.','Delete',true)) { await api(`/api/notices/${encodeURIComponent(id)}`,{method:'DELETE'});toast('Notice deleted');return stateRender('notices'); }
      return;
    }
    if (action === 'new-recess') return addRoutine('break');
    if (action === 'new-routine') return addRoutine('class');
    if (action === 'go-notices') { state.view='notices';return window.render(); }
    if (action === 'go-reports') { state.view='reports';return window.render(); }
    if (action === 'go-routines') { state.view='routines';return window.render(); }
    if (action === 'go-attendance') { state.view='attendance';return window.render(); }
    if (action === 'students') { state.view='students';return window.render(); }
    if (action === 'new-student') return createStudent();
    if (action === 'student-edit') return editStudent(id);
    return original.delegatedAction(action,id,element);
  }

  async function renderView() {
    const target = document.querySelector('#view-content');
    if (!target) return;
    try {
      if (state.view === 'overview') target.innerHTML = await viewOverview();
      else if (state.view === 'students') target.innerHTML = await viewStudents();
      else if (state.view === 'teachers' && state.user.role === 'OWNER') target.innerHTML = await viewTeachers();
      else if (state.view === 'notices') target.innerHTML = await viewNotices();
      else if (state.view === 'subjects' && state.user.role !== 'MODERATOR') target.innerHTML = await viewSubjects();
      else if (state.view === 'routines' || state.view === 'routine') target.innerHTML = await viewRoutines();
      else if (state.view === 'reports' && state.user.role === 'TEACHER') target.innerHTML = await viewReports();
      else await original.renderView();
    } catch (error) { target.innerHTML = `<div class="callout error">${esc(error.message)}</div>`; }
  }

  window.selectAuthMode = selectAuthMode;
  window.renderLogin = renderLogin;
  window.login = login;
  window.navItems = navItems;
  window.renderView = renderView;
  window.viewOverview = viewOverview;
  window.viewStudents = viewStudents;
  window.viewSubjects = viewSubjects;
  window.viewRoutines = viewRoutines;
  window.viewReports = viewReports;
  window.viewNotices = viewNotices;
  window.delegatedAction = delegatedAction;
  document.addEventListener('click', event => {
    const jump = event.target.closest('[data-routine-scroll]');
    if (jump) document.querySelector(`#routine-day-${jump.dataset.routineScroll}`)?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  document.addEventListener('edutrack:open-classroom', event => {
    const classroomId = event.detail?.classroomId;
    if (state.user?.role === 'TEACHER') {
      state.view = 'attendance'; window.render().then(() => classroomId && window.openClassroom?.(classroomId));
    }
  });
})();
