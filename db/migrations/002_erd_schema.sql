-- Core schema from the proposal's ERD (Appendix C).
--
-- Source records (students, offerings, grade records) are kept separate from derived
-- results (snapshots). A snapshot run stores the rule set it used, so any past zone
-- result can be recomputed from the grade records and that rule set.
--
-- Additions beyond the ERD, kept small on purpose:
--   * grading_period (P1/P2/P3) because grades and reports are periodic.
--   * import_batch stores the original file bytes and a SHA-256 checksum (objective 2).
--   * result_status.counts_as_failed so zone computation reads policy from data.
--   * zone_threshold.level so one rule set holds both student and subject thresholds.

------------------------------------------------------------------------------
-- Academic structure
------------------------------------------------------------------------------

CREATE TABLE campus (
  campus_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE program (
  program_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL
);

CREATE TABLE campus_program (
  campus_program_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campus_id         INTEGER NOT NULL REFERENCES campus(campus_id),
  program_id        INTEGER NOT NULL REFERENCES program(program_id),
  UNIQUE (campus_id, program_id)
);

CREATE TABLE year_level (
  year_level_id SMALLINT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL
);

CREATE TABLE academic_year (
  academic_year_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label            TEXT NOT NULL UNIQUE,          -- e.g. 2026-2027
  start_date       DATE,
  end_date         DATE,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
);

CREATE TABLE term (
  term_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  academic_year_id   INTEGER NOT NULL REFERENCES academic_year(academic_year_id),
  code               TEXT NOT NULL UNIQUE,        -- e.g. 2026-1
  name               TEXT NOT NULL,
  start_date         DATE,
  end_date           DATE,
  grade_release_date DATE,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
);

CREATE TABLE grading_period (
  grading_period_id SMALLINT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,         -- P1, P2, P3
  name              TEXT NOT NULL
);

CREATE TABLE course (
  course_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL
);

CREATE TABLE program_course (
  program_id    INTEGER NOT NULL REFERENCES program(program_id),
  course_id     INTEGER NOT NULL REFERENCES course(course_id),
  year_level_id SMALLINT REFERENCES year_level(year_level_id),
  PRIMARY KEY (program_id, course_id)
);

CREATE TABLE course_offering (
  offering_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id   INTEGER NOT NULL REFERENCES course(course_id),
  term_id     INTEGER NOT NULL REFERENCES term(term_id),
  campus_id   INTEGER NOT NULL REFERENCES campus(campus_id),
  section     TEXT NOT NULL,
  UNIQUE (course_id, term_id, campus_id, section)
);
CREATE INDEX course_offering_term_campus_idx ON course_offering (term_id, campus_id);

CREATE TABLE teacher (
  teacher_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_no   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE teaching_assignment (
  assignment_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id   INTEGER NOT NULL REFERENCES course_offering(offering_id),
  teacher_id    INTEGER NOT NULL REFERENCES teacher(teacher_id),
  role          TEXT NOT NULL DEFAULT 'primary',
  start_date    DATE,
  end_date      DATE,
  UNIQUE (offering_id, teacher_id, role)
);
CREATE INDEX teaching_assignment_teacher_idx ON teaching_assignment (teacher_id);

CREATE TABLE student (
  student_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sis_id     TEXT NOT NULL UNIQUE,               -- stable identifier from the SIS
  last_name  TEXT NOT NULL,
  first_name TEXT NOT NULL
);

CREATE TABLE enrollment (
  enrollment_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id        INTEGER NOT NULL REFERENCES student(student_id),
  campus_program_id INTEGER NOT NULL REFERENCES campus_program(campus_program_id),
  year_level_id     SMALLINT NOT NULL REFERENCES year_level(year_level_id),
  academic_year_id  INTEGER NOT NULL REFERENCES academic_year(academic_year_id),
  status            TEXT NOT NULL DEFAULT 'enrolled'
                    CHECK (status IN ('enrolled', 'withdrawn', 'graduated', 'on_leave')),
  UNIQUE (student_id, academic_year_id)
);
CREATE INDEX enrollment_campus_program_idx ON enrollment (campus_program_id, academic_year_id);

CREATE TABLE result_status (
  result_status_id SMALLINT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  description      TEXT NOT NULL,
  counts_as_failed BOOLEAN NOT NULL,
  -- FALSE for statuses such as withdrawn that PHINMA may exclude from the denominator.
  counts_in_denominator BOOLEAN NOT NULL DEFAULT TRUE
);

------------------------------------------------------------------------------
-- Accounts, roles, scopes, audit
------------------------------------------------------------------------------

CREATE TABLE role (
  role_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL
);

CREATE TABLE permission (
  permission_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL
);

CREATE TABLE role_permission (
  role_id       SMALLINT NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  permission_id SMALLINT NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- app_users is the ERD's UserAccount. A user may be linked to a teacher record.
ALTER TABLE app_users ADD COLUMN teacher_id INTEGER REFERENCES teacher(teacher_id);

CREATE TABLE user_role (
  user_role_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id      SMALLINT NOT NULL REFERENCES role(role_id),
  UNIQUE (user_id, role_id)
);

-- One row per scope granted to a user's role. NULL campus or program means "all".
CREATE TABLE user_role_scope (
  scope_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_role_id INTEGER NOT NULL REFERENCES user_role(user_role_id) ON DELETE CASCADE,
  campus_id    INTEGER REFERENCES campus(campus_id),
  program_id   INTEGER REFERENCES program(program_id)
);
CREATE UNIQUE INDEX user_role_scope_unique
  ON user_role_scope (user_role_id, COALESCE(campus_id, 0), COALESCE(program_id, 0));

CREATE TABLE audit_log (
  log_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- No ON DELETE action: users with audit history are deactivated, not deleted.
  user_id         UUID REFERENCES app_users(id),
  action          TEXT NOT NULL,                 -- e.g. create, update, delete, login, export
  table_name      TEXT,
  record_id       TEXT,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_metadata JSONB
);
CREATE INDEX audit_log_logged_at_idx ON audit_log (logged_at DESC);
CREATE INDEX audit_log_record_idx ON audit_log (table_name, record_id);

-- The audit log is append-only.
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

------------------------------------------------------------------------------
-- Imports
------------------------------------------------------------------------------

CREATE TABLE import_source (
  source_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL
);

CREATE TABLE import_batch (
  batch_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id         SMALLINT NOT NULL REFERENCES import_source(source_id),
  campus_id         INTEGER NOT NULL REFERENCES campus(campus_id),
  term_id           INTEGER REFERENCES term(term_id),
  grading_period_id SMALLINT REFERENCES grading_period(grading_period_id),
  uploaded_by       UUID NOT NULL REFERENCES app_users(id),
  filename          TEXT NOT NULL,
  content_type      TEXT,
  file_sha256       CHAR(64) NOT NULL,
  original_file     BYTEA NOT NULL,              -- preserved for audit
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at       TIMESTAMPTZ,
  validation_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (validation_status IN ('pending', 'needs_review', 'accepted', 'rejected')),
  total_rows        INTEGER CHECK (total_rows >= 0)
);
CREATE INDEX import_batch_uploaded_at_idx ON import_batch (uploaded_at DESC);

CREATE TABLE import_row_issue (
  issue_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id          INTEGER NOT NULL REFERENCES import_batch(batch_id) ON DELETE CASCADE,
  row_number        INTEGER,                     -- NULL for file-level issues
  issue_type        TEXT NOT NULL CHECK (issue_type IN (
                      'missing_column', 'missing_value', 'duplicate_record',
                      'unmatched_identifier', 'term_mapping', 'program_mapping', 'invalid_value')),
  message           TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'open'
                    CHECK (resolution_status IN ('open', 'resolved', 'ignored'))
);
CREATE INDEX import_row_issue_batch_idx ON import_row_issue (batch_id);

CREATE TABLE grade_record (
  grade_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id        INTEGER NOT NULL REFERENCES student(student_id),
  offering_id       INTEGER NOT NULL REFERENCES course_offering(offering_id),
  grading_period_id SMALLINT NOT NULL REFERENCES grading_period(grading_period_id),
  attempt_no        SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
  grade_value       TEXT,
  result_status_id  SMALLINT NOT NULL REFERENCES result_status(result_status_id),
  batch_id          INTEGER NOT NULL REFERENCES import_batch(batch_id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, offering_id, grading_period_id, attempt_no)
);
CREATE INDEX grade_record_offering_idx ON grade_record (offering_id, grading_period_id);

------------------------------------------------------------------------------
-- Zones and snapshots
------------------------------------------------------------------------------

CREATE TABLE zone (
  zone_id    SMALLINT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code IN ('green', 'yellow', 'red')),
  label      TEXT NOT NULL,
  sort_order SMALLINT NOT NULL
);

CREATE TABLE zone_rule_set (
  rule_set_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  effective_term_id INTEGER NOT NULL REFERENCES term(term_id),
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  approved_by       UUID REFERENCES app_users(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status = 'draft' OR approved_at IS NOT NULL)
);
-- Only one approved rule set may take effect in a given term.
CREATE UNIQUE INDEX zone_rule_set_one_approved_per_term
  ON zone_rule_set (effective_term_id) WHERE status = 'approved';

-- Student level: min/max are failed-subject counts. Subject level: failure-rate percent.
CREATE TABLE zone_threshold (
  threshold_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id  INTEGER NOT NULL REFERENCES zone_rule_set(rule_set_id) ON DELETE CASCADE,
  level        TEXT NOT NULL CHECK (level IN ('student', 'subject')),
  zone_id      SMALLINT NOT NULL REFERENCES zone(zone_id),
  min_value    NUMERIC(6,2) NOT NULL,
  max_value    NUMERIC(6,2),                     -- NULL = no upper bound
  UNIQUE (rule_set_id, level, zone_id),
  CHECK (max_value IS NULL OR max_value >= min_value)
);

-- Thresholds of an approved or retired rule set cannot change; make a new rule set instead.
CREATE FUNCTION zone_threshold_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rs_status TEXT;
BEGIN
  SELECT status INTO rs_status FROM zone_rule_set
   WHERE rule_set_id = COALESCE(NEW.rule_set_id, OLD.rule_set_id);
  IF rs_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'thresholds of a % rule set cannot be changed', rs_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER zone_threshold_lock BEFORE INSERT OR UPDATE OR DELETE ON zone_threshold
  FOR EACH ROW EXECUTE FUNCTION zone_threshold_locked();

CREATE TABLE snapshot_run (
  run_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term_id           INTEGER NOT NULL REFERENCES term(term_id),
  grading_period_id SMALLINT NOT NULL REFERENCES grading_period(grading_period_id),
  campus_id         INTEGER NOT NULL REFERENCES campus(campus_id),
  rule_set_id       INTEGER NOT NULL REFERENCES zone_rule_set(rule_set_id),
  calculated_by     UUID REFERENCES app_users(id),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX snapshot_run_term_idx ON snapshot_run (term_id, grading_period_id, campus_id);

CREATE TABLE student_zone_snapshot (
  snapshot_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id            INTEGER NOT NULL REFERENCES snapshot_run(run_id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES student(student_id),
  -- Frozen at calculation time so later enrollment changes do not alter past reports.
  campus_program_id INTEGER NOT NULL REFERENCES campus_program(campus_program_id),
  year_level_id     SMALLINT NOT NULL REFERENCES year_level(year_level_id),
  failed_count      SMALLINT NOT NULL CHECK (failed_count >= 0),
  zone_id           SMALLINT NOT NULL REFERENCES zone(zone_id),
  UNIQUE (run_id, student_id)
);

CREATE TABLE subject_result_snapshot (
  snapshot_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         INTEGER NOT NULL REFERENCES snapshot_run(run_id) ON DELETE CASCADE,
  offering_id    INTEGER NOT NULL REFERENCES course_offering(offering_id),
  enrolled_count INTEGER NOT NULL CHECK (enrolled_count >= 0),
  graded_count   INTEGER NOT NULL CHECK (graded_count >= 0),
  failed_count   INTEGER NOT NULL CHECK (failed_count >= 0),
  failure_rate   NUMERIC(5,2) NOT NULL CHECK (failure_rate BETWEEN 0 AND 100),
  zone_id        SMALLINT NOT NULL REFERENCES zone(zone_id),
  UNIQUE (run_id, offering_id)
);

-- Indicators only: no zone, rank or rating column, per the proposal's delimitation.
CREATE TABLE teacher_result_snapshot (
  snapshot_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES snapshot_run(run_id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES teaching_assignment(assignment_id),
  student_count INTEGER NOT NULL CHECK (student_count >= 0),
  failed_count  INTEGER NOT NULL CHECK (failed_count >= 0),
  UNIQUE (run_id, assignment_id)
);

------------------------------------------------------------------------------
-- Reports
------------------------------------------------------------------------------

CREATE TABLE report_run (
  report_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_type  TEXT NOT NULL CHECK (report_type IN ('periodic', 'semester')),
  term_id      INTEGER NOT NULL REFERENCES term(term_id),
  run_id       INTEGER REFERENCES snapshot_run(run_id),
  generated_by UUID NOT NULL REFERENCES app_users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE report_run_filter (
  filter_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id    INTEGER NOT NULL REFERENCES report_run(report_id) ON DELETE CASCADE,
  filter_name  TEXT NOT NULL,
  filter_value TEXT NOT NULL
);

------------------------------------------------------------------------------
-- Concerns, deliberation, interventions, referrals
------------------------------------------------------------------------------

CREATE TABLE concern_type (
  concern_type_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  is_academic     BOOLEAN NOT NULL
);

CREATE TABLE concern (
  concern_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concern_type_id SMALLINT NOT NULL REFERENCES concern_type(concern_type_id),
  term_id         INTEGER NOT NULL REFERENCES term(term_id),
  campus_id       INTEGER NOT NULL REFERENCES campus(campus_id),
  -- The context a concern is about: a student, a subject offering, or a teaching assignment.
  student_id      INTEGER REFERENCES student(student_id),
  offering_id     INTEGER REFERENCES course_offering(offering_id),
  assignment_id   INTEGER REFERENCES teaching_assignment(assignment_id),
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  opened_by       UUID NOT NULL REFERENCES app_users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  CHECK (num_nonnulls(student_id, offering_id, assignment_id) >= 1),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX concern_student_idx ON concern (student_id);
CREATE INDEX concern_term_status_idx ON concern (term_id, campus_id, status);

CREATE TABLE deliberation (
  deliberation_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concern_id      INTEGER NOT NULL REFERENCES concern(concern_id),
  meeting_date    DATE NOT NULL,
  decision        TEXT NOT NULL,
  recorded_by     UUID NOT NULL REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX deliberation_concern_idx ON deliberation (concern_id);

CREATE TABLE deliberation_participant (
  deliberation_id INTEGER NOT NULL REFERENCES deliberation(deliberation_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES app_users(id),
  PRIMARY KEY (deliberation_id, user_id)
);

CREATE TABLE deliberation_evidence (
  evidence_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deliberation_id INTEGER NOT NULL REFERENCES deliberation(deliberation_id) ON DELETE CASCADE,
  report_id       INTEGER REFERENCES report_run(report_id),
  run_id          INTEGER REFERENCES snapshot_run(run_id),
  description     TEXT NOT NULL
);

CREATE TABLE intervention_type (
  intervention_type_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL
);

CREATE TABLE intervention (
  intervention_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concern_id           INTEGER NOT NULL REFERENCES concern(concern_id),
  intervention_type_id SMALLINT NOT NULL REFERENCES intervention_type(intervention_type_id),
  owner_user_id        UUID NOT NULL REFERENCES app_users(id),
  description          TEXT NOT NULL,
  target               TEXT,
  start_date           DATE,
  due_date             DATE NOT NULL,
  end_date             DATE,
  status               TEXT NOT NULL DEFAULT 'planned'
                       CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled'))
);
CREATE INDEX intervention_concern_idx ON intervention (concern_id);
CREATE INDEX intervention_owner_status_idx ON intervention (owner_user_id, status);

CREATE TABLE follow_up (
  follow_up_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intervention_id INTEGER NOT NULL REFERENCES intervention(intervention_id) ON DELETE CASCADE,
  checkin_date    DATE NOT NULL,
  progress        TEXT NOT NULL,
  next_step       TEXT,
  outcome         TEXT,
  recorded_by     UUID NOT NULL REFERENCES app_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX follow_up_intervention_idx ON follow_up (intervention_id);

CREATE TABLE referral_team (
  referral_team_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL
);

-- Only the fact, date, destination and status of a referral (proposal delimitation).
CREATE TABLE referral (
  referral_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concern_id       INTEGER NOT NULL REFERENCES concern(concern_id),
  referral_team_id SMALLINT NOT NULL REFERENCES referral_team(referral_team_id),
  referred_by      UUID NOT NULL REFERENCES app_users(id),
  referral_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent', 'acknowledged', 'in_progress', 'closed'))
);
CREATE INDEX referral_team_status_idx ON referral (referral_team_id, status);
CREATE INDEX referral_concern_idx ON referral (concern_id);

-- Restricted notes live in their own table so queries can exclude them by permission.
CREATE TABLE referral_note (
  note_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referral_id INTEGER NOT NULL REFERENCES referral(referral_id) ON DELETE CASCADE,
  note_text   TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX referral_note_referral_idx ON referral_note (referral_id);

------------------------------------------------------------------------------
-- Roles and permissions (from the use case diagram, Appendix B)
------------------------------------------------------------------------------

INSERT INTO role (code, name) VALUES
  ('slc',          'Student Learning Coordinator'),
  ('dean',         'Dean / Program Head'),
  ('faculty',      'Faculty / Teacher'),
  ('alc',          'Active Learning Coordinator'),
  ('ssp',          'SSP Adviser / Coordinator'),
  ('ksh',          'Kasama Support Hub Staff'),
  ('coo',          'Chief Operating Officer'),
  ('dod',          'Dean of Deans'),
  ('tl',           'Team Learning / PEN-wide Leadership'),
  ('data_manager', 'Data Manager'),
  ('admin',        'System Administrator');

INSERT INTO permission (code, description) VALUES
  ('import.upload',          'Upload grade files and resolve import issues'),
  ('import.view',            'View import history and error reports'),
  ('zones.calculate',        'Run zone calculation'),
  ('results.student',        'View student zone summary'),
  ('results.subject',        'View subject results'),
  ('results.teacher',        'View teacher result indicators'),
  ('results.own_classes',    'View results for own classes only'),
  ('results.compare_campus', 'Compare campuses'),
  ('concern.manage',         'Open, update and close concerns'),
  ('deliberation.record',    'Record deliberations and evidence'),
  ('intervention.manage',    'Plan interventions and record follow-ups'),
  ('intervention.own',       'Update own assigned interventions'),
  ('referral.create',        'Create referrals'),
  ('referral.view',          'View referral fact, date, destination and status'),
  ('referral_note.view',     'View restricted referral notes'),
  ('referral_note.create',   'Add restricted referral notes'),
  ('report.generate',        'Generate and export reports'),
  ('report.view',            'View report history'),
  ('rules.configure',        'Draft zone rule sets'),
  ('rules.approve',          'Approve zone rule sets'),
  ('admin.reference_data',   'Manage campuses, programs, terms, courses and offerings'),
  ('admin.users',            'Manage users, roles and scopes'),
  ('audit.view',             'Review the audit log');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM (VALUES
    ('slc', ARRAY['import.view', 'results.student', 'results.subject', 'results.teacher',
                  'concern.manage', 'deliberation.record', 'intervention.manage',
                  'referral.create', 'referral.view', 'referral_note.view', 'referral_note.create',
                  'report.generate', 'report.view']),
    ('dean', ARRAY['results.student', 'results.subject', 'results.teacher', 'concern.manage',
                   'deliberation.record', 'intervention.manage', 'referral.create', 'referral.view',
                   'report.generate', 'report.view']),
    ('faculty', ARRAY['results.own_classes', 'intervention.own']),
    ('alc', ARRAY['results.subject', 'results.teacher', 'concern.manage', 'intervention.manage',
                  'referral.view', 'report.view']),
    ('ssp', ARRAY['referral.view', 'referral_note.view', 'referral_note.create', 'intervention.own']),
    ('ksh', ARRAY['referral.view', 'referral_note.view', 'referral_note.create', 'intervention.own']),
    ('coo', ARRAY['results.student', 'results.subject', 'results.compare_campus',
                  'report.generate', 'report.view', 'rules.approve']),
    ('dod', ARRAY['results.student', 'results.subject', 'results.compare_campus',
                  'report.generate', 'report.view', 'rules.approve']),
    ('tl',  ARRAY['results.student', 'results.subject', 'results.compare_campus',
                  'report.generate', 'report.view']),
    ('data_manager', ARRAY['import.upload', 'import.view', 'zones.calculate']),
    ('admin', ARRAY['import.upload', 'import.view', 'zones.calculate', 'rules.configure',
                    'admin.reference_data', 'admin.users', 'audit.view'])
  ) AS grants(role_code, permission_codes)
  JOIN role r ON r.code = grants.role_code
  JOIN permission p ON p.code = ANY (grants.permission_codes);

------------------------------------------------------------------------------
-- Move existing single-role accounts to user_role, then drop the old column.
------------------------------------------------------------------------------

INSERT INTO user_role (user_id, role_id)
SELECT u.id, r.role_id FROM app_users u JOIN role r ON r.code = u.role;

ALTER TABLE app_users DROP COLUMN role;
