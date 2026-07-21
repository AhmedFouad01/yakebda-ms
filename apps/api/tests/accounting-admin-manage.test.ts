import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { claimFinancialEvents } from "../src/modules/financialOutbox";
import { postClaimedFinancialEvent } from "../src/modules/accountingLedger";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let viewerToken = "";
let accountId = "";
let branchId = "";
let locationId = "";
let unitId = "";
let itemSequence = 0;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function insertEvent(status: string, lastError?: string) {
  const id = newId();
  await db("financial_events").insert({
    id,
    account_id: accountId,
    branch_id: branchId,
    source_type: "test_source",
    source_id: newId(),
    event_type: "cash.movement",
    status,
    last_error: lastError ?? null,
    idempotency_key: `admin-manage:${id}`,
    payload: "{}",
  });
  return id;
}

async function insertBalancedEntry(entryDate: string, description: string) {
  const [debitAccount, creditAccount] = await Promise.all([
    db("accounting_accounts").where({ account_id: accountId, system_key: "cash" }).first(),
    db("accounting_accounts").where({ account_id: accountId, system_key: "sales_revenue" }).first(),
  ]);
  const entryId = newId();
  await db.transaction(async (trx) => {
    await trx("journal_entries").insert({
      id: entryId,
      account_id: accountId,
      branch_id: null,
      event_type: "test.manual",
      source_type: "test_manual",
      source_id: newId(),
      entry_date: entryDate,
      description,
      meta: "{}",
    });
    await trx("journal_lines").insert([
      { id: newId(), account_id: accountId, entry_id: entryId, accounting_account_id: debitAccount.id, component: "debit", debit: 25, credit: 0 },
      { id: newId(), account_id: accountId, entry_id: entryId, accounting_account_id: creditAccount.id, component: "credit", debit: 0, credit: 25 },
    ]);
  });
  return entryId;
}

async function lastAudit(action: string) {
  const row = await db("audit_logs").where({ account_id: accountId, action }).orderBy("created_at", "desc").first();
  if (!row) return row;
  return { ...row, meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta };
}

async function processPending() {
  const workerId = `admin-manage-${Date.now()}-${Math.random()}`;
  const claimed = await claimFinancialEvents(db, { workerId, limit: 100, accountId });
  for (const event of claimed) {
    await postClaimedFinancialEvent(db, { eventId: event.id, workerId });
  }
}

async function createSubCentReceipt(unitCost: string, key: string) {
  itemSequence += 1;
  const item = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({
    name_ar: `صنف إدارة الحسابات ${itemSequence}`,
    sku: `ACC-MANAGE-${itemSequence}`,
    base_unit_id: unitId,
    reorder_level: "0",
  });
  expect(item.status).toBe(201);
  const receipt = await request(app).post("/api/v1/inventory/movements").set(auth(ownerToken)).send({
    location_id: locationId,
    item_id: item.body.data.id,
    movement_type: "receipt",
    quantity: "1",
    unit_cost: unitCost,
    source_type: "acc_manage_test",
    idempotency_key: key,
  });
  expect(receipt.status).toBe(201);
  return receipt.body.data.id as string;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  app = createApp(db);

  const ownerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = ownerLogin.body.token;

  const roleId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: "acc_view_only_manage_test", name_ar: "عرض فقط", is_system: false });
  await db("role_permissions").insert({ role_id: roleId, permission_key: "accounting.view" });
  const userId = newId();
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: null,
    name: "عرض فقط",
    email: "acc-view-manage@ykms.local",
    password_hash: bcrypt.hashSync("Test@12345", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const viewerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "acc-view-manage@ykms.local", password: "Test@12345" });
  viewerToken = viewerLogin.body.token;

  const locations = await request(app).get("/api/v1/inventory/locations").set(auth(ownerToken));
  locationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
});

afterAll(async () => {
  await db.destroy();
});

