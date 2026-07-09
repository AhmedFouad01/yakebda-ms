import { Knex } from "knex";
import { newId } from "./ids";

export interface AuditEntry {
  accountId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  userId?: string | null;
  apiClientId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/** سجل العمليات Audit Log — FR-014 / NFR-005 */
export async function writeAudit(db: Knex, e: AuditEntry): Promise<void> {
  await db("audit_logs").insert({
    id: newId(),
    account_id: e.accountId ?? null,
    branch_id: e.branchId ?? null,
    device_id: e.deviceId ?? null,
    user_id: e.userId ?? null,
    api_client_id: e.apiClientId ?? null,
    action: e.action,
    entity_type: e.entityType ?? null,
    entity_id: e.entityId ?? null,
    meta: JSON.stringify(e.meta ?? {}),
    ip: e.ip ?? null,
  });
}
