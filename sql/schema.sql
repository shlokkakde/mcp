CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  team_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  job_title TEXT NOT NULL,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  client_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('lead', 'active', 'at_risk', 'closed')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  contract_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  next_touch_date DATE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_code TEXT NOT NULL UNIQUE,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_employee_id BIGINT REFERENCES employees(id),
  created_by_actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id BIGSERIAL PRIMARY KEY,
  comment_code TEXT UNIQUE,
  task_id BIGINT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
  author_actor_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'paid_leave', 'unpaid_leave', 'absent', 'holiday')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS payroll (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(12, 2) NOT NULL CHECK (monthly_salary >= 0),
  bank_account_last4 TEXT NOT NULL,
  tax_id_last4 TEXT NOT NULL,
  effective_from DATE NOT NULL,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  salary_month DATE NOT NULL,
  overtime_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (overtime_amount >= 0),
  incentives_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (incentives_amount >= 0),
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  payroll_deductions_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (payroll_deductions_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, salary_month)
);

CREATE INDEX IF NOT EXISTS idx_employees_team_id ON employees(team_id);
CREATE INDEX IF NOT EXISTS idx_clients_team_id ON clients(team_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_assigned_employee_id ON client_tasks(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_status_due_date ON client_tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee_month ON payroll_adjustments(employee_id, salary_month);

CREATE TABLE IF NOT EXISTS manager_access_policies (
  actor_id TEXT PRIMARY KEY,
  actor_name TEXT NOT NULL,
  team_code TEXT NOT NULL REFERENCES teams(team_code),
  active BOOLEAN NOT NULL DEFAULT true,
  can_view_clients BOOLEAN NOT NULL DEFAULT true,
  can_view_contract_values BOOLEAN NOT NULL DEFAULT false,
  can_view_tasks BOOLEAN NOT NULL DEFAULT true,
  can_write_tasks BOOLEAN NOT NULL DEFAULT true,
  can_view_attendance BOOLEAN NOT NULL DEFAULT true,
  can_calculate_salary BOOLEAN NOT NULL DEFAULT true,
  updated_by_actor_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_embeddings (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('client', 'task', 'comment')),
  source_id BIGINT NOT NULL,
  source_code TEXT NOT NULL,
  team_code TEXT NOT NULL REFERENCES teams(team_code),
  title TEXT NOT NULL,
  text_content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_crm_embeddings_team_type ON crm_embeddings(team_code, source_type);
CREATE INDEX IF NOT EXISTS idx_crm_embeddings_source_code ON crm_embeddings(source_code);
