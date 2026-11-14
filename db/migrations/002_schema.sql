-- Core schema, shaped by the PHINMA SIS "Grade Deliberation Report" export
-- (one row per student per subject per term, with P1, P2 and P3 period scores) and by
-- the SLC collated summary workbook (zones per period at student, subject and teacher level).
--
-- Source records (students, enrollments with period scores) are kept separate from derived
-- results (snapshots). A snapshot run stores the rule set and the moment it read the scores,
-- so any past result can be recomputed exactly.

------------------------------------------------------------------------------
-- Organization and calendar
------------------------------------------------------------------------------

CREATE TABLE campus (
  campus_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,              -- COC, AU, UPANG, ... (also the section prefix: COC-FA1-IT1-04)
  name      TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

-- Colleges are the same across PHINMA schools (CITE, CAHS, CAS, ...), as in the collated summary.
CREATE TABLE college (
  college_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL UNIQUE               -- matches the SIS COLLEGE column
);

CREATE TABLE program (
  program_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  college_id INTEGER NOT NULL REFERENCES college(college_id),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL UNIQUE               -- matches the SIS COURSE column
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

-- SIS SESSION "SY 25-26 SEM II" is term 2025-2 (code YYYY-N sorts in order).
CREATE TABLE term (
  term_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE CHECK (code ~ '^\d{4}-[1-3]$'),
  school_year        TEXT NOT NULL,             -- 2025-2026
  semester           SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 3),
  name               TEXT NOT NULL,
  start_date         DATE,
  end_date           DATE,
  grade_release_date DATE,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
);

CREATE TABLE grading_period (
  grading_period_id SMALLINT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,       -- P1, P2, P3
  name              TEXT NOT NULL
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
  action          TEXT NOT NULL,
  table_name      TEXT,
  record_id       TEXT,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_metadata JSONB
);
CREATE INDEX audit_log_logged_at_idx ON audit_log (logged_at DESC);
CREATE INDEX audit_log_record_idx ON audit_log (table_name, record_id);

CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

------------------------------------------------------------------------------
-- Academic records (imported from the SIS export)
------------------------------------------------------------------------------

CREATE TABLE course (                           -- SIS CODE / SUBJECT NAME
  course_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  subject_type TEXT,                            -- Lecture, Lecture and Laboratory
  units        NUMERIC(4,1)
);

CREATE TABLE program_course (
  program_id    INTEGER NOT NULL REFERENCES program(program_id),
  course_id     INTEGER NOT NULL REFERENCES course(course_id),
  year_level_id SMALLINT REFERENCES year_level(year_level_id),
  PRIMARY KEY (program_id, course_id)
);

-- A subject taught to one section in one term: SIS CODE + SECTION.
CREATE TABLE course_offering (
  offering_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id   INTEGER NOT NULL REFERENCES course(course_id),
  term_id     INTEGER NOT NULL REFERENCES term(term_id),
  campus_id   INTEGER NOT NULL REFERENCES campus(campus_id),
  section     TEXT NOT NULL,                    -- COC-FA1-IT1-04
  UNIQUE (course_id, term_id, campus_id, section)
);
CREATE INDEX course_offering_term_campus_idx ON course_offering (term_id, campus_id);

-- The SIS export has teacher names but no teacher ID, so a teacher is identified by their
-- normalized name (trimmed, single spaces, upper case) within a campus.
CREATE TABLE teacher (
  teacher_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campus_id  INTEGER NOT NULL REFERENCES campus(campus_id),
  name_key   TEXT NOT NULL,
  name       TEXT NOT NULL,
  UNIQUE (campus_id, name_key)
);

CREATE TABLE teaching_assignment (
  assignment_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offering_id   INTEGER NOT NULL REFERENCES course_offering(offering_id),
  teacher_id    INTEGER NOT NULL REFERENCES teacher(teacher_id),
  UNIQUE (offering_id, teacher_id)
);
CREATE INDEX teaching_assignment_teacher_idx ON teaching_assignment (teacher_id);

CREATE TABLE student (
  student_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sis_id         TEXT NOT NULL UNIQUE,          -- SIS STUDENT ID without the leading apostrophe
  full_name      TEXT NOT NULL,                 -- SIS NAME, "LAST, FIRST MIDDLE"
  gender         TEXT,
  admission_type TEXT                           -- Regular, Transferee, Returnee
);

-- A student's standing in one term: program, year level (from SEMESTER, e.g. Y2S2) and SSP group.
CREATE TABLE student_term (
  student_term_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id        INTEGER NOT NULL REFERENCES student(student_id),
  term_id           INTEGER NOT NULL REFERENCES term(term_id),
  campus_program_id INTEGER NOT NULL REFERENCES campus_program(campus_program_id),
  year_level_id     SMALLINT NOT NULL REFERENCES year_level(year_level_id),
  ssp_section       TEXT,
  ssp_adviser       TEXT,
  UNIQUE (student_id, term_id)
);
CREATE INDEX student_term_program_idx ON student_term (term_id, campus_program_id);

CREATE TABLE result_status (                    -- SIS REMARKS
  code             TEXT PRIMARY KEY,
  description      TEXT NOT NULL
);

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
  term_id           INTEGER NOT NULL REFERENCES term(term_id),
  uploaded_by       UUID NOT NULL REFERENCES app_users(id),
  filename          TEXT NOT NULL,
  content_type      TEXT,
  file_sha256       CHAR(64) NOT NULL,
  original_file     BYTEA NOT NULL,             -- preserved for audit
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at       TIMESTAMPTZ,
  validation_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (validation_status IN ('pending', 'needs_review', 'accepted', 'rejected')),
  total_rows        INTEGER CHECK (total_rows >= 0),
  accepted_rows     INTEGER CHECK (accepted_rows >= 0),
  skipped_rows      INTEGER CHECK (skipped_rows >= 0),
  decided_by        UUID REFERENCES app_users(id)
);
CREATE INDEX import_batch_uploaded_at_idx ON import_batch (uploaded_at DESC);

