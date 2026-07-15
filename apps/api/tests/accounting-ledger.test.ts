import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { ensureAccountingDefaults } from "../src/modules/accountingLedger";
import { enqueueFinancialEvent } from "../src/modules/financialOutbox";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let branchToken = "";
let accountId = "";
let branchId = "";
let sourceId = "";
let productId = "";
let orderId = "";
let firstPaymentEntryId = "";

const auth = (value = token) => ({ Authorization: `Bearer ${value}` });

async function createOrder(total: string, vat: string) {
  const response = await request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: branchId,
      source_id: sourceId,
      order_type: "takeaway",
      delivery_fee: 0,
      discount: 0,
      submit: true,
      payment_method: "unpaid",
      items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
    });
  expect(response.status).toBe(201);
  await db("orders").where({ id: response.body.data.id }).update({
    subtotal: total,
    vat_amount: vat,
    total,
  });
  return response.body.data.id as string;
}

async function processPending(tokenValue = token) {
  const response = await request(app)
    .post("/api/v1/accounting/events/process")
    .set(auth(tokenValue))
    .send({ limit: 100 });
  expect(response.status).toBe(200);
  return response.body.data as Array<{ event_id: string; status: string; journalEntryId: string | null }>;
}

async function entryLines(entryId: string) {
  return db("journal_lines as line")
    .join("accounting_accounts as account", "account.id", "line.accounting_account_id")
    .where({ "line.entry_id": entryId })
    .select("line.*", "account.system_key");
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  app = createApp(db);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  token = login.body.token;
  sourceId = (await db("order_sources").where({ account_id: accountId, code: "direct" }).first()).id;

  const categoryId = newId();
  productId = newId();
  await db("categories").insert({ id: categoryId, account_id: accountId, name_ar: "Accounting tests", sort_order: 99, is_active: true });
  await db("products").insert({ id: productId, account_id: accountId, category_id: categoryId, name_ar: "Accounting item", base_price: 30, sort_order: 0, is_active: true });

  const roleId = newId();
  const userId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: "branch_accounting_test", name_ar: "Branch accounting test", is_system: false });
  await db("role_permissions").insert([
    { role_id: roleId, permission_key: "accounting.view" },
    { role_id: roleId, permission_key: "accounting.manage" },
  ]);
  await db("users").insert({ id: userId, account_id: accountId, branch_id: branchId, name: "Branch accountant", email: "branch-accounting@ykms.local", password_hash: bcrypt.hashSync("BranchAccounting@123", 10), is_active: true });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const branchLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "branch-accounting@ykms.local", password: "BranchAccounting@123" });
  branchToken = branchLogin.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("Immutable accounting ledger", () => {
  it("posts partial multi-tender payments with exact VAT remainder allocation", async () => {
    orderId = await createOrder("100.01", "14.01");
    const first = await request(app).post(`/api/v1/orders/${orderId}/payments`).set(auth()).send({ method: "card", amount: 33.33 });
    const second = await request(app).post(`/api/v1/orders/${orderId}/payments`).set(auth()).send({ method: "wallet", amount: 66.68 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    expect((await processPending()).every((row) => row.status === "posted")).toBe(true);
    const entries = await db("journal_entries").where({ account_id: accountId, order_id: orderId, event_type: "payment.captured" }).orderBy("created_at");
    expect(entries).toHaveLength(2);
    firstPaymentEntryId = entries.find((entry) => entry.payment_id === first.body.data.id).id;
    const lines = await db("journal_lines").whereIn("entry_id", entries.map((entry) => entry.id));
    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    const vat = lines.filter((line) => line.component === "vat").reduce((sum, line) => sum + Number(line.credit), 0);
    const revenue = lines.filter((line) => line.component === "revenue").reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit).toBeCloseTo(100.01, 2);
    expect(credit).toBeCloseTo(100.01, 2);
    expect(vat).toBeCloseTo(14.01, 2);
    expect(revenue).toBeCloseTo(86, 2);
  });

  it("posts refunds against the original tender allocation", async () => {
    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/refund`)
      .set(auth())
      .send({ amount: 33.33, reason: "Accounting refund allocation test" });
    expect(response.status).toBe(201);
    await processPending();
    const entry = await db("journal_entries").where({ account_id: accountId, order_id: orderId, event_type: "refund.posted" }).first();
    const lines = await entryLines(entry.id);
    const originalPayment = await db("payments").where({ id: entry.original_payment_id }).first();
    expect(lines.reduce((sum, line) => sum + Number(line.debit), 0)).toBeCloseTo(33.33, 2);
    expect(lines.reduce((sum, line) => sum + Number(line.credit), 0)).toBeCloseTo(33.33, 2);
    expect(lines.some((line) => line.system_key === `${originalPayment.method}_clearing` && Number(line.credit) === 33.33)).toBe(true);
  });

  it("posts cash and inventory valuation events", async () => {
    const shift = await db("shifts").where({ account_id: accountId, branch_id: branchId, status: "open" }).first();
    const cash = await request(app).post(`/api/v1/shifts/${shift.id}/cash-in`).set(auth()).send({ amount: 25, reason: "Accounting cash test" });
    expect(cash.status).toBe(200);

    const location = await db("inventory_locations").where({ account_id: accountId, branch_id: branchId, is_default: true }).first();
    const unit = await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first();
    const item = await request(app).post("/api/v1/inventory/items").set(auth()).send({ name_ar: "Accounting stock item", sku: "ACC-STOCK", base_unit_id: unit.id, reorder_level: "0" });
    const supplier = await request(app).post("/api/v1/inventory/suppliers").set(auth()).send({ name_ar: "Accounting supplier" });
    const receipt = await request(app).post("/api/v1/inventory/purchase-receipts").set(auth()).send({
      location_id: location.id,
      item_id: item.body.data.id,
      supplier_id: supplier.body.data.id,
      quantity: "2",
      unit_cost: "7.5",
      receipt_reference: "ACC-R1",
      idempotency_key: "accounting-receipt-test",
    });
    expect(receipt.status).toBe(201);
    await processPending();
    const cashEvent = await db("financial_events").where({ account_id: accountId, event_type: "cash.movement" }).orderBy("created_at", "desc").first();
    const cashEntry = await db("journal_entries").where({ account_id: accountId, financial_event_id: cashEvent.id }).first();
    const receiptEntry = await db("journal_entries").where({ account_id: accountId, event_type: "inventory.receipt", source_id: receipt.body.data.id }).first();
    expect((await entryLines(cashEntry.id)).map((line) => line.system_key)).toEqual(expect.arrayContaining(["cash", "cash_variance"]));
    expect((await entryLines(receiptEntry.id)).map((line) => line.system_key)).toEqual(expect.arrayContaining(["inventory", "accounts_payable"]));
  });

  it("does not duplicate journals when processing is replayed", async () => {
    const before = Number((await db("journal_entries").where({ account_id: accountId }).count<{ count: string }>("id as count").first())?.count ?? 0);
    expect(await processPending()).toEqual([]);
    const after = Number((await db("journal_entries").where({ account_id: accountId }).count<{ count: string }>("id as count").first())?.count ?? 0);
    expect(after).toBe(before);
  });

  it("enforces balance and immutability in PostgreSQL", async () => {
    const cashAccount = await db("accounting_accounts").where({ account_id: accountId, system_key: "cash" }).first();
    await expect(db.transaction(async (trx) => {
      const entryId = newId();
      await trx("journal_entries").insert({ id: entryId, account_id: accountId, branch_id: branchId, event_type: "test.unbalanced", source_type: "test", source_id: newId(), entry_date: new Date().toISOString().slice(0, 10), description: "Must roll back" });
      await trx("journal_lines").insert({ id: newId(), account_id: accountId, entry_id: entryId, accounting_account_id: cashAccount.id, branch_id: branchId, component: "debit", debit: "1.00", credit: "0.00" });
    })).rejects.toMatchObject({ constraint: "journal_entry_unbalanced" });
    await expect(db("journal_entries").where({ id: firstPaymentEntryId }).update({ description: "mutated" })).rejects.toMatchObject({ code: "55000" });
    const firstLine = await db("journal_lines").where({ entry_id: firstPaymentEntryId }).first();
    await expect(db("journal_lines").where({ id: firstLine.id }).del()).rejects.toMatchObject({ code: "55000" });
  });

  it("creates one immutable reversal and keeps the trial balance balanced", async () => {
    const first = await request(app).post(`/api/v1/accounting/journals/${firstPaymentEntryId}/reverse`).set(auth()).send({ reason: "Approved correction" });
    const second = await request(app).post(`/api/v1/accounting/journals/${firstPaymentEntryId}/reverse`).set(auth()).send({ reason: "Approved correction replay" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    const originalLines = await entryLines(firstPaymentEntryId);
    const reversalLines = await entryLines(first.body.data.id);
    expect(reversalLines.map((line) => [Number(line.debit), Number(line.credit)])).toEqual(originalLines.map((line) => [Number(line.credit), Number(line.debit)]));

    const trial = await request(app).get("/api/v1/accounting/trial-balance").set(auth());
    expect(trial.status).toBe(200);
    const totals = trial.body.data.reduce((sum: { debit: number; credit: number }, row: { debit: string; credit: string }) => ({ debit: sum.debit + Number(row.debit), credit: sum.credit + Number(row.credit) }), { debit: 0, credit: 0 });
    expect(totals.debit).toBeCloseTo(totals.credit, 2);
  });

  it("keeps processing and journal reads isolated by branch and account", async () => {
    const foreignAccountId = newId();
    await db("accounts").insert({ id: foreignAccountId, name: "Foreign accounting tenant" });
    await ensureAccountingDefaults(db, foreignAccountId);
    const foreignEventId = await db.transaction((trx) => enqueueFinancialEvent(trx, { accountId: foreignAccountId, sourceType: "test", sourceId: "foreign-cash", eventType: "cash.movement", idempotencyKey: "foreign-cash-event", payload: { type: "cash_in", amount: "10" } }));
    await processPending(branchToken);
    expect((await db("financial_events").where({ id: foreignEventId }).first()).status).toBe("pending");
    const journals = await request(app).get("/api/v1/accounting/journals").set(auth(branchToken));
    expect(journals.status).toBe(200);
    expect(journals.body.data.every((entry: { account_id: string; branch_id: string }) => entry.account_id === accountId && entry.branch_id === branchId)).toBe(true);
    const lock = await request(app).post("/api/v1/accounting/periods/lock").set(auth(branchToken)).send({ starts_on: "2026-01-01", ends_on: "2026-12-31" });
    expect(lock.status).toBe(403);
  });

  it("blocks posting and reversal inside a locked period", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const lock = await request(app).post("/api/v1/accounting/periods/lock").set(auth()).send({ starts_on: today, ends_on: today });
    expect(lock.status).toBe(201);
    const eventId = await db.transaction((trx) => enqueueFinancialEvent(trx, { accountId, branchId, sourceType: "test", sourceId: "locked-cash", eventType: "cash.movement", idempotencyKey: "locked-cash-event", payload: { type: "cash_in", amount: "5" } }));
    const processed = await processPending();
    expect(processed.find((row) => row.event_id === eventId)?.status).toBe("failed");
    expect((await db("financial_events").where({ id: eventId }).first()).status).toBe("failed");
    const reversal = await request(app).post(`/api/v1/accounting/journals/${firstPaymentEntryId}/reverse`).set(auth()).send({ reason: "Locked-period reversal" });
    expect(reversal.status).toBe(409);
  });
});
