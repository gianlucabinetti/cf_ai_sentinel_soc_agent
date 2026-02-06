DROP TABLE IF EXISTS security_events;
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  ip_address TEXT,
  country TEXT,
  request_path TEXT,
  attack_type TEXT,
  risk_score INTEGER,
  action TEXT,
  payload_preview TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_timestamp ON security_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_ip ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_risk ON security_events(risk_score);
