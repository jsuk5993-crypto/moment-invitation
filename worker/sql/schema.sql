CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount = 9900),
  status TEXT NOT NULL CHECK (status IN ('created','confirming','paid','refunded')),
  checkout_hash TEXT NOT NULL,
  payment_key TEXT UNIQUE,
  license_hash TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_paid_idx ON orders(status, paid_at);
CREATE UNIQUE INDEX IF NOT EXISTS orders_license_idx ON orders(license_hash);
