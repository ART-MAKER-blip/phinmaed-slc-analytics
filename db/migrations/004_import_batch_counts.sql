-- Row counts recorded when a batch is accepted, so the import history shows how many
-- rows went in and how many were skipped because of validation issues.
ALTER TABLE import_batch
  ADD COLUMN accepted_rows INTEGER CHECK (accepted_rows >= 0),
  ADD COLUMN skipped_rows  INTEGER CHECK (skipped_rows >= 0),
  ADD COLUMN decided_by    UUID REFERENCES app_users(id);

-- validation_status meanings:
--   pending       validated with no issues, waiting for confirmation
--   needs_review  validated with row issues; accepting skips the affected rows
--   accepted      valid rows were imported (imported_at, accepted_rows, skipped_rows set)
--   rejected      not imported (file-level issues, or rejected by a user)