describe("financial event retry", () => {
  it("retries a failed event, writes audit, and rejects an immediate second retry", async () => {
    const eventId = await insertEvent("failed", "mapping missing");
    const retry = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventId}/retry`)
      .set(auth(ownerToken));
    expect(retry.status).toBe(200);
    expect(retry.body.data.status).toBe("pending");
    expect(retry.body.data.claimed_by).toBeNull();

    const audit = await lastAudit("accounting.event.retry");
    expect(audit).toBeTruthy();
    expect(audit.entity_type).toBe("financial_event");
    expect(audit.entity_id).toBe(eventId);
    expect(audit.meta.previous_status).toBe("failed");

    const again = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventId}/retry`)
      .set(auth(ownerToken));
    expect(again.status).toBe(409);
  });

  it("rejects retry on a posted event and requires accounting.manage", async () => {
    const postedId = await insertEvent("posted");
    const posted = await request(app)
      .post(`/api/v1/accounting/financial-events/${postedId}/retry`)
      .set(auth(ownerToken));
    expect(posted.status).toBe(409);

    const deadId = await insertEvent("dead", "gave up");
    const forbidden = await request(app)
      .post(`/api/v1/accounting/financial-events/${deadId}/retry`)
      .set(auth(viewerToken));
    expect(forbidden.status).toBe(403);
  });
});

describe("financial event mark-dead", () => {
  it("requires a reason", async () => {
    const eventId = await insertEvent("failed", "boom");
    const noReason = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventId}/mark-dead`)
      .set(auth(ownerToken))
      .send({});
    expect(noReason.status).toBe(422);
    const shortReason = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventId}/mark-dead`)
      .set(auth(ownerToken))
      .send({ reason: "لا" });
    expect(shortReason.status).toBe(422);
  });

  it("marks a failed event dead with reason and audit, then rejects repeating it", async () => {
    const eventId = await insertEvent("failed", "boom");
    const marked = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventId}/mark-dead`)
      .set(auth(ownerToken))
      .send({ reason: "حدث تالف لا يمكن ترحيله" });
    expect(marked.status).toBe(200);
    expect(marked.body.data.status).toBe("dead");
    expect(marked.body.data.last_error).toBe("حدث تالف لا يمكن ترحيله");

    const audit = await lastAudit("accounting.event.mark_dead");
    expect(audit.entity_id).toBe(eventId);
    expect(audit.meta).toMatchObject({ previous_status: "failed", reason: "حدث تالف لا يمكن ترحيله" });

    const again = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventId}/mark-dead`)
      .set(auth(ownerToken))
      .send({ reason: "سبب آخر" });
    expect(again.status).toBe(409);
  });

  it("rejects mark-dead on posted events and without accounting.manage", async () => {
    const postedId = await insertEvent("posted");
    const posted = await request(app)
      .post(`/api/v1/accounting/financial-events/${postedId}/mark-dead`)
      .set(auth(ownerToken))
      .send({ reason: "سبب كافٍ" });
    expect(posted.status).toBe(409);

    const pendingId = await insertEvent("pending");
    const forbidden = await request(app)
      .post(`/api/v1/accounting/financial-events/${pendingId}/mark-dead`)
      .set(auth(viewerToken))
      .send({ reason: "سبب كافٍ" });
    expect(forbidden.status).toBe(403);
  });
});

