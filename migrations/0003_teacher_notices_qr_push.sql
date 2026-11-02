PRAGMA foreign_keys = ON;

-- Additive, tenant-scoped feature tables. Existing account and academic records
-- are not rebuilt or changed by this migration.
CREATE TABLE teacher_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  college_id TEXT NOT NULL REFERENCES colleges(id),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(college_id,user_id)
);
CREATE INDEX teacher_accounts_college ON teacher_accounts(college_id,created_at DESC);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  college_id TEXT NOT NULL REFERENCES colleges(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_key TEXT,
  visibility TEXT NOT NULL DEFAULT 'all' CHECK(visibility IN ('all','students','staff')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(expires_at IS NULL OR published_at <= expires_at)
);
CREATE INDEX notices_visible ON notices(college_id,published_at DESC,expires_at,pinned);

CREATE TABLE student_qr_tokens (
  token_hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id TEXT NOT NULL REFERENCES colleges(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX student_qr_tokens_student ON student_qr_tokens(college_id,student_id,expires_at,used_at,revoked_at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  college_id TEXT NOT NULL REFERENCES colleges(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(college_id,endpoint)
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(college_id,user_id,created_at DESC);

CREATE TABLE push_outbox (
  id TEXT PRIMARY KEY,
  college_id TEXT NOT NULL REFERENCES colleges(id),
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  locked_until TEXT,
  delivered_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(college_id,event_key,subscription_id)
);
CREATE INDEX push_outbox_pending ON push_outbox(college_id,delivered_at,next_attempt_at,locked_until);
