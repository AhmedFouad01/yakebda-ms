import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { claimFinancialEvents } from "../src/modules/financialOutbox";
import { ensureAccountingDefaults, postClaimedFinancialEvent } from "../src/modules/accountingLedger";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let viewerToken = "";
let branchViewerToken = "";
let noPermToken = "";
let accountId = "";
let branchId = "";
let branch2Id = "";
let otherAccountId = "";
let otherEventId = "";
let otherEntryId = "";
let locationId = "";
let unitId = "";

const eventIds: Record<string, string> = {};
let manualEntryJuneMidId = "";
let manualEntryJuneLateId = "";
let junePeriodId = "";
let receiptMovementId = "";
let receiptEventId = "";
let receiptEntryId = "";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createRoleUser(email: string, roleKey: string, permissions: string[], userBranchId: string | null) {
  const roleId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: roleKey, name_ar: roleKey, is_system: false });
  await db("role_permissions").insert(permissions.map((permission) => ({ role_id: roleId, permission_key: permission })));
  const userId = newId();
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: userBranchId,
    name: roleKey,
    email,
    password_hash: bcrypt.hashSync("Test@12345", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: "Test@12345" });
  expect(login.status).toBe(200);
  return login.body.token as string;
}

async function insertEvent(input: {
  key: string;
  branch: string | null;
  eventType: string;
  status: string;
  createdAt: string;
  lastError?: string;
}) {
  const id = newId();
  await db("financial_events").insert({
    id,
    account_id: accountId,
    branch_id: input.branch,
    source_type: "test_source",
    source_id: newId(),
    event_type: input.eventType,
    status: input.status,
    last_error: input.lastError ?? null,
    idempotency_key: `admin-read:${input.key}`,
    payload: "{}",
    created_at: input.createdAt,
  });
  eventIds[input.key] = id;
  return id;
}

async function insertBalancedEntry(targetAccountId: string, entryDate: string, description: string) {
  const [debitAccount, creditAccount] = await Promise.all([
    db("accounting_accounts").where({ account_id: targetAccountId, system_key: "cash" }).first(),
    db("accounting_accounts").where({ account_id: targetAccountId, system_key: "sales_revenue" }).first(),
  ]);
  const entryId = newId();
  await db.transaction(async (trx) => {
    await trx("journal_entries").insert({
      id: entryId,
      account_id: targetAccountId,
      branch_id: null,
      event_type: "test.manual",
      source_type: "test_manual",
      source_id: newId(),
      entry_date: entryDate,
      description,
      meta: "{}",
    });
    await trx("journal_lines").insert([
      { id: newId(), account_id: targetAccountId, entry_id: entryId, accounting_account_id: debitAccount.id, component: "debit", debit: 10, credit: 0 },
      { id: newId(), account_id: targetAccountId, entry_id: entryId, accounting_account_id: creditAccount.id, component: "credit", debit: 0, credit: 10 },
    ]);
  });
  return entryId;
}

