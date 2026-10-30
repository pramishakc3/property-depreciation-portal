-- Users who can sign in to the staff portal
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'surveyor', 'viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE job_reference_seq;

-- Depreciation report requests and their progress through the workflow
CREATE TABLE jobs (
  id                SERIAL PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE
                    DEFAULT ('PD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('job_reference_seq')::text, 5, '0')),
  owner_name        TEXT NOT NULL,
  owner_email       TEXT NOT NULL,
  owner_phone       TEXT NOT NULL,
  property_address  TEXT NOT NULL,
  suburb            TEXT NOT NULL,
  state             TEXT NOT NULL,
  postcode          TEXT NOT NULL,
  property_type     TEXT NOT NULL CHECK (property_type IN ('house', 'unit', 'townhouse', 'commercial')),
  purchase_date     DATE NOT NULL,
  purchase_price    NUMERIC(14, 2) NOT NULL CHECK (purchase_price > 0),
  construction_year INTEGER NOT NULL,
  is_new_build      BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'inspection_booked', 'in_progress', 'qa', 'completed', 'cancelled')),
  assigned_to       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  inspection_date   DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_idx ON jobs (status);
CREATE INDEX jobs_assigned_idx ON jobs (assigned_to);

-- Items in a schedule: plant and equipment (Div 40) and capital works (Div 43)
CREATE TABLE assets (
  id              SERIAL PRIMARY KEY,
  job_id          INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('plant', 'capital_works')),
  name            TEXT NOT NULL,
  cost            NUMERIC(14, 2) NOT NULL CHECK (cost > 0),
  effective_life  NUMERIC(6, 2),
  method          TEXT NOT NULL CHECK (method IN ('diminishing_value', 'prime_cost')),
  start_date      DATE NOT NULL,
  previously_used BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_job_idx ON assets (job_id);

-- Who changed what, and when
CREATE TABLE audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_log (created_at DESC);
