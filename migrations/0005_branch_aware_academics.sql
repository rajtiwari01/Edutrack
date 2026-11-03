-- Add branch-aware course, subject, and timetable scope without rewriting legacy records.
-- A branch value such as "CSE\\AI\\ML\\CIVIL" remains one existing branch row;
-- administrators can create and assign separate rows after confirming the real mapping.

ALTER TABLE subjects ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT;
ALTER TABLE class_routines ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT;

CREATE TABLE course_branches (
  college_id TEXT NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  PRIMARY KEY(course_id, branch_id)
);

-- Preserve only explicit legacy course/branch relationships. Do not split branch names.
INSERT OR IGNORE INTO course_branches(college_id, course_id, branch_id)
SELECT c.college_id, c.id, c.branch_id
FROM courses c
JOIN branches b ON b.id=c.branch_id
WHERE c.college_id=b.college_id AND c.department_id=b.department_id;

-- Student profiles also contain explicit course/branch assignments; retain valid pairs.
INSERT OR IGNORE INTO course_branches(college_id, course_id, branch_id)
SELECT p.college_id, p.course_id, p.branch_id
FROM student_profiles p
JOIN courses c ON c.id=p.course_id AND c.college_id=p.college_id
JOIN branches b ON b.id=p.branch_id AND b.college_id=p.college_id
WHERE c.department_id=b.department_id;

CREATE INDEX course_branches_lookup ON course_branches(college_id, branch_id, course_id);
CREATE INDEX subjects_branch_scope ON subjects(college_id, department_id, course_id, branch_id, semester_id);
CREATE INDEX routines_branch_scope ON class_routines(college_id, department_id, course_id, branch_id, semester_id, section, weekday, effective_from, effective_to);

DROP INDEX subjects_code_session_section;
CREATE UNIQUE INDEX subjects_code_session_section
  ON subjects(college_id, code COLLATE NOCASE, COALESCE(academic_session_id,''), section COLLATE NOCASE,
              COALESCE(course_id,''), COALESCE(semester_id,''), COALESCE(branch_id,''));

CREATE TRIGGER course_branches_insert_guard BEFORE INSERT ON course_branches
WHEN NOT EXISTS(
  SELECT 1 FROM courses c JOIN branches b ON b.id=NEW.branch_id
  WHERE c.id=NEW.course_id AND c.college_id=NEW.college_id
    AND b.college_id=NEW.college_id AND c.department_id=b.department_id
)
BEGIN SELECT RAISE(ABORT, 'course branch must belong to the same college and department'); END;

CREATE TRIGGER course_branches_update_guard BEFORE UPDATE OF college_id,course_id,branch_id ON course_branches
WHEN NOT EXISTS(
  SELECT 1 FROM courses c JOIN branches b ON b.id=NEW.branch_id
  WHERE c.id=NEW.course_id AND c.college_id=NEW.college_id
    AND b.college_id=NEW.college_id AND c.department_id=b.department_id
)
BEGIN SELECT RAISE(ABORT, 'course branch must belong to the same college and department'); END;

CREATE TRIGGER subjects_branch_insert_guard BEFORE INSERT ON subjects
WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM course_branches cb JOIN branches b ON b.id=cb.branch_id
  WHERE cb.college_id=NEW.college_id AND cb.course_id=NEW.course_id
    AND cb.branch_id=NEW.branch_id AND b.department_id=NEW.department_id
)
BEGIN SELECT RAISE(ABORT, 'subject branch must be assigned to its course'); END;

CREATE TRIGGER subjects_branch_update_guard BEFORE UPDATE OF college_id,department_id,course_id,branch_id ON subjects
WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM course_branches cb JOIN branches b ON b.id=cb.branch_id
  WHERE cb.college_id=NEW.college_id AND cb.course_id=NEW.course_id
    AND cb.branch_id=NEW.branch_id AND b.department_id=NEW.department_id
)
BEGIN SELECT RAISE(ABORT, 'subject branch must be assigned to its course'); END;

CREATE TRIGGER subjects_code_scope_insert_guard BEFORE INSERT ON subjects
WHEN EXISTS(
  SELECT 1 FROM subjects s
  WHERE s.college_id=NEW.college_id AND s.code=NEW.code COLLATE NOCASE
    AND COALESCE(s.academic_session_id,'')=COALESCE(NEW.academic_session_id,'')
    AND s.section=NEW.section COLLATE NOCASE
    AND COALESCE(s.course_id,'')=COALESCE(NEW.course_id,'')
    AND COALESCE(s.semester_id,'')=COALESCE(NEW.semester_id,'')
    AND (s.branch_id IS NULL OR NEW.branch_id IS NULL OR s.branch_id=NEW.branch_id)
)
BEGIN SELECT RAISE(ABORT, 'subject code already exists in this academic scope'); END;

CREATE TRIGGER subjects_code_scope_update_guard BEFORE UPDATE OF code,academic_session_id,section,course_id,semester_id,branch_id ON subjects
WHEN EXISTS(
  SELECT 1 FROM subjects s
  WHERE s.id<>NEW.id AND s.college_id=NEW.college_id AND s.code=NEW.code COLLATE NOCASE
    AND COALESCE(s.academic_session_id,'')=COALESCE(NEW.academic_session_id,'')
    AND s.section=NEW.section COLLATE NOCASE
    AND COALESCE(s.course_id,'')=COALESCE(NEW.course_id,'')
    AND COALESCE(s.semester_id,'')=COALESCE(NEW.semester_id,'')
    AND (s.branch_id IS NULL OR NEW.branch_id IS NULL OR s.branch_id=NEW.branch_id)
)
BEGIN SELECT RAISE(ABORT, 'subject code already exists in this academic scope'); END;

CREATE TRIGGER class_routines_branch_insert_guard BEFORE INSERT ON class_routines
WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM course_branches cb JOIN courses c ON c.id=cb.course_id
  WHERE cb.college_id=NEW.college_id AND cb.course_id=NEW.course_id
    AND cb.branch_id=NEW.branch_id AND c.department_id=NEW.department_id
)
BEGIN SELECT RAISE(ABORT, 'routine branch must be assigned to its course'); END;

CREATE TRIGGER routine_period_branch_insert_guard BEFORE INSERT ON routine_periods
WHEN NEW.subject_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM subjects s JOIN class_routines cr ON cr.id=NEW.routine_id
  WHERE s.id=NEW.subject_id AND s.branch_id IS NOT NULL
    AND (cr.branch_id IS NULL OR cr.branch_id<>s.branch_id)
)
BEGIN SELECT RAISE(ABORT, 'routine branch must match the selected subject'); END;

-- All roster and attendance-entry reads use one eligibility rule. This view does not
-- delete or rewrite historical enrollment, attendance, or profile rows.
CREATE VIEW eligible_enrollments AS
SELECT e.*
FROM enrollments e
JOIN student_profiles p ON p.user_id=e.student_id AND p.college_id=e.college_id
JOIN subjects s ON s.id=e.subject_id AND s.college_id=e.college_id
WHERE (s.course_id IS NULL OR p.course_id=s.course_id)
  AND (s.branch_id IS NULL OR p.branch_id=s.branch_id);