describe("journal reversal guards", () => {
  it("reverses with swapped balanced lines linked to the original, idempotently", async () => {
    const entryId = await insertBalancedEntry("2026-07-05", "قيد للعكس");
    const reversal = await request(app)
      .post(`/api/v1/accounting/journals/${entryId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "تصحيح قيد" });
    expect(reversal.status).toBe(201);
    expect(reversal.body.data.reversal_of_entry_id).toBe(entryId);

    const lines = await db("journal_lines").where({ entry_id: reversal.body.data.id });
    expect(lines).toHaveLength(2);
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(totalDebit).toBe(25);
    expect(totalCredit).toBe(25);
    const originalLines = await db("journal_lines").where({ entry_id: entryId });
    for (const original of originalLines) {
      const mirrored = lines.find((line) => line.accounting_account_id === original.accounting_account_id);
      expect(mirrored).toBeTruthy();
      expect(Number(mirrored!.debit)).toBe(Number(original.credit));
      expect(Number(mirrored!.credit)).toBe(Number(original.debit));
    }

    const second = await request(app)
      .post(`/api/v1/accounting/journals/${entryId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "محاولة عكس ثانية" });
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(reversal.body.data.id);
  });

  it("rejects reversing a reversal entry", async () => {
    const entryId = await insertBalancedEntry("2026-07-06", "قيد للعكس المزدوج");
    const reversal = await request(app)
      .post(`/api/v1/accounting/journals/${entryId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "تصحيح" });
    expect(reversal.status).toBe(201);

    const reverseReversal = await request(app)
      .post(`/api/v1/accounting/journals/${reversal.body.data.id}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "عكس العكس" });
    expect(reverseReversal.status).toBe(422);
  });

  it("rejects a reversal dated inside a locked period with an Arabic 409", async () => {
    const entryId = await insertBalancedEntry("2026-05-15", "قيد داخل فترة ستقفل");
    const lock = await request(app)
      .post("/api/v1/accounting/periods/lock")
      .set(auth(ownerToken))
      .send({ starts_on: "2026-05-01", ends_on: "2026-05-31" });
    expect(lock.status).toBe(201);

    const rejected = await request(app)
      .post(`/api/v1/accounting/journals/${entryId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "عكس داخل فترة مقفولة", entry_date: "2026-05-20" });
    expect(rejected.status).toBe(409);
  });
});

describe("residual guard and settlement errors surface as Arabic API errors", () => {
  it("keeps the DB trigger as arbiter and returns Arabic errors through the close path", async () => {
    await createSubCentReceipt("0.004", "acc-manage-residual-1");
    await processPending();
    const openResidual = await db("financial_event_reconciliations")
      .where({ account_id: accountId, status: "open" })
      .first();
    expect(openResidual).toBeTruthy();
    const entryDate = String(openResidual.entry_date).slice(0, 10);

    // Defense-in-depth: a raw lock UPDATE that bypasses the API settlement
    // path is still rejected by the accounting_period_open_residuals trigger.
    const rawPeriodId = newId();
    await db("accounting_periods").insert({
      id: rawPeriodId,
      account_id: accountId,
      starts_on: entryDate,
      ends_on: entryDate,
      status: "open",
    });
    await expect(
      db("accounting_periods").where({ id: rawPeriodId }).update({ status: "locked" })
    ).rejects.toMatchObject({ constraint: "accounting_period_open_residuals" });

    // Through the API (type A): when settlement cannot run the close fails
    // with an Arabic 422 and nothing locks; with the mapping restored the
    // close settles automatically and locks.
    await db("accounting_mappings").where({ account_id: accountId, event_type: "residual.settlement" }).delete();
    const blocked = await request(app)
      .post("/api/v1/accounting/periods/lock")
      .set(auth(ownerToken))
      .send({ starts_on: entryDate, ends_on: entryDate });
    expect(blocked.status).toBe(422);
    expect(JSON.stringify(blocked.body)).toContain("التقريب");
    expect(blocked.body.request_id).toBeUndefined();
    const notLocked = await db("accounting_periods").where({ id: rawPeriodId }).first();
    expect(notLocked.status).toBe("open");

    const inventoryId = (await db("accounting_accounts").where({ account_id: accountId, system_key: "inventory" }).first()).id;
    const roundingId = (await db("accounting_accounts").where({ account_id: accountId, system_key: "rounding" }).first()).id;
    await db("accounting_mappings").insert({
      id: newId(),
      account_id: accountId,
      event_type: "residual.settlement",
      dimension_key: "default",
      debit_account_id: inventoryId,
      credit_account_id: roundingId,
      vat_account_id: null,
    });
    const locked = await request(app)
      .post("/api/v1/accounting/periods/lock")
      .set(auth(ownerToken))
      .send({ starts_on: entryDate, ends_on: entryDate });
    expect(locked.status).toBe(201);
    expect(locked.body.settlement.settled_count).toBeGreaterThan(0);
    expect(
      await db("financial_event_reconciliations").where({ account_id: accountId, status: "open" })
    ).toHaveLength(0);
  });
});