async function processPending() {
  const workerId = `admin-read-${Date.now()}-${Math.random()}`;
  const claimed = await claimFinancialEvents(db, { workerId, limit: 100, accountId });
  for (const event of claimed) {
    await postClaimedFinancialEvent(db, { eventId: event.id, workerId });
  }
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

  viewerToken = await createRoleUser("acc-viewer@ykms.local", "acc_viewer_test", ["accounting.view"], null);
  branchViewerToken = await createRoleUser("acc-branch-viewer@ykms.local", "acc_branch_viewer_test", ["accounting.view"], branch2Id);
  noPermToken = await createRoleUser("acc-none@ykms.local", "acc_none_test", ["orders.create"], null);

  // Tenant isolation fixtures: a second account with its own event and journal.
  otherAccountId = newId();
  await db("accounts").insert({ id: otherAccountId, name: "حساب آخر" });
  await ensureAccountingDefaults(db, otherAccountId);
  otherEventId = await (async () => {
    const id = newId();
    await db("financial_events").insert({
      id,
      account_id: otherAccountId,
      branch_id: null,
      source_type: "test_source",
      source_id: newId(),
      event_type: "cash.movement",
      status: "pending",
      idempotency_key: "admin-read:other-account",
      payload: "{}",
    });
    return id;
  })();
  otherEntryId = await insertBalancedEntry(otherAccountId, "2026-06-10", "قيد حساب آخر");

  manualEntryJuneMidId = await insertBalancedEntry(accountId, "2026-06-15", "قيد يدوي 1");
  manualEntryJuneLateId = await insertBalancedEntry(accountId, "2026-06-20", "قيد يدوي 2");

  junePeriodId = newId();
  await db("accounting_periods").insert({
    id: junePeriodId,
    account_id: accountId,
    starts_on: "2026-06-01",
    ends_on: "2026-06-30",
    status: "open",
  });

  // Real lineage flow: inventory receipt -> financial event -> posted journal.
  const locations = await request(app).get("/api/v1/inventory/locations").set(auth(ownerToken));
  locationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
  const item = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({
    name_ar: "صنف قراءة الحسابات",
    sku: "ACC-READ-1",
    base_unit_id: unitId,
    reorder_level: "0",
  });
  expect(item.status).toBe(201);
  const receipt = await request(app).post("/api/v1/inventory/movements").set(auth(ownerToken)).send({
    location_id: locationId,
    item_id: item.body.data.id,
    movement_type: "receipt",
    quantity: "1",
    unit_cost: "12.5",
    source_type: "acc_read_test",
    idempotency_key: "acc-read-receipt-1",
  });
  expect(receipt.status).toBe(201);
  receiptMovementId = receipt.body.data.id;
  await processPending();
  const receiptEvent = await db("financial_events")
    .where({ account_id: accountId, source_type: "stock_movement", source_id: receiptMovementId })
    .first();
  receiptEventId = receiptEvent.id;
  const receiptEntry = await db("journal_entries").where({ financial_event_id: receiptEventId }).first();
  receiptEntryId = receiptEntry.id;

  // Synthetic status fixtures are seeded AFTER processPending so the claim
  // worker cannot consume the pending/failed rows the list tests assert on.
  await insertEvent({ key: "cash_pending", branch: branchId, eventType: "cash.movement", status: "pending", createdAt: "2026-07-10T08:00:00.000Z" });
  await insertEvent({ key: "cash_failed", branch: branchId, eventType: "cash.movement", status: "failed", createdAt: "2026-07-10T09:00:00.000Z", lastError: "mapping missing" });
  await insertEvent({ key: "receipt_dead", branch: branch2Id, eventType: "inventory.receipt", status: "dead", createdAt: "2026-07-10T10:00:00.000Z", lastError: "gave up" });
  await insertEvent({ key: "deferred", branch: branchId, eventType: "inventory.adjustment", status: "deferred_rounding", createdAt: "2026-07-11T08:00:00.000Z" });
  await insertEvent({ key: "posted", branch: branchId, eventType: "payment.captured", status: "posted", createdAt: "2026-07-12T08:00:00.000Z" });
});

afterAll(async () => {
  await db.destroy();
});

describe("accounting permissions matrix", () => {
  it("rejects financial events and journals reads without accounting.view", async () => {
    const events = await request(app).get("/api/v1/accounting/financial-events").set(auth(noPermToken));
    expect(events.status).toBe(403);
    const journals = await request(app).get("/api/v1/accounting/journals").set(auth(noPermToken));
    expect(journals.status).toBe(403);
    const detail = await request(app).get(`/api/v1/accounting/financial-events/${eventIds.cash_pending}`).set(auth(noPermToken));
    expect(detail.status).toBe(403);
  });

  it("allows reads with accounting.view but rejects retry without accounting.manage", async () => {
    const events = await request(app).get("/api/v1/accounting/financial-events").set(auth(viewerToken));
    expect(events.status).toBe(200);
    const journals = await request(app).get("/api/v1/accounting/journals").set(auth(viewerToken));
    expect(journals.status).toBe(200);
    const retry = await request(app)
      .post(`/api/v1/accounting/financial-events/${eventIds.cash_failed}/retry`)
      .set(auth(viewerToken));
    expect(retry.status).toBe(403);
  });
});