-- Errors skip the row; warnings are reported but the row is still imported.
CREATE TABLE import_row_issue (
  issue_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id          INTEGER NOT NULL REFERENCES import_batch(batch_id) ON DELETE CASCADE,
  row_number        INTEGER,                    -- NULL for file-level issues
  severity          TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning')),
  issue_type        TEXT NOT NULL CHECK (issue_type IN (
                      'missing_column', 'missing_value', 'duplicate_record',
                      'unmatched_identifier', 'term_mapping', 'program_mapping', 'invalid_value')),
  message           TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'open'
                    CHECK (resolution_status IN ('open', 'resolved', 'ignored'))
);
CREATE INDEX import_row_issue_batch_idx ON import_row_issue (batch_id);

-- One row per student per subject offering, with the period scores as exported.
-- The *_raw columns keep the exact text (NA, INC, ABS, or the number) so rules can change later.
CREATE TABLE enrollment (
  enrollment_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES student(student_id),
  offering_id     INTEGER NOT NULL REFERENCES course_offering(offering_id),
  modality        TEXT,                         -- FLEX, FLEX REMOTE
  enlistment_mode TEXT,                         -- Regular, Re-Study
  p1_raw          TEXT,
  p2_raw          TEXT,
  p3_raw          TEXT,
  final_grade     TEXT,                         -- 1.0-4.0, NC, INC, FA, DP, COMPLETE, INCOMPLETE
  remarks         TEXT REFERENCES result_status(code),
  batch_id        INTEGER NOT NULL REFERENCES import_batch(batch_id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (student_id, offering_id)
);
CREATE INDEX enrollment_offering_idx ON enrollment (offering_id);

-- Every replaced version of an enrollment row, so past snapshots can be recomputed.
-- Scores in force at time T: enrollment rows with updated_at <= T, plus history rows
-- with valid_from <= T < valid_to.
CREATE TABLE enrollment_history (
  history_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollment(enrollment_id),
  student_id    INTEGER NOT NULL,
  offering_id   INTEGER NOT NULL,
  p1_raw        TEXT,
  p2_raw        TEXT,
  p3_raw        TEXT,
  final_grade   TEXT,
  remarks       TEXT,
  batch_id      INTEGER NOT NULL,
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_to      TIMESTAMPTZ NOT NULL,
  CHECK (valid_to >= valid_from)
);
CREATE INDEX enrollment_history_offering_idx ON enrollment_history (offering_id);

CREATE FUNCTION enrollment_keep_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'enrollment records cannot be deleted; import a corrected file instead';
  END IF;
  IF NEW.student_id <> OLD.student_id OR NEW.offering_id <> OLD.offering_id THEN
    RAISE EXCEPTION 'the student and subject offering of an enrollment cannot change';
  END IF;
  IF NEW.updated_at <= OLD.updated_at THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  INSERT INTO enrollment_history (enrollment_id, student_id, offering_id, p1_raw, p2_raw, p3_raw,
                                  final_grade, remarks, batch_id, valid_from, valid_to)
  VALUES (OLD.enrollment_id, OLD.student_id, OLD.offering_id, OLD.p1_raw, OLD.p2_raw, OLD.p3_raw,
          OLD.final_grade, OLD.remarks, OLD.batch_id, OLD.updated_at, NEW.updated_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER enrollment_history BEFORE UPDATE OR DELETE ON enrollment
  FOR EACH ROW EXECUTE FUNCTION enrollment_keep_history();

------------------------------------------------------------------------------
-- Zone rules and snapshots
------------------------------------------------------------------------------

CREATE TABLE zone (
  zone_id    SMALLINT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE CHECK (code IN ('green', 'yellow', 'red')),
  label      TEXT NOT NULL,                     -- Green, Yellow, Red
  alt_label  TEXT NOT NULL,                     -- Safe, Danger, Critical (SLC workbook)
  sort_order SMALLINT NOT NULL
);

CREATE TABLE zone_rule_set (
  rule_set_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  effective_term_id INTEGER NOT NULL REFERENCES term(term_id),
  -- A subject counts as failed in a period when its score is below the passing mark, or the
  -- period value is in failed_values. Values in skipped_values (and empty cells) are not counted.
  passing_mark      NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (passing_mark BETWEEN 0 AND 100),
  failed_values     TEXT[] NOT NULL DEFAULT '{INC,ABS}',
  skipped_values    TEXT[] NOT NULL DEFAULT '{NA}',
  -- For P3 only, these final REMARKS also count as failed.
  failing_remarks   TEXT[] NOT NULL DEFAULT '{FAILED,NO CREDIT}',
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  approved_by       UUID REFERENCES app_users(id),
  approved_at       TIMESTAMPTZ,
  created_by        UUID REFERENCES app_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status = 'draft' OR approved_at IS NOT NULL)
);
CREATE UNIQUE INDEX zone_rule_set_one_approved_per_term
  ON zone_rule_set (effective_term_id) WHERE status = 'approved';

-- Student: failed-subject counts. Subject and teacher: failure rate in percent.
CREATE TABLE zone_threshold (
  threshold_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id  INTEGER NOT NULL REFERENCES zone_rule_set(rule_set_id) ON DELETE CASCADE,
  level        TEXT NOT NULL CHECK (level IN ('student', 'subject', 'teacher')),
  zone_id      SMALLINT NOT NULL REFERENCES zone(zone_id),
  min_value    NUMERIC(6,2) NOT NULL,
  max_value    NUMERIC(6,2),
  UNIQUE (rule_set_id, level, zone_id),
  CHECK (max_value IS NULL OR max_value >= min_value)
);

-- Approved or retired rule sets cannot change (thresholds or settings).
CREATE FUNCTION zone_threshold_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rs_status TEXT;
BEGIN
  SELECT status INTO rs_status FROM zone_rule_set WHERE rule_set_id = COALESCE(NEW.rule_set_id, OLD.rule_set_id);
  IF rs_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'thresholds of a % rule set cannot be changed', rs_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER zone_threshold_lock BEFORE INSERT OR UPDATE OR DELETE ON zone_threshold
  FOR EACH ROW EXECUTE FUNCTION zone_threshold_locked();

CREATE FUNCTION zone_rule_set_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.passing_mark, NEW.failed_values, NEW.skipped_values, NEW.failing_remarks, NEW.effective_term_id)
       IS DISTINCT FROM (OLD.passing_mark, OLD.failed_values, OLD.skipped_values, OLD.failing_remarks, OLD.effective_term_id) THEN
    RAISE EXCEPTION 'settings of a % rule set cannot be changed', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zone_rule_set_lock BEFORE UPDATE ON zone_rule_set
  FOR EACH ROW EXECUTE FUNCTION zone_rule_set_locked();

