BEGIN;

ALTER TABLE internal_academic.ead_quiz_early_releases
  DROP CONSTRAINT ead_quiz_early_releases_reason_check,
  ADD CONSTRAINT ead_quiz_early_releases_reason_check
    CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 5 AND 500);

COMMIT;
