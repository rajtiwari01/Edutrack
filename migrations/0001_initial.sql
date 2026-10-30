PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','MODERATOR','STUDENT')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX one_owner_only ON users(role) WHERE role = 'OWNER';
CREATE TRIGGER protect_owner_update BEFORE UPDATE OF role,status ON users
WHEN OLD.role = 'OWNER' AND (NEW.role <> 'OWNER' OR NEW.status <> 'active')
BEGIN SELECT RAISE(ABORT, 'owner account is protected'); END;
CREATE TRIGGER protect_owner_delete BEFORE DELETE ON users
WHEN OLD.role = 'OWNER'
BEGIN SELECT RAISE(ABORT, 'owner account is protected'); END;

CREATE TABLE departments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE branches (
  id TEXT PRIMARY KEY, department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE, UNIQUE(department_id,name)
);
CREATE TABLE courses (
  id TEXT PRIMARY KEY, department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL, degree TEXT NOT NULL DEFAULT '', UNIQUE(department_id,name,degree)
);
CREATE TABLE semesters (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal > 0), UNIQUE(course_id,ordinal)
);
CREATE TABLE academic_sessions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  CHECK(starts_on <= ends_on)
);
CREATE UNIQUE INDEX one_active_academic_session ON academic_sessions(status) WHERE status='active';
CREATE TABLE student_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  roll_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
  registration_number TEXT COLLATE NOCASE UNIQUE,
  department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT ''
);
CREATE TABLE subjects (
  id TEXT PRIMARY KEY, department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  academic_session_id TEXT REFERENCES academic_sessions(id) ON DELETE SET NULL,
  name TEXT NOT NULL, code TEXT NOT NULL COLLATE NOCASE, section TEXT NOT NULL DEFAULT '',
  faculty_name TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  CHECK(length(trim(name)) > 0)
);
CREATE UNIQUE INDEX subjects_code_session_section ON subjects(code COLLATE NOCASE,COALESCE(academic_session_id,''),section COLLATE NOCASE);
CREATE TABLE enrollments (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  starts_on TEXT NOT NULL, ends_on TEXT, UNIQUE(student_id,subject_id,starts_on),
  CHECK(ends_on IS NULL OR starts_on <= ends_on)
);
CREATE INDEX enrollments_student ON enrollments(student_id,starts_on,ends_on);
CREATE INDEX enrollments_subject ON enrollments(subject_id,starts_on,ends_on);

CREATE TABLE class_sessions (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  held_on TEXT NOT NULL, starts_at TEXT, ends_at TEXT, room_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','cancelled','holiday_override')),
  notes TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(subject_id,held_on,starts_at)
);
CREATE INDEX class_sessions_subject_date ON class_sessions(subject_id,held_on);
CREATE TABLE attendance (
  id TEXT PRIMARY KEY, class_session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('present','absent')),
  marked_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(class_session_id,student_id)
);
CREATE INDEX attendance_student ON attendance(student_id,class_session_id);

CREATE TABLE moderator_permissions (
  id TEXT PRIMARY KEY, moderator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL, scope_type TEXT NOT NULL DEFAULT 'global'
    CHECK(scope_type IN ('global','subject','class')),
  scope_id TEXT NOT NULL DEFAULT '', granted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(moderator_id,permission,scope_type,scope_id)
);
CREATE INDEX moderator_permissions_lookup ON moderator_permissions(moderator_id,permission,scope_type,scope_id);

CREATE TABLE web_sessions (
  token_hash TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX web_sessions_user ON web_sessions(user_id);
CREATE INDEX web_sessions_expiry ON web_sessions(expires_at);
CREATE TABLE student_access_codes (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE, expires_at TEXT, revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX student_access_codes_student ON student_access_codes(student_id,revoked_at,expires_at);
CREATE TABLE login_attempts (
  bucket_hash TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL, blocked_until TEXT
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_actor ON audit_logs(actor_id,created_at DESC);

CREATE TABLE class_routines (
  id TEXT PRIMARY KEY, department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  section TEXT NOT NULL DEFAULT '', weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  effective_from TEXT NOT NULL, effective_to TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(effective_to IS NULL OR effective_from <= effective_to)
);
CREATE TABLE routine_periods (
  id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES class_routines(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  subject_name TEXT NOT NULL, subject_code TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, room_number TEXT NOT NULL DEFAULT '',
  faculty_name TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0,
  CHECK(starts_at < ends_at)
);
CREATE INDEX routines_class_day ON class_routines(department_id,course_id,semester_id,section,weekday,effective_from,effective_to);
CREATE TABLE college_holidays (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'college' CHECK(category IN ('national','festival','college','closure','emergency')),
  description TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(starts_on <= ends_on)
);
CREATE INDEX holidays_dates ON college_holidays(starts_on,ends_on);

CREATE TRIGGER enforce_max_active_moderators_insert BEFORE INSERT ON users
WHEN NEW.role='MODERATOR' AND NEW.status='active'
 AND (SELECT COUNT(*) FROM users WHERE role='MODERATOR' AND status='active') >= 5
BEGIN SELECT RAISE(ABORT, 'maximum of five active moderators'); END;
CREATE TRIGGER enforce_max_active_moderators_update BEFORE UPDATE OF role,status ON users
WHEN NEW.role='MODERATOR' AND NEW.status='active' AND (OLD.role<>'MODERATOR' OR OLD.status<>'active')
 AND (SELECT COUNT(*) FROM users WHERE role='MODERATOR' AND status='active') >= 5
BEGIN SELECT RAISE(ABORT, 'maximum of five active moderators'); END;

