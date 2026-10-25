-- Adds kitchen status (set by the admin, NULL = auto-advance for the demo), customer email, and login throttling.
ALTER TABLE orders ADD COLUMN status TEXT;
ALTER TABLE orders ADD COLUMN email TEXT;
ALTER TABLE bookings ADD COLUMN email TEXT;
CREATE TABLE IF NOT EXISTS admin_attempts (ip_hash TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_admin_attempts ON admin_attempts(ip_hash, at);
