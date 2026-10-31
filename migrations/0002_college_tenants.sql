PRAGMA foreign_keys = ON;

CREATE TABLE colleges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  owner_recovery_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO colleges(id,name,timezone,status)
VALUES('legacy-college','Existing College','Asia/Kolkata','active');

ALTER TABLE users ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE departments ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE branches ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE courses ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE semesters ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE academic_sessions ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE student_profiles ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE subjects ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE enrollments ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE class_sessions ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE attendance ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE moderator_permissions ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE web_sessions ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE student_access_codes ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE audit_logs ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE class_routines ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE routine_periods ADD COLUMN college_id TEXT REFERENCES colleges(id);
ALTER TABLE college_holidays ADD COLUMN college_id TEXT REFERENCES colleges(id);

UPDATE users SET college_id='legacy-college';
UPDATE departments SET college_id='legacy-college';
UPDATE branches SET college_id='legacy-college';
UPDATE courses SET college_id='legacy-college';
UPDATE semesters SET college_id='legacy-college';
UPDATE academic_sessions SET college_id='legacy-college';
UPDATE student_profiles SET college_id='legacy-college';
UPDATE subjects SET college_id='legacy-college';
UPDATE enrollments SET college_id='legacy-college';
UPDATE class_sessions SET college_id='legacy-college';
UPDATE attendance SET college_id='legacy-college';
UPDATE moderator_permissions SET college_id='legacy-college';
UPDATE web_sessions SET college_id='legacy-college';
UPDATE student_access_codes SET college_id='legacy-college';
UPDATE audit_logs SET college_id='legacy-college';
UPDATE class_routines SET college_id='legacy-college';
UPDATE routine_periods SET college_id='legacy-college';
UPDATE college_holidays SET college_id='legacy-college';

CREATE INDEX users_college_role_status ON users(college_id,role,status);
CREATE INDEX departments_college ON departments(college_id,name);
CREATE INDEX branches_college ON branches(college_id,department_id,name);
CREATE INDEX courses_college ON courses(college_id,department_id,name);
CREATE INDEX semesters_college ON semesters(college_id,course_id,ordinal);
CREATE INDEX academic_sessions_college ON academic_sessions(college_id,starts_on,ends_on);
CREATE INDEX profiles_college ON student_profiles(college_id,user_id);
CREATE INDEX subjects_college ON subjects(college_id,department_id,course_id,semester_id);
CREATE INDEX enrollments_college ON enrollments(college_id,student_id,subject_id);
CREATE INDEX class_sessions_college ON class_sessions(college_id,subject_id,held_on);
CREATE INDEX attendance_college ON attendance(college_id,student_id,class_session_id);
CREATE INDEX permissions_college ON moderator_permissions(college_id,moderator_id,permission);
CREATE INDEX web_sessions_college ON web_sessions(college_id,user_id);
CREATE INDEX access_codes_college ON student_access_codes(college_id,student_id,revoked_at,expires_at);
CREATE INDEX audit_logs_college ON audit_logs(college_id,created_at DESC);
CREATE INDEX routines_college ON class_routines(college_id,department_id,course_id,semester_id,section,weekday,effective_from,effective_to);
CREATE INDEX routine_periods_college ON routine_periods(college_id,routine_id,position);
CREATE INDEX holidays_college ON college_holidays(college_id,starts_on,ends_on);

DROP INDEX one_owner_only;
CREATE UNIQUE INDEX one_owner_per_college ON users(college_id) WHERE role='OWNER';
DROP INDEX one_active_academic_session;
CREATE UNIQUE INDEX one_active_session_per_college ON academic_sessions(college_id) WHERE status='active';
DROP INDEX subjects_code_session_section;
CREATE UNIQUE INDEX subjects_code_session_section ON subjects(college_id,code COLLATE NOCASE,COALESCE(academic_session_id,''),section COLLATE NOCASE);

DROP TRIGGER enforce_max_active_moderators_insert;
DROP TRIGGER enforce_max_active_moderators_update;
CREATE TRIGGER enforce_max_active_moderators_insert BEFORE INSERT ON users
WHEN NEW.role='MODERATOR' AND NEW.status='active'
 AND (SELECT COUNT(*) FROM users WHERE role='MODERATOR' AND status='active' AND college_id=NEW.college_id) >= 5
