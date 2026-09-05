-- نظام مبايعات السيارات - مخطط قاعدة البيانات

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','sales_rep','branch_supervisor','sales_manager','accountant')),
  branch TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  sale_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  customer_email TEXT,
  make TEXT NOT NULL,
  trim TEXT,
  model TEXT NOT NULL,
  year TEXT,
  color TEXT,
  plate TEXT,
  vin TEXT NOT NULL,
  odometer TEXT,
  location TEXT,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  deposit NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'POS',
  financier TEXT,
  delivery_date DATE,
  condition_notes TEXT,
  notes TEXT,
  branch TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','supervisor','manager','accounting','rejected')),
  reject_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ثبات: لو الجدول كان موجود من قبل بدون عمود الفرع
ALTER TABLE sales ADD COLUMN IF NOT EXISTS branch TEXT;

CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('supervisor','manager','accounting')),
  action TEXT NOT NULL CHECK (action IN ('approve','reject')),
  user_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- بيانات الشركة الثابتة (سطر واحد فقط)
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL DEFAULT 'اسم المنشأة',
  cr_number TEXT,
  tax_number TEXT,
  address TEXT,
  phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_single_row CHECK (id = 1)
);
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- مخزون السيارات (يُرفع من ملف إكسل) للبحث برقم الهيكل عند إنشاء مبايعة
CREATE TABLE IF NOT EXISTS vehicles (
  vin TEXT PRIMARY KEY,
  make TEXT,
  trim TEXT,
  model TEXT,
  year TEXT,
  color TEXT,
  plate TEXT,
  odometer TEXT,
  location TEXT,
  price NUMERIC(14,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_sale ON audit_log(sale_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);

