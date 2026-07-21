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
let branch2Id = "";
let locationId = "";
let location2Id = "";
let unitId = "";
let itemSequence = 0;
let inventoryAccountId = "";
let roundingAccountId = "";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createBackdatedResidualReceipt(unitCost: string, isoDate: string, location = locationId) {
  itemSequence += 1;
  const item = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({
    name_ar: `صنف تسوية ${itemSequence}`,
    sku: `ACC-SETTLE-${itemSequence}`,
    base_unit_id: unitId,
    reorder_level: "0",
  });
  expect(item.status).toBe(201);
  const receipt = await request(app).post("/api/v1/inventory/movements").set(auth(ownerToken)).send({
    location_id: location,
    item_id: item.body.data.id,
    movement_type: "receipt",
    quantity: "1",
    unit_cost: unitCost,
    source_type: "acc_settle_test",
    idempotency_key: `acc-settle-${itemSequence}`,
  });
  expect(receipt.status).toBe(201);
  const movementId = receipt.body.data.id as string;
  // Backdate the pending event so its reconciliation lands in the target
  // period (entry_date is derived from the event's created_at at posting).
  await db("financial_events")
    .where({ account_id: accountId, source_type: "stock_movement", source_id: movementId })
    .update({ created_at: `${isoDate}T10:00:00.000Z` });
  return movementId;
}

async function processPending() {
  const workerId = `settle-${Date.now()}-${Math.random()}`;
  const claimed = await claimFinancialEvents(db, { workerId, limit: 100, accountId });
  for (const event of claimed) {
    await postClaimedFinancialEvent(db, { eventId: event.id, workerId });
  }
}

async function deleteSettlementMapping() {
  await db("accounting_mappings")
    .where({ account_id: accountId, event_type: "residual.settlement", dimension_key: "default" })
    .delete();
}

async function restoreSettlementMapping() {
  const response = await request(app).post("/api/v1/accounting/mappings").set(auth(ownerToken)).send({
    event_type: "residual.settlement",
    dimension_key: "default",
    debit_account_id: inventoryAccountId,
    credit_account_id: roundingAccountId,
  });
  expect(response.status).toBe(201);
}

async function openReconciliations(from: string, to: string) {
  return db("financial_event_reconciliations")
    .where({ account_id: accountId, status: "open" })
    .where("entry_date", ">=", from)
    .where("entry_date", "<=", to);
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
  app = createApp(db);

  const ownerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = ownerLogin.body.token;

  const roleId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: "acc_viewer_cp4", name_ar: "عرض", is_system: false });
  await db("role_permissions").insert({ role_id: roleId, permission_key: "accounting.view" });
  const userId = newId();
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: null,
    name: "عرض",
    email: "acc-viewer-cp4@ykms.local",
    password_hash: bcrypt.hashSync("Test@12345", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const viewerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "acc-viewer-cp4@ykms.local", password: "Test@12345" });
  viewerToken = viewerLogin.body.token;

  const locations = await request(app).get("/api/v1/inventory/locations").set(auth(ownerToken));
  locationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  location2Id = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branch2Id).id;
  unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
  inventoryAccountId = (await db("accounting_accounts").where({ account_id: accountId, system_key: "inventory" }).first()).id;
  roundingAccountId = (await db("accounting_accounts").where({ account_id: accountId, system_key: "rounding" }).first()).id;
});

afterAll(async () => {
  await db.destroy();
});

describe("residuals ledger", () => {
  it("exposes the source = journal + residual equation per item with aggregates", async () => {
    for (let i = 0; i < 3; i += 1) {
      await createBackdatedResidualReceipt("0.004", "2026-06-10");
    }
    await processPending();

    const response = await request(app)
      .get("/api/v1/accounting/reconciliation/residuals?date_from=2026-06-01&date_to=2026-06-30")
      .set(auth(viewerToken));
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(3);
    for (const item of response.body.data.items) {
      expect(item.source_amount).toBe("0.0040");
      expect(item.journal_amount).toBe("0.00");
      expect(item.residual_amount).toBe("0.0040");
      expect(item.status).toBe("open");
    }
    expect(response.body.data.total_open).toBe("0.0120");
    const summary = response.body.data.summary.find((row: { branch_id: string }) => row.branch_id === branchId);
    expect(Number(summary.open_count)).toBe(3);
    expect(summary.open_total).toBe("0.0120");
  });
});

