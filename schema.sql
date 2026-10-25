CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, slot TEXT NOT NULL, note TEXT,
  items TEXT NOT NULL,
  subtotal INTEGER NOT NULL, delivery INTEGER NOT NULL, tax INTEGER NOT NULL, total INTEGER NOT NULL,
  method TEXT NOT NULL,
  pay_status TEXT NOT NULL,
  pay_ref TEXT, rzp_order_id TEXT,
  status TEXT, email TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, phone TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  guests INTEGER NOT NULL, tables_used INTEGER NOT NULL, seating TEXT, notes TEXT, email TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(date, time);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, rating INTEGER NOT NULL, text TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0, ip_hash TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_ip ON reviews(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS admin_attempts (ip_hash TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_admin_attempts ON admin_attempts(ip_hash, at);
