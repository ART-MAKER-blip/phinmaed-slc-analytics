-- Failed sign-ins, used to slow down password guessing. Rows older than a day are
-- removed as new failures arrive; the audit log keeps the permanent record.
CREATE TABLE login_attempt (
  attempt_id   bigserial PRIMARY KEY,
  email        text NOT NULL,
  ip           text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_attempt_email_idx ON login_attempt (email, attempted_at);
CREATE INDEX login_attempt_ip_idx ON login_attempt (ip, attempted_at);
