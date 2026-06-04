INSERT INTO teams (team_code, name)
VALUES
  ('D-SALES', 'Deep CRM Sales'),
  ('D-SUPPORT', 'Deep CRM Client Support')
ON CONFLICT (team_code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO manager_access_policies (
  actor_id,
  actor_name,
  team_code,
  active,
  can_view_clients,
  can_view_contract_values,
  can_view_tasks,
  can_write_tasks,
  can_view_attendance,
  can_calculate_salary,
  updated_by_actor_id
)
VALUES
  ('deep_sales_manager', 'Deep Sales Manager', 'D-SALES', true, true, false, true, true, true, true, 'seed'),
  ('deep_support_manager', 'Deep Support Manager', 'D-SUPPORT', true, true, false, true, true, true, true, 'seed')
ON CONFLICT (actor_id) DO UPDATE SET
  actor_name = EXCLUDED.actor_name,
  team_code = EXCLUDED.team_code,
  active = EXCLUDED.active,
  can_view_clients = EXCLUDED.can_view_clients,
  can_view_contract_values = EXCLUDED.can_view_contract_values,
  can_view_tasks = EXCLUDED.can_view_tasks,
  can_write_tasks = EXCLUDED.can_write_tasks,
  can_view_attendance = EXCLUDED.can_view_attendance,
  can_calculate_salary = EXCLUDED.can_calculate_salary,
  updated_by_actor_id = EXCLUDED.updated_by_actor_id,
  updated_at = now();

INSERT INTO employees (employee_code, full_name, email, job_title, team_id, active)
VALUES
  ('D-EMP-001', 'Aarav Mehta', 'aarav@deep.example', 'Senior Account Executive', (SELECT id FROM teams WHERE team_code = 'D-SALES'), true),
  ('D-EMP-002', 'Isha Rao', 'isha@deep.example', 'Client Growth Associate', (SELECT id FROM teams WHERE team_code = 'D-SALES'), true),
  ('D-EMP-003', 'Neel Shah', 'neel@deep.example', 'Support Specialist', (SELECT id FROM teams WHERE team_code = 'D-SUPPORT'), true),
  ('D-EMP-004', 'Mira Joshi', 'mira@deep.example', 'Implementation Lead', (SELECT id FROM teams WHERE team_code = 'D-SUPPORT'), true)
ON CONFLICT (employee_code) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  job_title = EXCLUDED.job_title,
  team_id = EXCLUDED.team_id,
  active = EXCLUDED.active;

INSERT INTO clients (client_code, name, industry, contact_name, contact_email, status, priority, contract_value, next_touch_date, team_id, notes)
VALUES
  ('D-CLI-001', 'Acme Retail Group', 'Retail', 'Priya Nair', 'priya.nair@acmeretail.example', 'active', 'high', 420000.00, '2026-06-07', (SELECT id FROM teams WHERE team_code = 'D-SALES'), 'Expansion opportunity for west region stores.'),
  ('D-CLI-002', 'Northstar Logistics', 'Logistics', 'Kabir Sethi', 'kabir@northstar.example', 'at_risk', 'critical', 610000.00, '2026-06-05', (SELECT id FROM teams WHERE team_code = 'D-SALES'), 'Renewal depends on issue resolution before quarter close.'),
  ('D-CLI-003', 'Greenleaf Foods', 'Food and Beverage', 'Meera Kapoor', 'meera@greenleaf.example', 'active', 'medium', 270000.00, '2026-06-10', (SELECT id FROM teams WHERE team_code = 'D-SUPPORT'), 'Needs onboarding help for two new warehouses.'),
  ('D-CLI-004', 'BrightPath Academy', 'Education', 'Rahul Bose', 'rahul@brightpath.example', 'lead', 'medium', 180000.00, '2026-06-12', (SELECT id FROM teams WHERE team_code = 'D-SUPPORT'), 'Pilot proposal under review.')
ON CONFLICT (client_code) DO UPDATE SET
  name = EXCLUDED.name,
  industry = EXCLUDED.industry,
  contact_name = EXCLUDED.contact_name,
  contact_email = EXCLUDED.contact_email,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  contract_value = EXCLUDED.contract_value,
  next_touch_date = EXCLUDED.next_touch_date,
  team_id = EXCLUDED.team_id,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO client_tasks (task_code, client_id, title, description, assigned_employee_id, created_by_actor_id, status, priority, due_date, completed_at, completion_notes)
VALUES
  ('D-TASK-001', (SELECT id FROM clients WHERE client_code = 'D-CLI-001'), 'Prepare Acme renewal deck', 'Create a client-ready renewal deck with usage wins and next-year pricing options.', (SELECT id FROM employees WHERE employee_code = 'D-EMP-001'), 'deep_sales_manager', 'completed', 'high', '2026-05-09', '2026-05-08 15:30:00+00', 'Sent final renewal deck to Priya.'),
  ('D-TASK-002', (SELECT id FROM clients WHERE client_code = 'D-CLI-002'), 'Resolve Northstar escalation', 'Coordinate with support and send a recovery plan for delayed shipments dashboard.', (SELECT id FROM employees WHERE employee_code = 'D-EMP-002'), 'deep_sales_manager', 'in_progress', 'critical', '2026-06-05', NULL, NULL),
  ('D-TASK-003', (SELECT id FROM clients WHERE client_code = 'D-CLI-003'), 'Greenleaf warehouse onboarding', 'Train warehouse users and verify barcode sync setup.', (SELECT id FROM employees WHERE employee_code = 'D-EMP-003'), 'deep_support_manager', 'completed', 'medium', '2026-05-21', '2026-05-20 11:00:00+00', 'Training completed for both warehouse teams.'),
  ('D-TASK-004', (SELECT id FROM clients WHERE client_code = 'D-CLI-004'), 'Draft BrightPath pilot checklist', 'Prepare pilot success checklist and first-week onboarding timeline.', (SELECT id FROM employees WHERE employee_code = 'D-EMP-004'), 'deep_support_manager', 'todo', 'medium', '2026-06-14', NULL, NULL),
  ('D-TASK-005', (SELECT id FROM clients WHERE client_code = 'D-CLI-002'), 'Northstar executive follow-up', 'Schedule a follow-up with Kabir after escalation notes are approved.', (SELECT id FROM employees WHERE employee_code = 'D-EMP-001'), 'deep_sales_manager', 'todo', 'high', '2026-06-03', NULL, NULL)
ON CONFLICT (task_code) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  assigned_employee_id = EXCLUDED.assigned_employee_id,
  created_by_actor_id = EXCLUDED.created_by_actor_id,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  due_date = EXCLUDED.due_date,
  completed_at = EXCLUDED.completed_at,
  completion_notes = EXCLUDED.completion_notes,
  updated_at = now();

INSERT INTO task_comments (comment_code, task_id, author_actor_id, body)
VALUES
  ('D-COM-001', (SELECT id FROM client_tasks WHERE task_code = 'D-TASK-002'), 'deep_sales_manager', 'Ask support for dashboard latency screenshots before client call.'),
  ('D-COM-002', (SELECT id FROM client_tasks WHERE task_code = 'D-TASK-003'), 'deep_support_manager', 'Greenleaf confirmed the barcode scanner checklist is complete.')
ON CONFLICT (comment_code) DO UPDATE SET
  task_id = EXCLUDED.task_id,
  author_actor_id = EXCLUDED.author_actor_id,
  body = EXCLUDED.body;

INSERT INTO payroll (employee_id, monthly_salary, bank_account_last4, tax_id_last4, effective_from, internal_notes)
VALUES
  ((SELECT id FROM employees WHERE employee_code = 'D-EMP-001'), 90000.00, '1201', '8810', '2026-01-01', 'CEO-only payroll record.'),
  ((SELECT id FROM employees WHERE employee_code = 'D-EMP-002'), 76000.00, '4432', '2190', '2026-01-01', 'CEO-only payroll record.'),
  ((SELECT id FROM employees WHERE employee_code = 'D-EMP-003'), 68000.00, '7788', '4021', '2026-01-01', 'CEO-only payroll record.'),
  ((SELECT id FROM employees WHERE employee_code = 'D-EMP-004'), 72000.00, '9907', '3312', '2026-01-01', 'CEO-only payroll record.')
ON CONFLICT (employee_id) DO UPDATE SET
  monthly_salary = EXCLUDED.monthly_salary,
  bank_account_last4 = EXCLUDED.bank_account_last4,
  tax_id_last4 = EXCLUDED.tax_id_last4,
  effective_from = EXCLUDED.effective_from,
  internal_notes = EXCLUDED.internal_notes;

INSERT INTO attendance (employee_id, work_date, status, notes)
SELECT
  e.id,
  d::date,
  CASE
    WHEN EXTRACT(ISODOW FROM d) IN (6, 7) THEN 'holiday'
    WHEN e.employee_code = 'D-EMP-001' AND d::date IN ('2026-05-12', '2026-05-13') THEN 'unpaid_leave'
    WHEN e.employee_code = 'D-EMP-001' AND d::date = '2026-05-22' THEN 'absent'
    WHEN e.employee_code = 'D-EMP-002' AND d::date = '2026-05-08' THEN 'paid_leave'
    WHEN e.employee_code = 'D-EMP-002' AND d::date = '2026-05-19' THEN 'unpaid_leave'
    WHEN e.employee_code = 'D-EMP-003' AND d::date = '2026-05-05' THEN 'paid_leave'
    WHEN e.employee_code = 'D-EMP-003' AND d::date = '2026-05-26' THEN 'absent'
    WHEN e.employee_code = 'D-EMP-004' AND d::date IN ('2026-05-15', '2026-05-18') THEN 'paid_leave'
    ELSE 'present'
  END,
  'Seeded demo attendance for May 2026'
FROM employees e
CROSS JOIN generate_series('2026-05-01'::date, '2026-05-31'::date, '1 day'::interval) d
ON CONFLICT (employee_id, work_date) DO UPDATE SET
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;
