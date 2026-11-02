PRAGMA foreign_keys = ON;

-- Keep the existing tenant guard and permit only same-college OWNER accounts
-- or teacher identities. Teacher accounts keep users.role='STUDENT' for legacy
-- compatibility, so the relation is checked through teacher_accounts.
DROP TRIGGER IF EXISTS access_codes_tenant_guard;
CREATE TRIGGER access_codes_tenant_guard BEFORE INSERT ON student_access_codes
WHEN NEW.college_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM users
    WHERE id=NEW.student_id AND role='STUDENT' AND college_id=NEW.college_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id=NEW.created_by AND u.college_id=NEW.college_id
      AND (u.role='OWNER' OR EXISTS (
        SELECT 1 FROM teacher_accounts ta
        WHERE ta.user_id=u.id AND ta.college_id=NEW.college_id
      ))
  )
BEGIN
  SELECT RAISE(ABORT, 'access codes must belong to the same college');
END;