BEGIN SELECT RAISE(ABORT, 'maximum of five active moderators'); END;
CREATE TRIGGER enforce_max_active_moderators_update BEFORE UPDATE OF role,status ON users
WHEN NEW.role='MODERATOR' AND NEW.status='active' AND (OLD.role<>'MODERATOR' OR OLD.status<>'active')
 AND (SELECT COUNT(*) FROM users WHERE role='MODERATOR' AND status='active' AND college_id=NEW.college_id) >= 5
BEGIN SELECT RAISE(ABORT, 'maximum of five active moderators'); END;

CREATE TRIGGER users_require_college BEFORE INSERT ON users
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM colleges WHERE id=NEW.college_id AND status='active')
BEGIN SELECT RAISE(ABORT, 'active college is required'); END;
CREATE TRIGGER departments_require_college BEFORE INSERT ON departments
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM colleges WHERE id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'college is required'); END;
CREATE TRIGGER branches_tenant_guard BEFORE INSERT ON branches
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'department must belong to the same college'); END;
CREATE TRIGGER courses_tenant_guard BEFORE INSERT ON courses
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id)
 OR (NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND department_id=NEW.department_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'course records must belong to the same college'); END;
CREATE TRIGGER semesters_tenant_guard BEFORE INSERT ON semesters
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM courses WHERE id=NEW.course_id AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'course must belong to the same college'); END;
CREATE TRIGGER academic_sessions_require_college BEFORE INSERT ON academic_sessions
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM colleges WHERE id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'college is required'); END;
CREATE TRIGGER student_profiles_tenant_guard BEFORE INSERT ON student_profiles
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='STUDENT' AND college_id=NEW.college_id)
 OR (NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id))
 OR (NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND college_id=NEW.college_id))
 OR (NEW.course_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM courses WHERE id=NEW.course_id AND college_id=NEW.college_id))
 OR (NEW.semester_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM semesters WHERE id=NEW.semester_id AND college_id=NEW.college_id))
 OR (NEW.academic_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_sessions WHERE id=NEW.academic_session_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'student profile records must belong to the same college'); END;
CREATE TRIGGER subjects_tenant_guard BEFORE INSERT ON subjects
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id)
 OR (NEW.course_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM courses WHERE id=NEW.course_id AND department_id=NEW.department_id AND college_id=NEW.college_id))
 OR (NEW.semester_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM semesters WHERE id=NEW.semester_id AND college_id=NEW.college_id))
 OR (NEW.academic_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_sessions WHERE id=NEW.academic_session_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'subject records must belong to the same college'); END;
CREATE TRIGGER enrollments_tenant_guard BEFORE INSERT ON enrollments
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.student_id AND role='STUDENT' AND college_id=NEW.college_id)
 OR NOT EXISTS(SELECT 1 FROM subjects WHERE id=NEW.subject_id AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'enrollment records must belong to the same college'); END;
CREATE TRIGGER class_sessions_tenant_guard BEFORE INSERT ON class_sessions
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM subjects WHERE id=NEW.subject_id AND college_id=NEW.college_id)
 OR (NEW.created_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'class session records must belong to the same college'); END;
CREATE TRIGGER attendance_tenant_guard BEFORE INSERT ON attendance
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM class_sessions WHERE id=NEW.class_session_id AND college_id=NEW.college_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.student_id AND role='STUDENT' AND college_id=NEW.college_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.marked_by AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'attendance records must belong to the same college'); END;
CREATE TRIGGER moderator_permissions_tenant_guard BEFORE INSERT ON moderator_permissions
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.moderator_id AND role='MODERATOR' AND college_id=NEW.college_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.granted_by AND role='OWNER' AND college_id=NEW.college_id)
 OR (NEW.scope_type='subject' AND NOT EXISTS(SELECT 1 FROM subjects WHERE id=NEW.scope_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'moderator permissions must belong to the same college'); END;
CREATE TRIGGER web_sessions_tenant_guard BEFORE INSERT ON web_sessions
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'session must belong to the same college'); END;
CREATE TRIGGER access_codes_tenant_guard BEFORE INSERT ON student_access_codes
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.student_id AND role='STUDENT' AND college_id=NEW.college_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND role='OWNER' AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'access codes must belong to the same college'); END;
CREATE TRIGGER audit_logs_tenant_guard BEFORE INSERT ON audit_logs
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM colleges WHERE id=NEW.college_id)
 OR (NEW.actor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.actor_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'audit entries must belong to the same college'); END;
