INSERT INTO teams (team_code, name)
VALUES
  ('P-GROWTH', 'Poojan CRM Growth'),
  ('P-DELIVERY', 'Poojan CRM Delivery')
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
  ('poojan_growth_manager', 'Poojan Growth Manager', 'P-GROWTH', true, true, false, true, true, true, true, 'seed'),
  ('poojan_delivery_manager', 'Poojan Delivery Manager', 'P-DELIVERY', true, true, false, true, true, true, true, 'seed')
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
  ('P-EMP-001', 'Rohan Patel', 'rohan@poojan.example', 'Growth Manager Associate', (SELECT id FROM teams WHERE team_code = 'P-GROWTH'), true),
  ('P-EMP-002', 'Kavya Menon', 'kavya@poojan.example', 'Client Success Executive', (SELECT id FROM teams WHERE team_code = 'P-GROWTH'), true),
  ('P-EMP-003', 'Siddh Malhotra', 'siddh@poojan.example', 'Delivery Coordinator', (SELECT id FROM teams WHERE team_code = 'P-DELIVERY'), true),
  ('P-EMP-004', 'Ananya Iyer', 'ananya@poojan.example', 'Project Delivery Lead', (SELECT id FROM teams WHERE team_code = 'P-DELIVERY'), true)
ON CONFLICT (employee_code) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  job_title = EXCLUDED.job_title,
  team_id = EXCLUDED.team_id,
  active = EXCLUDED.active;

INSERT INTO clients (client_code, name, industry, contact_name, contact_email, status, priority, contract_value, next_touch_date, team_id, notes)
VALUES
  ('P-CLI-001', 'Nova Health Labs', 'Healthcare', 'Dr. Aditi Shah', 'aditi@novahealth.example', 'active', 'critical', 850000.00, '2026-06-06', (SELECT id FROM teams WHERE team_code = 'P-GROWTH'), 'Large upsell candidate for diagnostics workflow.'),
  ('P-CLI-002', 'UrbanNest Realty', 'Real Estate', 'Vikram Bansal', 'vikram@urbannest.example', 'active', 'high', 490000.00, '2026-06-09', (SELECT id FROM teams WHERE team_code = 'P-GROWTH'), 'Needs campaign analytics before board review.'),
  ('P-CLI-003', 'Skyline Events', 'Events', 'Nisha Arora', 'nisha@skyline.example', 'at_risk', 'high', 310000.00, '2026-06-04', (SELECT id FROM teams WHERE team_code = 'P-DELIVERY'), 'Delayed rollout caused satisfaction risk.'),
  ('P-CLI-004', 'FinEdge Capital', 'Finance', 'Arman Gill', 'arman@finedge.example', 'lead', 'medium', 230000.00, '2026-06-13', (SELECT id FROM teams WHERE team_code = 'P-DELIVERY'), 'Security questionnaire pending.')
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
  ('P-TASK-001', (SELECT id FROM clients WHERE client_code = 'P-CLI-001'), 'Nova Health upsell analysis', 'Summarize adoption metrics and identify three upsell hooks.', (SELECT id FROM employees WHERE employee_code = 'P-EMP-001'), 'poojan_growth_manager', 'completed', 'critical', '2026-05-17', '2026-05-16 10:15:00+00', 'Shared upsell analysis with CEO Poojan.'),
  ('P-TASK-002', (SELECT id FROM clients WHERE client_code = 'P-CLI-002'), 'UrbanNest campaign report', 'Prepare channel-level campaign report and client talking points.', (SELECT id FROM employees WHERE employee_code = 'P-EMP-002'), 'poojan_growth_manager', 'in_progress', 'high', '2026-06-09', NULL, NULL),
  ('P-TASK-003', (SELECT id FROM clients WHERE client_code = 'P-CLI-003'), 'Skyline rollout recovery', 'Create revised rollout timeline and send daily update plan.', (SELECT id FROM employees WHERE employee_code = 'P-EMP-003'), 'poojan_delivery_manager', 'blocked', 'high', '2026-06-04', NULL, NULL),
  ('P-TASK-004', (SELECT id FROM clients WHERE client_code = 'P-CLI-004'), 'FinEdge security questionnaire', 'Collect answers for security questionnaire and flag unanswered compliance items.', (SELECT id FROM employees WHERE employee_code = 'P-EMP-004'), 'poojan_delivery_manager', 'todo', 'medium', '2026-06-12', NULL, NULL),
  ('P-TASK-005', (SELECT id FROM clients WHERE client_code = 'P-CLI-003'), 'Skyline sponsor call notes', 'Document sponsor concerns and extract action items from the escalation call.', (SELECT id FROM employees WHERE employee_code = 'P-EMP-004'), 'poojan_delivery_manager', 'completed', 'medium', '2026-05-28', '2026-05-28 12:10:00+00', 'Uploaded notes and action item list.')
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
  ('P-COM-001', (SELECT id FROM client_tasks WHERE task_code = 'P-TASK-003'), 'poojan_delivery_manager', 'Waiting on Skyline IT for final rollout window.'),
  ('P-COM-002', (SELECT id FROM client_tasks WHERE task_code = 'P-TASK-001'), 'poojan_growth_manager', 'Nova Health liked the diagnostics workflow proposal.')
ON CONFLICT (comment_code) DO UPDATE SET
  task_id = EXCLUDED.task_id,
  author_actor_id = EXCLUDED.author_actor_id,
  body = EXCLUDED.body;

INSERT INTO payroll (employee_id, monthly_salary, bank_account_last4, tax_id_last4, effective_from, internal_notes)
VALUES
  ((SELECT id FROM employees WHERE employee_code = 'P-EMP-001'), 88000.00, '5551', '1240', '2026-01-01', 'CEO-only payroll record.'),
  ((SELECT id FROM employees WHERE employee_code = 'P-EMP-002'), 74000.00, '9012', '7750', '2026-01-01', 'CEO-only payroll record.'),
  ((SELECT id FROM employees WHERE employee_code = 'P-EMP-003'), 70000.00, '3321', '6088', '2026-01-01', 'CEO-only payroll record.'),
  ((SELECT id FROM employees WHERE employee_code = 'P-EMP-004'), 82000.00, '1477', '4533', '2026-01-01', 'CEO-only payroll record.')
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
    WHEN e.employee_code = 'P-EMP-001' AND d::date IN ('2026-05-06', '2026-05-07') THEN 'paid_leave'
    WHEN e.employee_code = 'P-EMP-001' AND d::date = '2026-05-25' THEN 'absent'
    WHEN e.employee_code = 'P-EMP-002' AND d::date = '2026-05-18' THEN 'unpaid_leave'
    WHEN e.employee_code = 'P-EMP-002' AND d::date = '2026-05-29' THEN 'paid_leave'
    WHEN e.employee_code = 'P-EMP-003' AND d::date IN ('2026-05-14', '2026-05-15') THEN 'unpaid_leave'
    WHEN e.employee_code = 'P-EMP-004' AND d::date = '2026-05-11' THEN 'paid_leave'
    WHEN e.employee_code = 'P-EMP-004' AND d::date = '2026-05-27' THEN 'absent'
    ELSE 'present'
  END,
  'Seeded demo attendance for May 2026'
FROM employees e
CROSS JOIN generate_series('2026-05-01'::date, '2026-05-31'::date, '1 day'::interval) d
ON CONFLICT (employee_id, work_date) DO UPDATE SET
  status = EXCLUDED.status,
  notes = EXCLUDED.notes;
