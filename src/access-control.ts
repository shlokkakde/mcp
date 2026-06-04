import type { Actor, Company } from "./auth.js";
import { queryRows } from "./db.js";

export type ManagerAccessPolicy = {
  actor_id: string;
  actor_name: string;
  team_code: string;
  active: boolean;
  can_view_clients: boolean;
  can_view_contract_values: boolean;
  can_view_tasks: boolean;
  can_write_tasks: boolean;
  can_view_attendance: boolean;
  can_calculate_salary: boolean;
  updated_by_actor_id: string | null;
  updated_at: string;
};

export type ManagerAccessPatch = Partial<
  Pick<
    ManagerAccessPolicy,
    | "active"
    | "can_view_clients"
    | "can_view_contract_values"
    | "can_view_tasks"
    | "can_write_tasks"
    | "can_view_attendance"
    | "can_calculate_salary"
  >
>;

export const defaultManagerPolicy: Omit<ManagerAccessPolicy, "actor_id" | "actor_name" | "team_code" | "updated_by_actor_id" | "updated_at"> = {
  active: true,
  can_view_clients: true,
  can_view_contract_values: false,
  can_view_tasks: true,
  can_write_tasks: true,
  can_view_attendance: true,
  can_calculate_salary: true
};

export async function loadManagerPolicy(company: Company, actorId: string): Promise<ManagerAccessPolicy | null> {
  const rows = await queryRows<ManagerAccessPolicy>(
    company,
    `
      SELECT
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
        updated_by_actor_id,
        updated_at::text
      FROM manager_access_policies
      WHERE actor_id = $1
      LIMIT 1
    `,
    [actorId]
  );
  return rows[0] || null;
}

export async function listManagerPolicies(company: Company): Promise<ManagerAccessPolicy[]> {
  return queryRows<ManagerAccessPolicy>(
    company,
    `
      SELECT
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
        updated_by_actor_id,
        updated_at::text
      FROM manager_access_policies
      ORDER BY team_code, actor_name
    `
  );
}

export async function updateManagerPolicy(
  company: Company,
  actor: Actor,
  managerActorId: string,
  patch: ManagerAccessPatch
): Promise<ManagerAccessPolicy> {
  const current = await loadManagerPolicy(company, managerActorId);
  if (!current) {
    throw new Error(`No manager access policy found for ${managerActorId} in ${company}.`);
  }

  const next = {
    active: patch.active ?? current.active,
    can_view_clients: patch.can_view_clients ?? current.can_view_clients,
    can_view_contract_values: patch.can_view_contract_values ?? current.can_view_contract_values,
    can_view_tasks: patch.can_view_tasks ?? current.can_view_tasks,
    can_write_tasks: patch.can_write_tasks ?? current.can_write_tasks,
    can_view_attendance: patch.can_view_attendance ?? current.can_view_attendance,
    can_calculate_salary: patch.can_calculate_salary ?? current.can_calculate_salary
  };

  const rows = await queryRows<ManagerAccessPolicy>(
    company,
    `
      UPDATE manager_access_policies
      SET
        active = $2,
        can_view_clients = $3,
        can_view_contract_values = $4,
        can_view_tasks = $5,
        can_write_tasks = $6,
        can_view_attendance = $7,
        can_calculate_salary = $8,
        updated_by_actor_id = $9,
        updated_at = now()
      WHERE actor_id = $1
      RETURNING
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
        updated_by_actor_id,
        updated_at::text
    `,
    [
      managerActorId,
      next.active,
      next.can_view_clients,
      next.can_view_contract_values,
      next.can_view_tasks,
      next.can_write_tasks,
      next.can_view_attendance,
      next.can_calculate_salary,
      actor.id
    ]
  );

  return rows[0];
}

export function assertManagerCan(actor: Actor, capability: keyof ManagerAccessPatch): void {
  if (actor.role !== "manager") {
    return;
  }
  if (!actor.managerPolicy) {
    throw new Error(`${actor.name} has no active manager access policy.`);
  }
  if (!actor.managerPolicy.active) {
    throw new Error(`${actor.name}'s manager access has been revoked by a CEO.`);
  }
  if (!actor.managerPolicy[capability]) {
    throw new Error(`${actor.name} is currently restricted from this capability: ${capability}.`);
  }
}

export function sanitizeClientRows<T extends { contract_value?: string }>(actor: Actor, rows: T[]): T[] {
  if (actor.role !== "manager" || actor.managerPolicy?.can_view_contract_values) {
    return rows;
  }
  return rows.map((row) => ({ ...row, contract_value: "[restricted]" }));
}

export async function assertManagerLoginAllowed(actor: Actor): Promise<void> {
  if (actor.role !== "manager") {
    return;
  }
  if (!actor.company) {
    throw new Error(`${actor.name} is missing a company scope.`);
  }
  const policy = await loadManagerPolicy(actor.company, actor.id);
  if (!policy || !policy.active) {
    throw new Error(`${actor.name}'s access is currently revoked.`);
  }
}
