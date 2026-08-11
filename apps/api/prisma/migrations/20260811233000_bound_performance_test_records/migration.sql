ALTER TABLE "performance_tests"
  ALTER COLUMN "testNo" TYPE VARCHAR(64),
  ALTER COLUMN "relatedObjectName" TYPE VARCHAR(200),
  ALTER COLUMN "standardValue" TYPE VARCHAR(500),
  ALTER COLUMN "actualValue" TYPE VARCHAR(500),
  ALTER COLUMN "resultSummary" TYPE VARCHAR(4000);

ALTER TABLE "performance_tests"
  ADD CONSTRAINT "performance_tests_record_bounds_check"
    CHECK (
      "testNo" ~ '^[A-Za-z0-9._-]{1,64}$'
      AND (
        "sampleId" IS NULL
        OR "sampleId" ~ '^[A-Za-z0-9_-]{1,64}$'
      )
      AND (
        "testedById" IS NULL
        OR "testedById" ~ '^[A-Za-z0-9_-]{1,64}$'
      )
      AND (
        "relatedObjectName" IS NULL
        OR char_length("relatedObjectName") BETWEEN 1 AND 200
      )
      AND (
        "standardValue" IS NULL
        OR char_length("standardValue") BETWEEN 1 AND 500
      )
      AND (
        "actualValue" IS NULL
        OR char_length("actualValue") BETWEEN 1 AND 500
      )
      AND (
        "resultSummary" IS NULL
        OR char_length("resultSummary") BETWEEN 1 AND 4000
      )
      AND octet_length(
        COALESCE("testNo", '')
        || COALESCE("sampleId", '')
        || COALESCE("relatedObjectName", '')
        || COALESCE("standardValue", '')
        || COALESCE("actualValue", '')
        || COALESCE("resultSummary", '')
        || COALESCE("testedById", '')
      ) <= 16384
    );
