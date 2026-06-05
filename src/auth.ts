import "./config.js";

import { demoActorSwitchEnabled } from "./config.js";
import type { ManagerAccessPolicy } from "./access-control.js";

export const companies = ["deep", "poojan"] as const;
export type Company = (typeof companies)[number];
export type ActorRole = "ceo" | "manager";

export type Actor = {
  id: string;
  name: string;
  role: ActorRole;
  companies: Company[];
  company?: Company;
  teamCode?: string;
  managerPolicy?: ManagerAccessPolicy;
};

const actorDirectory: Record<string, Actor> = {
  deep_ceo: {
    id: "deep_ceo",
    name: "CEO Deep",
    role: "ceo",
    companies: ["deep", "poojan"]
  },
  poojan_ceo: {
    id: "poojan_ceo",
    name: "CEO Poojan",
    role: "ceo",
    companies: ["deep", "poojan"]
  },
  deep_manager_1: {
    id: "deep_manager_1",
    name: "Deep manager 1",
    role: "manager",
    companies: ["deep"],
    company: "deep",
    teamCode: "D-SALES"
  },
  deep_manager_2: {
    id: "deep_manager_2",
    name: "Deep manager 2",
    role: "manager",
    companies: ["deep"],
    company: "deep",
    teamCode: "D-SUPPORT"
  },
  poojan_manager_1: {
    id: "poojan_manager_1",
    name: "Poojan manager 1",
    role: "manager",
    companies: ["poojan"],
    company: "poojan",
    teamCode: "P-GROWTH"
  },
  poojan_manager_2: {
    id: "poojan_manager_2",
    name: "Poojan manager 2",
    role: "manager",
    companies: ["poojan"],
    company: "poojan",
    teamCode: "P-DELIVERY"
  }
};

let currentActorId = process.env.MCP_ACTOR_ID || "deep_ceo";

export function getActorById(actorId: string): Actor {
  const actor = actorDirectory[actorId];
  if (!actor) {
    throw new Error(`Unknown actor "${actorId}". Use one of: ${Object.keys(actorDirectory).join(", ")}.`);
  }
  return { ...actor };
}

export function getCurrentActor(): Actor {
  return getActorById(currentActorId);
}

export function listDemoActors(): Array<Pick<Actor, "id" | "name" | "role" | "companies" | "teamCode">> {
  return Object.values(actorDirectory).map((actor) => ({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    companies: actor.companies,
    teamCode: actor.teamCode
  }));
}

export function switchDemoActor(actorId: string): Actor {
  if (!demoActorSwitchEnabled()) {
    throw new Error("Demo actor switching is disabled. Set MCP_ALLOW_DEMO_ACTOR_SWITCH=true only for demos.");
  }
  if (!actorDirectory[actorId]) {
    throw new Error(`Unknown actor_id "${actorId}".`);
  }
  currentActorId = actorId;
  return getCurrentActor();
}

export function assertCompanyAccess(actor: Actor, company: Company): void {
  if (!actor.companies.includes(company)) {
    throw new Error(`${actor.name} cannot access the ${company} CRM database.`);
  }
}

export function assertCeo(actor: Actor): void {
  if (actor.role !== "ceo") {
    throw new Error("This operation is CEO-only.");
  }
}

export function resolveCompanies(actor: Actor, requestedCompany?: Company): Company[] {
  if (requestedCompany) {
    assertCompanyAccess(actor, requestedCompany);
    return [requestedCompany];
  }

  if (actor.role === "manager") {
    if (!actor.company) {
      throw new Error(`Manager actor ${actor.id} is missing a company scope.`);
    }
    return [actor.company];
  }

  return [...actor.companies];
}

export function scopedTeamCode(actor: Actor, company: Company): string | null {
  assertCompanyAccess(actor, company);

  if (actor.role !== "manager") {
    return null;
  }
  if (actor.managerPolicy && !actor.managerPolicy.active) {
    throw new Error(`${actor.name}'s manager access has been revoked by a CEO.`);
  }
  if (actor.company !== company || !actor.teamCode) {
    throw new Error(`${actor.name} cannot access team data in the ${company} CRM database.`);
  }
  if (actor.managerPolicy && actor.managerPolicy.team_code !== actor.teamCode) {
    throw new Error(
      `${actor.name}'s access policy team ${actor.managerPolicy.team_code} does not match actor team ${actor.teamCode}.`
    );
  }
  return actor.teamCode;
}

export function inferCompanyFromCode(code?: string): Company | undefined {
  if (!code) {
    return undefined;
  }
  if (code.startsWith("D-")) {
    return "deep";
  }
  if (code.startsWith("P-")) {
    return "poojan";
  }
  return undefined;
}

export function chooseRequestedCompany(
  explicitCompany: Company | undefined,
  ...codes: Array<string | undefined>
): Company | undefined {
  const inferred = codes
    .map((code) => inferCompanyFromCode(code))
    .filter((company): company is Company => Boolean(company));
  const unique = [...new Set(inferred)];

  if (unique.length > 1) {
    throw new Error(`Input codes point to different companies: ${unique.join(", ")}.`);
  }
  if (explicitCompany && unique[0] && explicitCompany !== unique[0]) {
    throw new Error(`company="${explicitCompany}" conflicts with input code prefix for ${unique[0]}.`);
  }

  return explicitCompany || unique[0];
}
