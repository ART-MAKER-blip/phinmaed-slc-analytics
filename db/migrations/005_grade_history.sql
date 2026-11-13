-- Keeps every replaced grade so a past snapshot can be recomputed exactly
-- (functional test case 20). Imports overwrite grade_record when a later file changes a
-- grade; this trigger first copies the old values here with the period they were valid.
--
-- The grades in force at time T are:
--   grade_record rows with updated_at <= T, plus
--   grade_record_history rows with valid_from <= T < valid_to.

CREATE TABLE grade_record_history (
  history_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grade_id         BIGINT NOT NULL REFERENCES grade_record(grade_id),
  student_id       INTEGER NOT NULL,
  offering_id      INTEGER NOT NULL,
  grading_period_id SMALLINT NOT NULL,
  attempt_no       SMALLINT NOT NULL,
  grade_value      TEXT,
  result_status_id SMALLINT NOT NULL,
  batch_id         INTEGER NOT NULL,
  valid_from       TIMESTAMPTZ NOT NULL,
  valid_to         TIMESTAMPTZ NOT NULL,
  CHECK (valid_to >= valid_from)
);
CREATE INDEX grade_record_history_offering_idx ON grade_record_history (offering_id, grading_period_id);

CREATE FUNCTION grade_record_keep_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'grade records cannot be deleted; import a corrected file instead';
  END IF;
  -- Rows that identify the grade must not move; only its value and status change.
  IF NEW.student_id <> OLD.student_id OR NEW.offering_id <> OLD.offering_id
     OR NEW.grading_period_id <> OLD.grading_period_id OR NEW.attempt_no <> OLD.attempt_no THEN
    RAISE EXCEPTION 'the student, offering, period and attempt of a grade record cannot change';
  END IF;
  IF NEW.updated_at <= OLD.updated_at THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  INSERT INTO grade_record_history (grade_id, student_id, offering_id, grading_period_id, attempt_no,
                                    grade_value, result_status_id, batch_id, valid_from, valid_to)
  VALUES (OLD.grade_id, OLD.student_id, OLD.offering_id, OLD.grading_period_id, OLD.attempt_no,
          OLD.grade_value, OLD.result_status_id, OLD.batch_id, OLD.updated_at, NEW.updated_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER grade_record_history BEFORE UPDATE OR DELETE ON grade_record
  FOR EACH ROW EXECUTE FUNCTION grade_record_keep_history();

-- Snapshot runs record what they were computed from, so a verification can say why a
-- recomputation matches or not.
ALTER TABLE snapshot_run
  ADD COLUMN student_count  INTEGER CHECK (student_count >= 0),
  ADD COLUMN offering_count INTEGER CHECK (offering_count >= 0),
  ADD COLUMN skipped_students INTEGER NOT NULL DEFAULT 0 CHECK (skipped_students >= 0);

-- Saved results are never edited; a recalculation creates a new run.
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