CREATE TABLE snapshot_run (
  run_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term_id           INTEGER NOT NULL REFERENCES term(term_id),
  grading_period_id SMALLINT NOT NULL REFERENCES grading_period(grading_period_id),
  campus_id         INTEGER NOT NULL REFERENCES campus(campus_id),
  rule_set_id       INTEGER NOT NULL REFERENCES zone_rule_set(rule_set_id),
  calculated_by     UUID REFERENCES app_users(id),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  student_count     INTEGER CHECK (student_count >= 0),
  offering_count    INTEGER CHECK (offering_count >= 0),
  teacher_count     INTEGER CHECK (teacher_count >= 0)
);
CREATE INDEX snapshot_run_term_idx ON snapshot_run (term_id, grading_period_id, campus_id);

CREATE TABLE student_zone_snapshot (
  snapshot_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id            INTEGER NOT NULL REFERENCES snapshot_run(run_id) ON DELETE CASCADE,
  student_id        INTEGER NOT NULL REFERENCES student(student_id),
  -- Frozen at calculation time so later changes do not alter past reports.
  campus_program_id INTEGER NOT NULL REFERENCES campus_program(campus_program_id),
  year_level_id     SMALLINT NOT NULL REFERENCES year_level(year_level_id),
  counted_subjects  SMALLINT NOT NULL CHECK (counted_subjects >= 0),
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

-- Teacher zones follow the client's SLC workbook: failure rate across all of a teacher's classes.
CREATE TABLE teacher_result_snapshot (
  snapshot_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES snapshot_run(run_id) ON DELETE CASCADE,
  teacher_id    INTEGER NOT NULL REFERENCES teacher(teacher_id),
  graded_count  INTEGER NOT NULL CHECK (graded_count >= 0),
  failed_count  INTEGER NOT NULL CHECK (failed_count >= 0),
  failure_rate  NUMERIC(5,2) NOT NULL CHECK (failure_rate BETWEEN 0 AND 100),
  zone_id       SMALLINT NOT NULL REFERENCES zone(zone_id),
  UNIQUE (run_id, teacher_id)
);

CREATE FUNCTION snapshot_results_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed; run a new zone calculation instead', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER snapshot_run_read_only BEFORE UPDATE ON snapshot_run
  FOR EACH ROW EXECUTE FUNCTION snapshot_results_read_only();
CREATE TRIGGER student_zone_snapshot_read_only BEFORE UPDATE ON student_zone_snapshot
  FOR EACH ROW EXECUTE FUNCTION snapshot_results_read_only();
CREATE TRIGGER subject_result_snapshot_read_only BEFORE UPDATE ON subject_result_snapshot
  FOR EACH ROW EXECUTE FUNCTION snapshot_results_read_only();
CREATE TRIGGER teacher_result_snapshot_read_only BEFORE UPDATE ON teacher_result_snapshot
  FOR EACH ROW EXECUTE FUNCTION snapshot_results_read_only();

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
  student_id      INTEGER REFERENCES student(student_id),
  offering_id     INTEGER REFERENCES course_offering(offering_id),
  teacher_id      INTEGER REFERENCES teacher(teacher_id),
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  opened_by       UUID NOT NULL REFERENCES app_users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  CHECK (num_nonnulls(student_id, offering_id, teacher_id) >= 1),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX concern_student_idx ON concern (student_id);
CREATE INDEX concern_term_status_idx ON concern (term_id, campus_id, status);
-- One open concern per student per term.
CREATE UNIQUE INDEX concern_one_open_per_student
  ON concern (student_id, term_id) WHERE student_id IS NOT NULL AND status <> 'closed';

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
-- For SSP referrals, the student's SSP adviser from the SIS export is recorded as the recipient.
CREATE TABLE referral (
  referral_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concern_id       INTEGER NOT NULL REFERENCES concern(concern_id),
  referral_team_id SMALLINT NOT NULL REFERENCES referral_team(referral_team_id),
  recipient        TEXT,
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
-- Roles and permissions: the four final users
------------------------------------------------------------------------------

INSERT INTO role (code, name) VALUES
  ('slc',   'Student Learning Coordinator'),
  ('tl',    'Team Learning Lead'),
  ('coo',   'Chief Operating Officer'),
  ('admin', 'System Administrator');

INSERT INTO permission (code, description) VALUES
  ('import.upload',          'Upload grade files and accept or reject imports'),
  ('import.view',            'View import history and error reports'),
  ('zones.calculate',        'Run zone calculation'),
  ('results.student',        'View student zones'),
  ('results.subject',        'View subject zones'),
  ('results.teacher',        'View teacher zones'),
  ('results.compare_campus', 'Compare campuses'),
  ('concern.manage',         'Open, update and close concerns'),
  ('deliberation.record',    'Record deliberations and evidence'),
  ('intervention.manage',    'Plan interventions and record follow-ups'),
  ('referral.create',        'Create and update referrals'),
  ('referral.view',          'View referral fact, date, destination and status'),
  ('referral_note.view',     'View restricted referral notes'),
  ('referral_note.create',   'Add restricted referral notes'),
  ('report.generate',        'Export reports'),
  ('report.view',            'View reports'),
  ('rules.configure',        'Draft zone rule sets'),
  ('rules.approve',          'Approve and retire zone rule sets'),
  ('admin.reference_data',   'Manage campuses, colleges, programs and terms'),
  ('admin.users',            'Manage users, roles and scopes'),
  ('audit.view',             'Review the audit log');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM (VALUES
    ('slc', ARRAY['import.upload', 'import.view', 'zones.calculate', 'results.student', 'results.subject',
                  'results.teacher', 'concern.manage', 'deliberation.record', 'intervention.manage',
                  'referral.create', 'referral.view', 'referral_note.view', 'referral_note.create',
                  'report.generate', 'report.view']),
    ('tl', ARRAY['results.student', 'results.subject', 'results.teacher', 'results.compare_campus',
                 'report.generate', 'report.view', 'rules.approve']),
    ('coo', ARRAY['results.student', 'results.subject', 'results.teacher', 'results.compare_campus',
                  'report.generate', 'report.view']),
    ('admin', ARRAY['import.upload', 'import.view', 'zones.calculate', 'rules.configure',
                    'admin.reference_data', 'admin.users', 'audit.view'])
  ) AS grants(role_code, permission_codes)
  JOIN role r ON r.code = grants.role_code
  JOIN permission p ON p.code = ANY (grants.permission_codes);
