import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

import { loadManagerPolicy } from "./access-control.js";
import { getActorById, getCurrentActor, type Actor } from "./auth.js";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export async function actorFromAuthInfo(authInfo?: AuthInfo): Promise<Actor> {
  const actorId = authInfo?.extra?.actorId;
  const actor = typeof actorId === "string" ? getActorById(actorId) : getCurrentActor();

  if (actor.role === "manager") {
    if (!actor.company) {
      throw new Error(`${actor.name} is missing a company scope.`);
    }
    const policy = await loadManagerPolicy(actor.company, actor.id);
    if (!policy) {
      throw new Error(`${actor.name} has no manager access policy.`);
    }
    actor.managerPolicy = policy;
  }

  return actor;
}

export async function actorFromToolExtra(extra?: ToolExtra): Promise<Actor> {
  return actorFromAuthInfo(extra?.authInfo);
}
