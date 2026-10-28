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

-- Build 34: evidence of a buyer's pre-checkout policy acknowledgement.
-- No IP address, email, or personal data is stored here.
CREATE TABLE IF NOT EXISTS purchase_acknowledgements (
  order_id TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  acknowledged_at INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(order_id)
);
