CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  customer_label TEXT,
  plan TEXT NOT NULL CHECK(plan IN ('basic','standard','pro')),
  status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked','expired')),
  max_activations INTEGER NOT NULL DEFAULT 1 CHECK(max_activations >= 1),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  project_name TEXT,
  primary_hostname TEXT,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(license_id, installation_id),
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);

CREATE INDEX IF NOT EXISTS idx_activations_license_active
  ON activations(license_id, revoked_at);

CREATE TABLE IF NOT EXISTS license_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT,
  installation_id TEXT,
  kind TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_license_events_kind_created
  ON license_events(kind, created_at);