CREATE TRIGGER class_routines_tenant_guard BEFORE INSERT ON class_routines
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id)
 OR (NEW.course_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM courses WHERE id=NEW.course_id AND college_id=NEW.college_id))
 OR (NEW.semester_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM semesters WHERE id=NEW.semester_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'routine records must belong to the same college'); END;
CREATE TRIGGER routine_periods_tenant_guard BEFORE INSERT ON routine_periods
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM class_routines WHERE id=NEW.routine_id AND college_id=NEW.college_id)
 OR (NEW.subject_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subjects WHERE id=NEW.subject_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'routine periods must belong to the same college'); END;
CREATE TRIGGER college_holidays_tenant_guard BEFORE INSERT ON college_holidays
WHEN NEW.college_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.created_by AND role='OWNER' AND college_id=NEW.college_id)
BEGIN SELECT RAISE(ABORT, 'holidays must belong to the same college'); END;
CREATE TRIGGER student_profiles_tenant_update_guard BEFORE UPDATE OF user_id,department_id,branch_id,course_id,semester_id,academic_session_id ON student_profiles
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='STUDENT' AND college_id=NEW.college_id)
 OR (NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id))
 OR (NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND college_id=NEW.college_id))
 OR (NEW.course_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM courses WHERE id=NEW.course_id AND college_id=NEW.college_id))
 OR (NEW.semester_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM semesters WHERE id=NEW.semester_id AND college_id=NEW.college_id))
 OR (NEW.academic_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_sessions WHERE id=NEW.academic_session_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'student profile records must belong to the same college'); END;
CREATE TRIGGER subjects_tenant_update_guard BEFORE UPDATE OF department_id,course_id,semester_id,academic_session_id ON subjects
WHEN NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND college_id=NEW.college_id)
 OR (NEW.course_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM courses WHERE id=NEW.course_id AND department_id=NEW.department_id AND college_id=NEW.college_id))
 OR (NEW.semester_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM semesters WHERE id=NEW.semester_id AND college_id=NEW.college_id))
 OR (NEW.academic_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM academic_sessions WHERE id=NEW.academic_session_id AND college_id=NEW.college_id))
BEGIN SELECT RAISE(ABORT, 'subject records must belong to the same college'); END;

CREATE TRIGGER users_college_immutable BEFORE UPDATE OF college_id ON users
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER departments_college_immutable BEFORE UPDATE OF college_id ON departments
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER branches_college_immutable BEFORE UPDATE OF college_id ON branches
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER courses_college_immutable BEFORE UPDATE OF college_id ON courses
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER semesters_college_immutable BEFORE UPDATE OF college_id ON semesters
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER academic_sessions_college_immutable BEFORE UPDATE OF college_id ON academic_sessions
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER student_profiles_college_immutable BEFORE UPDATE OF college_id ON student_profiles
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER subjects_college_immutable BEFORE UPDATE OF college_id ON subjects
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER enrollments_college_immutable BEFORE UPDATE OF college_id ON enrollments
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER class_sessions_college_immutable BEFORE UPDATE OF college_id ON class_sessions
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER attendance_college_immutable BEFORE UPDATE OF college_id ON attendance
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER moderator_permissions_college_immutable BEFORE UPDATE OF college_id ON moderator_permissions
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER web_sessions_college_immutable BEFORE UPDATE OF college_id ON web_sessions
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER student_access_codes_college_immutable BEFORE UPDATE OF college_id ON student_access_codes
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER audit_logs_college_immutable BEFORE UPDATE OF college_id ON audit_logs
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER class_routines_college_immutable BEFORE UPDATE OF college_id ON class_routines
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER routine_periods_college_immutable BEFORE UPDATE OF college_id ON routine_periods
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
CREATE TRIGGER college_holidays_college_immutable BEFORE UPDATE OF college_id ON college_holidays
WHEN NEW.college_id<>OLD.college_id BEGIN SELECT RAISE(ABORT, 'college membership cannot be changed'); END;