describe("financial events list", () => {
  it("filters by status including deferred_rounding", async () => {
    const failed = await request(app).get("/api/v1/accounting/financial-events?status=failed").set(auth(ownerToken));
    expect(failed.status).toBe(200);
    expect(failed.body.data.length).toBeGreaterThan(0);
    for (const row of failed.body.data) expect(row.status).toBe("failed");
    expect(failed.body.data.map((row: { id: string }) => row.id)).toContain(eventIds.cash_failed);

    const deferred = await request(app).get("/api/v1/accounting/financial-events?status=deferred_rounding").set(auth(ownerToken));
    expect(deferred.status).toBe(200);
    expect(deferred.body.data.map((row: { id: string }) => row.id)).toContain(eventIds.deferred);
  });

  it("filters by event_type, branch, and date range", async () => {
    const byType = await request(app).get("/api/v1/accounting/financial-events?event_type=cash.movement").set(auth(ownerToken));
    expect(byType.status).toBe(200);
    for (const row of byType.body.data) expect(row.event_type).toBe("cash.movement");
    expect(byType.body.data.length).toBe(2);

    const byBranch = await request(app).get(`/api/v1/accounting/financial-events?branch_id=${branch2Id}`).set(auth(ownerToken));
    expect(byBranch.status).toBe(200);
    for (const row of byBranch.body.data) expect(row.branch_id).toBe(branch2Id);
    expect(byBranch.body.data.map((row: { id: string }) => row.id)).toContain(eventIds.receipt_dead);

    const byDate = await request(app)
      .get("/api/v1/accounting/financial-events?date_from=2026-07-11&date_to=2026-07-12")
      .set(auth(ownerToken));
    expect(byDate.status).toBe(200);
    const ids = byDate.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(eventIds.deferred);
    expect(ids).toContain(eventIds.posted);
    expect(ids).not.toContain(eventIds.cash_pending);
  });

  it("paginates with a stable cursor and no duplicates", async () => {
    const full = await request(app).get("/api/v1/accounting/financial-events?limit=100").set(auth(ownerToken));
    expect(full.status).toBe(200);
    const allIds = full.body.data.map((row: { id: string }) => row.id);
    expect(full.body.has_more).toBe(false);

    const collected: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const url: string = `/api/v1/accounting/financial-events?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = await request(app).get(url).set(auth(ownerToken));
      expect(page.status).toBe(200);
      expect(page.body.data.length).toBeLessThanOrEqual(2);
      collected.push(...page.body.data.map((row: { id: string }) => row.id));
      cursor = page.body.next_cursor;
      if (!page.body.has_more) break;
    }
    expect(collected).toEqual(allIds);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it("rejects a malformed cursor", async () => {
    const response = await request(app)
      .get("/api/v1/accounting/financial-events?cursor=%24%24invalid%24%24")
      .set(auth(ownerToken));
    expect(response.status).toBe(400);
  });

  it("never leaks another tenant's events", async () => {
    const list = await request(app).get("/api/v1/accounting/financial-events?limit=100").set(auth(ownerToken));
    expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(otherEventId);
    const detail = await request(app).get(`/api/v1/accounting/financial-events/${otherEventId}`).set(auth(ownerToken));
    expect(detail.status).toBe(404);
  });

  it("scopes a branch-bound viewer to their branch and rejects cross-branch requests", async () => {
    const list = await request(app).get("/api/v1/accounting/financial-events?limit=100").set(auth(branchViewerToken));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    for (const row of list.body.data) expect(row.branch_id).toBe(branch2Id);

    const crossBranch = await request(app)
      .get(`/api/v1/accounting/financial-events?branch_id=${branchId}`)
      .set(auth(branchViewerToken));
    expect(crossBranch.status).toBe(403);

    const crossDetail = await request(app)
      .get(`/api/v1/accounting/financial-events/${eventIds.cash_pending}`)
      .set(auth(branchViewerToken));
    expect(crossDetail.status).toBe(403);
  });
});

describe("financial event detail", () => {
  it("returns last error and empty linkage for an unposted event", async () => {
    const response = await request(app)
      .get(`/api/v1/accounting/financial-events/${eventIds.cash_failed}`)
      .set(auth(ownerToken));
    expect(response.status).toBe(200);
    expect(response.body.data.last_error).toBe("mapping missing");
    expect(response.body.data.journal_entry).toBeNull();
    expect(response.body.data.reconciliation).toBeNull();
    expect(response.body.data.source).toBeNull();
  });

  it("returns journal linkage and stock movement lineage for a posted inventory event", async () => {
    const response = await request(app)
      .get(`/api/v1/accounting/financial-events/${receiptEventId}`)
      .set(auth(ownerToken));
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("posted");
    expect(response.body.data.journal_entry.id).toBe(receiptEntryId);
    expect(response.body.data.source.kind).toBe("stock_movement");
    expect(response.body.data.source.stock_movement.id).toBe(receiptMovementId);
  });

  it("returns 404 for unknown or malformed ids", async () => {
    const unknown = await request(app).get(`/api/v1/accounting/financial-events/${newId()}`).set(auth(ownerToken));
    expect(unknown.status).toBe(404);
    const malformed = await request(app).get("/api/v1/accounting/financial-events/not-a-uuid").set(auth(ownerToken));
    expect(malformed.status).toBe(404);
  });
});

describe("journals list", () => {
  it("filters by date range and embeds balanced lines", async () => {
    const response = await request(app)
      .get("/api/v1/accounting/journals?date_from=2026-06-01&date_to=2026-06-30")
      .set(auth(ownerToken));
    expect(response.status).toBe(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(manualEntryJuneMidId);
    expect(ids).toContain(manualEntryJuneLateId);
    expect(ids).not.toContain(receiptEntryId);
    const entry = response.body.data.find((row: { id: string }) => row.id === manualEntryJuneMidId);
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines[0].account_code).toBeTruthy();
  });

  it("filters by source_type and by period", async () => {
    const bySource = await request(app)
      .get("/api/v1/accounting/journals?source_type=stock_movement")
      .set(auth(ownerToken));
    expect(bySource.status).toBe(200);
    for (const row of bySource.body.data) expect(row.source_type).toBe("stock_movement");
    expect(bySource.body.data.map((row: { id: string }) => row.id)).toContain(receiptEntryId);

    const byPeriod = await request(app)
      .get(`/api/v1/accounting/journals?period_id=${junePeriodId}`)
      .set(auth(ownerToken));
    expect(byPeriod.status).toBe(200);
    const periodIds = byPeriod.body.data.map((row: { id: string }) => row.id);
    expect(periodIds).toContain(manualEntryJuneMidId);
    expect(periodIds).toContain(manualEntryJuneLateId);
    expect(periodIds).not.toContain(receiptEntryId);

    const missingPeriod = await request(app)
      .get(`/api/v1/accounting/journals?period_id=${newId()}`)
      .set(auth(ownerToken));
    expect(missingPeriod.status).toBe(404);
  });

  it("paginates journals without duplicates", async () => {
    const full = await request(app).get("/api/v1/accounting/journals?limit=100").set(auth(ownerToken));
    expect(full.status).toBe(200);
    const allIds = full.body.data.map((row: { id: string }) => row.id);
    expect(allIds.length).toBeGreaterThanOrEqual(3);

    const collected: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const url: string = `/api/v1/accounting/journals?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = await request(app).get(url).set(auth(ownerToken));
      expect(page.status).toBe(200);
      collected.push(...page.body.data.map((row: { id: string }) => row.id));
      cursor = page.body.next_cursor;
      if (!page.body.has_more) break;
    }
    expect(collected).toEqual(allIds);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it("never leaks another tenant's journals", async () => {
    const list = await request(app).get("/api/v1/accounting/journals?limit=100").set(auth(ownerToken));
    expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(otherEntryId);
    const detail = await request(app).get(`/api/v1/accounting/journals/${otherEntryId}`).set(auth(ownerToken));
    expect(detail.status).toBe(404);
  });
});

describe("journal detail", () => {
  it("returns lines, reversal linkage, and financial event lineage", async () => {
    const beforeReversal = await request(app)
      .get(`/api/v1/accounting/journals/${manualEntryJuneMidId}`)
      .set(auth(ownerToken));
    expect(beforeReversal.status).toBe(200);
    expect(beforeReversal.body.data.lines).toHaveLength(2);
    expect(beforeReversal.body.data.reversed_by).toBeNull();
    expect(beforeReversal.body.data.financial_event).toBeNull();

    const reversal = await request(app)
      .post(`/api/v1/accounting/journals/${manualEntryJuneMidId}/reverse`)
      .set(auth(ownerToken))
      .send({ reason: "تصحيح قيد اختبار" });
    expect(reversal.status).toBe(201);
    const reversalId = reversal.body.data.id;

    const afterReversal = await request(app)
      .get(`/api/v1/accounting/journals/${manualEntryJuneMidId}`)
      .set(auth(ownerToken));
    expect(afterReversal.body.data.reversed_by.id).toBe(reversalId);

    const reversalDetail = await request(app)
      .get(`/api/v1/accounting/journals/${reversalId}`)
      .set(auth(ownerToken));
    expect(reversalDetail.status).toBe(200);
    expect(reversalDetail.body.data.reversal_of_entry_id).toBe(manualEntryJuneMidId);

    const receiptDetail = await request(app)
      .get(`/api/v1/accounting/journals/${receiptEntryId}`)
      .set(auth(ownerToken));
    expect(receiptDetail.status).toBe(200);
    expect(receiptDetail.body.data.financial_event.id).toBe(receiptEventId);
    expect(receiptDetail.body.data.financial_event.source_id).toBe(receiptMovementId);
  });

  it("returns 404 for unknown or malformed journal ids", async () => {
    const unknown = await request(app).get(`/api/v1/accounting/journals/${newId()}`).set(auth(ownerToken));
    expect(unknown.status).toBe(404);
    const malformed = await request(app).get("/api/v1/accounting/journals/not-a-uuid").set(auth(ownerToken));
    expect(malformed.status).toBe(404);
  });
});