describe("standalone settlement", () => {
  it("settles June residuals into one balanced rounding journal, idempotently", async () => {
    const settle = await request(app).post("/api/v1/accounting/reconciliation/settle").set(auth(ownerToken)).send({
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      entry_date: "2026-06-30",
      idempotency_key: "settle-june-1",
    });
    expect(settle.status).toBe(201);
    expect(settle.body.data.settled_count).toBe(3);
    expect(settle.body.data.total_residual).toBe("0.0120");
    expect(settle.body.data.journal_entries).toHaveLength(1);
    const entry = settle.body.data.journal_entries[0];
    expect(entry.amount).toBe("0.01");
    expect(entry.branch_id).toBe(branchId);

    // Every settled row links back to the settlement journal; the open sum is
    // exactly zero afterwards (source = journal + residual preserved per row).
    expect(await openReconciliations("2026-06-01", "2026-06-30")).toHaveLength(0);
    const settled = await db("financial_event_reconciliations")
      .where({ account_id: accountId, settlement_journal_id: entry.id, status: "settled" });
    expect(settled).toHaveLength(3);
    const deferredLeft = await db("financial_events")
      .where({ account_id: accountId, status: "deferred_rounding" })
      .whereIn("id", settled.map((row) => row.financial_event_id));
    expect(deferredLeft).toHaveLength(0);

    const lines = await db("journal_lines").where({ entry_id: entry.id });
    expect(lines).toHaveLength(2);
    const creditLine = lines.find((line) => Number(line.credit) > 0);
    expect(creditLine!.accounting_account_id).toBe(roundingAccountId); // positive residual credits rounding

    const replay = await request(app).post("/api/v1/accounting/reconciliation/settle").set(auth(ownerToken)).send({
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      entry_date: "2026-06-30",
      idempotency_key: "settle-june-1",
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.settled_count).toBe(0);
    expect(replay.body.data.journal_entries[0].id).toBe(entry.id);

    const audit = await db("audit_logs").where({ account_id: accountId, action: "accounting.reconciliation.settle" }).first();
    expect(audit).toBeTruthy();

    const forbidden = await request(app)
      .post("/api/v1/accounting/reconciliation/settle")
      .set(auth(viewerToken))
      .send({ entry_date: "2026-06-30" });
    expect(forbidden.status).toBe(403);
  });

  it("reports the settlement in a balanced trial balance with a residual line", async () => {
    const response = await request(app)
      .get(`/api/v1/accounting/trial-balance?branch_id=${branchId}&date_from=2026-06-01&through=2026-06-30`)
      .set(auth(ownerToken));
    expect(response.status).toBe(200);
    expect(response.body.totals.debit).toBe("0.01");
    expect(response.body.totals.credit).toBe("0.01");
    expect(response.body.balanced).toBe(true);
    expect(response.body.residual_balance).toBe("0.0000");
    const rounding = response.body.data.find((row: { code: string }) => row.code === "4090");
    expect(rounding.credit).toBe("0.01");
    expect(rounding.debit).toBe("0.00");
  });
});

describe("atomic period lock (settlement -> zero-check -> lock)", () => {
  it("rolls back the whole lock when settlement cannot run, then locks with auto-settlement", async () => {
    await createBackdatedResidualReceipt("0.004", "2026-04-10");
    await createBackdatedResidualReceipt("0.004", "2026-04-12");
    await processPending();
    expect(await openReconciliations("2026-04-01", "2026-04-30")).toHaveLength(2);

    await deleteSettlementMapping();
    const blocked = await request(app).post("/api/v1/accounting/periods/lock").set(auth(ownerToken)).send({
      starts_on: "2026-04-01",
      ends_on: "2026-04-30",
    });
    expect(blocked.status).toBe(422);
    expect(JSON.stringify(blocked.body)).toContain("التقريب");
    // Full rollback: no period row, no settlement journal, residuals untouched.
    const period = await db("accounting_periods").where({ account_id: accountId, starts_on: "2026-04-01" }).first();
    expect(period).toBeUndefined();
    const entries = await db("journal_entries")
      .where({ account_id: accountId, event_type: "residual.settlement", entry_date: "2026-04-30" });
    expect(entries).toHaveLength(0);
    expect(await openReconciliations("2026-04-01", "2026-04-30")).toHaveLength(2);

    await restoreSettlementMapping();
    const locked = await request(app).post("/api/v1/accounting/periods/lock").set(auth(ownerToken)).send({
      starts_on: "2026-04-01",
      ends_on: "2026-04-30",
    });
    expect(locked.status).toBe(201);
    expect(locked.body.data.status).toBe("locked");
    expect(locked.body.settlement.settled_count).toBe(2);
    expect(locked.body.settlement.journal_entries).toHaveLength(1);
    const settlementEntry = await db("journal_entries").where({ id: locked.body.settlement.journal_entries[0].id }).first();
    expect(settlementEntry.entry_date).toBe("2026-04-30"); // recognized at close date
    expect(await openReconciliations("2026-04-01", "2026-04-30")).toHaveLength(0);
  });

  it("refuses to reverse a settlement whose residuals lie in a locked period", async () => {
    const settlementEntry = await db("journal_entries")
      .where({ account_id: accountId, event_type: "residual.settlement", entry_date: "2026-04-30" })
      .first();
    const reversal = await request(app)
      .post(`/api/v1/accounting/journals/${settlementEntry.id}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "محاولة عكس تسوية فترة مقفولة", entry_date: "2026-07-01" });
    expect(reversal.status).toBe(409);
  });
});

describe("settlement reversal reopens residuals", () => {
  it("reopens residuals on reversal and refuses re-lock until settled again", async () => {
    await createBackdatedResidualReceipt("0.004", "2026-05-08");
    await createBackdatedResidualReceipt("0.004", "2026-05-09");
    await processPending();

    const settle = await request(app).post("/api/v1/accounting/reconciliation/settle").set(auth(ownerToken)).send({
      date_from: "2026-05-01",
      date_to: "2026-05-31",
      entry_date: "2026-05-31",
      idempotency_key: "settle-may-1",
    });
    expect(settle.status).toBe(201);
    const settlementId = settle.body.data.journal_entries[0].id;
    expect(await openReconciliations("2026-05-01", "2026-05-31")).toHaveLength(0);

    // Reverse the settlement (dated in an open period) — residuals reopen.
    const reversal = await request(app)
      .post(`/api/v1/accounting/journals/${settlementId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "عكس تسوية مايو", entry_date: "2026-06-05" });
    expect(reversal.status).toBe(201);

    const reopened = await openReconciliations("2026-05-01", "2026-05-31");
    expect(reopened).toHaveLength(2);
    for (const row of reopened) expect(row.settlement_journal_id).toBeNull();
    const deferredAgain = await db("financial_events")
      .where({ account_id: accountId, status: "deferred_rounding" })
      .whereIn("id", reopened.map((row) => row.financial_event_id));
    expect(deferredAgain).toHaveLength(2);

    // Re-lock is refused while settlement cannot run — the reopened residual
    // blocks the close until it is settled again.
    await deleteSettlementMapping();
    const blocked = await request(app).post("/api/v1/accounting/periods/lock").set(auth(ownerToken)).send({
      starts_on: "2026-05-01",
      ends_on: "2026-05-31",
    });
    expect(blocked.status).toBe(422);
    const period = await db("accounting_periods").where({ account_id: accountId, starts_on: "2026-05-01" }).first();
    expect(period).toBeUndefined();

    // Settling again (via the lock) closes the period.
    await restoreSettlementMapping();
    const locked = await request(app).post("/api/v1/accounting/periods/lock").set(auth(ownerToken)).send({
      starts_on: "2026-05-01",
      ends_on: "2026-05-31",
    });
    expect(locked.status).toBe(201);
    expect(locked.body.settlement.settled_count).toBe(2);
    expect(await openReconciliations("2026-05-01", "2026-05-31")).toHaveLength(0);
  });
});

describe("per-branch settlement grouping", () => {
  it("posts one journal per branch and absorbs sub-half-cent branch sums", async () => {
    await createBackdatedResidualReceipt("0.004", "2026-02-10");
    await createBackdatedResidualReceipt("0.004", "2026-02-11");
    await createBackdatedResidualReceipt("0.004", "2026-02-12", location2Id);
    await processPending();

    const settle = await request(app).post("/api/v1/accounting/reconciliation/settle").set(auth(ownerToken)).send({
      date_from: "2026-02-01",
      date_to: "2026-02-28",
      entry_date: "2026-02-28",
    });
    expect(settle.status).toBe(201);
    expect(settle.body.data.settled_count).toBe(3);
    expect(settle.body.data.journal_entries).toHaveLength(1);
    expect(settle.body.data.journal_entries[0].branch_id).toBe(branchId);
    expect(settle.body.data.journal_entries[0].amount).toBe("0.01");
    expect(settle.body.data.absorbed_branches).toEqual([branch2Id]);

    // Absorbed branch rows are settled without a journal (deferred precedent).
    const branch2Rows = await db("financial_event_reconciliations")
      .where({ account_id: accountId, branch_id: branch2Id, status: "settled" })
      .where("entry_date", ">=", "2026-02-01")
      .where("entry_date", "<=", "2026-02-28");
    expect(branch2Rows).toHaveLength(1);
    expect(branch2Rows[0].settlement_journal_id).toBeNull();
  });
});

describe("trial balance filters", () => {
  it("filters by period_id and echoes the period", async () => {
    const periodId = newId();
    await db("accounting_periods").insert({
      id: periodId,
      account_id: accountId,
      starts_on: "2026-06-01",
      ends_on: "2026-06-30",
      status: "open",
    });
    const response = await request(app)
      .get(`/api/v1/accounting/trial-balance?period_id=${periodId}`)
      .set(auth(ownerToken));
    expect(response.status).toBe(200);
    expect(response.body.period.id).toBe(periodId);
    expect(response.body.totals.debit).toBe(response.body.totals.credit);
    expect(response.body.balanced).toBe(true);

    const missing = await request(app)
      .get(`/api/v1/accounting/trial-balance?period_id=${newId()}`)
      .set(auth(ownerToken));
    expect(missing.status).toBe(404);
  });
});
