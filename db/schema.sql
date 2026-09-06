CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','sales')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_settings (
  id INT PRIMARY KEY DEFAULT 1,
  company_name VARCHAR(200),
  cr_number VARCHAR(50),
  vat_number VARCHAR(50),
  phone VARCHAR(50),
  address VARCHAR(300),
  branch VARCHAR(150),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cars (
  id SERIAL PRIMARY KEY,
  chassis VARCHAR(64) UNIQUE NOT NULL,
  make VARCHAR(100),
  model VARCHAR(100),
  year VARCHAR(10),
  color VARCHAR(50),
  plate VARCHAR(50),
  price NUMERIC(12,2),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_counter (
  id INT PRIMARY KEY DEFAULT 1,
  value INT NOT NULL DEFAULT 0
);
INSERT INTO contract_counter (id, value) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  contract_number VARCHAR(30) UNIQUE NOT NULL,
  car_id INT REFERENCES cars(id),
  customer_name VARCHAR(150) NOT NULL,
  customer_id_number VARCHAR(50),
  customer_nationality VARCHAR(50),
  customer_phone VARCHAR(50),
  customer_address VARCHAR(300),
  final_price NUMERIC(12,2),
  payment_method VARCHAR(50),
  terms_text TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  approved_at TIMESTAMP
);
