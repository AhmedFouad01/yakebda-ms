import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { ensureAccountingDefaults } from "../src/modules/accountingLedger";
import { getSettings } from "../src/modules/settings";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let viewerToken = "";
let accountId = "";
let branchId = "";
let branch2Id = "";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const ADR_CODES: Record<string, string> = {
  cash: "1010",
  bank: "1020",
  card_clearing: "1050",
  wallet_clearing: "1060",
  vat_input: "1210",
  inventory: "1310",
  vat_payable: "2010",
  accounts_payable: "2100",
  sales_revenue: "4010",
  sales_returns: "4020",
  rounding: "4090",
  cogs: "5010",
  waste_expense: "5090",
  inventory_variance: "5100",
  cash_variance: "5200",
  delivery_commission: "6050",
};

// Pilot chart exactly as migration 025 used to seed it.
const LEGACY_PILOT_ACCOUNTS: Array<[string, string, string, string]> = [
  ["1000", "cash", "النقدية", "asset"],
  ["1010", "card_clearing", "تسويات البطاقات", "asset"],
  ["1020", "wallet_clearing", "تسويات المحافظ", "asset"],
  ["1100", "inventory", "المخزون", "asset"],
  ["2100", "accounts_payable", "الموردون", "liability"],
  ["2200", "vat_payable", "ضريبة القيمة المضافة", "liability"],
  ["3000", "sales_revenue", "إيرادات المبيعات", "revenue"],
  ["4000", "cogs", "تكلفة البضاعة المباعة", "expense"],
  ["5000", "waste_expense", "مصروف الهالك", "expense"],
  ["5100", "inventory_variance", "فروق المخزون", "expense"],
  ["5200", "cash_variance", "فروق وحركات النقدية", "expense"],
];

async function chartBySystemKey(targetAccountId: string) {
  const rows = await db("accounting_accounts").where({ account_id: targetAccountId }).whereNotNull("system_key");
  return new Map<string, { id: string; code: string; name_ar: string; is_active: boolean }>(
    rows.map((row) => [row.system_key, row])
  );
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
  await db("roles").insert({ id: roleId, account_id: accountId, key: "acc_viewer_cp3", name_ar: "عرض", is_system: false });
  await db("role_permissions").insert({ role_id: roleId, permission_key: "accounting.view" });
  const userId = newId();
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: null,
    name: "عرض",
    email: "acc-viewer-cp3@ykms.local",
    password_hash: bcrypt.hashSync("Test@12345", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const viewerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "acc-viewer-cp3@ykms.local", password: "Test@12345" });
  viewerToken = viewerLogin.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("ADR-004 default chart seed", () => {
  it("seeds a fresh tenant with the full standard chart at ADR codes", async () => {
    const chart = await chartBySystemKey(accountId);
    for (const [systemKey, code] of Object.entries(ADR_CODES)) {
      expect(chart.get(systemKey)?.code, systemKey).toBe(code);
      expect(chart.get(systemKey)?.is_active, systemKey).toBe(true);
    }
  });

  it("seeds the residual.settlement mapping to inventory/rounding", async () => {
    const chart = await chartBySystemKey(accountId);
    const mapping = await db("accounting_mappings")
      .where({ account_id: accountId, event_type: "residual.settlement", dimension_key: "default" })
      .first();
    expect(mapping).toBeTruthy();
    expect(mapping.debit_account_id).toBe(chart.get("inventory")!.id);
    expect(mapping.credit_account_id).toBe(chart.get("rounding")!.id);
  });

  it("realigns a legacy pilot chart in place, idempotently, preserving account ids", async () => {
    const legacyAccountId = newId();
    await db("accounts").insert({ id: legacyAccountId, name: "حساب قديم" });
    for (const [code, systemKey, nameAr, accountType] of LEGACY_PILOT_ACCOUNTS) {
      await db("accounting_accounts").insert({
        id: newId(),
        account_id: legacyAccountId,
        code,
        system_key: systemKey,
        name_ar: nameAr,
        account_type: accountType,
      });
    }
    const before = await chartBySystemKey(legacyAccountId);

    await ensureAccountingDefaults(db, legacyAccountId);
    const after = await chartBySystemKey(legacyAccountId);
    for (const [systemKey, code] of Object.entries(ADR_CODES)) {
      expect(after.get(systemKey)?.code, systemKey).toBe(code);
    }
    // Realigned rows keep their ids (journal history stays attached).
    expect(after.get("cash")!.id).toBe(before.get("cash")!.id);
    expect(after.get("card_clearing")!.id).toBe(before.get("card_clearing")!.id);
    expect(after.get("cash")!.name_ar).toBe("النقدية/الخزينة");

    // Second run changes nothing.
    await ensureAccountingDefaults(db, legacyAccountId);
    const accountCount = await db("accounting_accounts").where({ account_id: legacyAccountId }).count("* as n").first();
    expect(Number(accountCount!.n)).toBe(Object.keys(ADR_CODES).length);
    const mappingCount = await db("accounting_mappings").where({ account_id: legacyAccountId }).count("* as n").first();
    expect(Number(mappingCount!.n)).toBe(14);
  });
});

describe("chart endpoints", () => {
  it("creates an account with audit and rejects duplicate codes", async () => {
    const created = await request(app).post("/api/v1/accounting/accounts").set(auth(ownerToken)).send({
      code: "7010",
      name_ar: "مصروفات تسويق",
      account_type: "expense",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe("7010");

    const audit = await db("audit_logs")
      .where({ account_id: accountId, action: "accounting.account.create", entity_id: created.body.data.id })
      .first();
    expect(audit).toBeTruthy();
    expect(audit.entity_type).toBe("accounting_account");

    const duplicate = await request(app).post("/api/v1/accounting/accounts").set(auth(ownerToken)).send({
      code: "7010",
      name_ar: "مكرر",
      account_type: "expense",
    });
    expect(duplicate.status).toBe(409);

    const forbidden = await request(app).post("/api/v1/accounting/accounts").set(auth(viewerToken)).send({
      code: "7020",
      name_ar: "ممنوع",
      account_type: "expense",
    });
    expect(forbidden.status).toBe(403);
  });

  it("disables only unmapped accounts and lists inactive on request", async () => {
    const chart = await chartBySystemKey(accountId);
    const mappedRejected = await request(app)
      .patch(`/api/v1/accounting/accounts/${chart.get("cash")!.id}`)
      .set(auth(ownerToken))
      .send({ is_active: false });
    expect(mappedRejected.status).toBe(422);

    const bankId = chart.get("bank")!.id; // seeded but not mapped
    const disabled = await request(app)
      .patch(`/api/v1/accounting/accounts/${bankId}`)
      .set(auth(ownerToken))
      .send({ is_active: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.is_active).toBe(false);

    const activeOnly = await request(app).get("/api/v1/accounting/accounts").set(auth(ownerToken));
    expect(activeOnly.body.data.map((row: { id: string }) => row.id)).not.toContain(bankId);
    const all = await request(app).get("/api/v1/accounting/accounts?include_inactive=true").set(auth(ownerToken));
    expect(all.body.data.map((row: { id: string }) => row.id)).toContain(bankId);

    const audit = await db("audit_logs")
      .where({ account_id: accountId, action: "accounting.account.update", entity_id: bankId })
      .first();
    expect(audit).toBeTruthy();

    const reEnabled = await request(app)
      .patch(`/api/v1/accounting/accounts/${bankId}`)
      .set(auth(ownerToken))
      .send({ is_active: true });
    expect(reEnabled.status).toBe(200);
  });
});

describe("mapping endpoints", () => {
  it("lists mappings with joined account codes", async () => {
    const response = await request(app).get("/api/v1/accounting/mappings").set(auth(ownerToken));
    expect(response.status).toBe(200);
    const settlement = response.body.data.find((row: { event_type: string }) => row.event_type === "residual.settlement");
    expect(settlement.debit_account_code).toBe("1310");
    expect(settlement.credit_account_code).toBe("4090");
  });

  it("creates a mapping only to existing active accounts, with audit", async () => {
    const chart = await chartBySystemKey(accountId);
    const created = await request(app).post("/api/v1/accounting/mappings").set(auth(ownerToken)).send({
      event_type: "source.fee",
      dimension_key: "delivery_platform",
      debit_account_id: chart.get("delivery_commission")!.id,
      credit_account_id: chart.get("accounts_payable")!.id,
    });
    expect(created.status).toBe(201);
    const audit = await db("audit_logs")
      .where({ account_id: accountId, action: "accounting.mapping.create", entity_id: created.body.data.id })
      .first();
    expect(audit).toBeTruthy();

    const duplicate = await request(app).post("/api/v1/accounting/mappings").set(auth(ownerToken)).send({
      event_type: "payment.captured",
      dimension_key: "cash",
      debit_account_id: chart.get("cash")!.id,
      credit_account_id: chart.get("sales_revenue")!.id,
    });
    expect(duplicate.status).toBe(409);

    const unknownAccount = await request(app).post("/api/v1/accounting/mappings").set(auth(ownerToken)).send({
      event_type: "source.fee",
      dimension_key: "other",
      debit_account_id: newId(),
      credit_account_id: chart.get("accounts_payable")!.id,
    });
    expect(unknownAccount.status).toBe(422);

    const forbidden = await request(app).post("/api/v1/accounting/mappings").set(auth(viewerToken)).send({
      event_type: "source.fee",
      dimension_key: "blocked",
      debit_account_id: chart.get("delivery_commission")!.id,
      credit_account_id: chart.get("accounts_payable")!.id,
    });
    expect(forbidden.status).toBe(403);
  });

  it("rejects mapping to a disabled account and updates mappings with audit", async () => {
    const chart = await chartBySystemKey(accountId);
    const vatInputId = chart.get("vat_input")!.id;
    await request(app).patch(`/api/v1/accounting/accounts/${vatInputId}`).set(auth(ownerToken)).send({ is_active: false });

    const toDisabled = await request(app).post("/api/v1/accounting/mappings").set(auth(ownerToken)).send({
      event_type: "source.fee",
      dimension_key: "disabled_target",
      debit_account_id: vatInputId,
      credit_account_id: chart.get("accounts_payable")!.id,
    });
    expect(toDisabled.status).toBe(422);
    await request(app).patch(`/api/v1/accounting/accounts/${vatInputId}`).set(auth(ownerToken)).send({ is_active: true });

    const mapping = await db("accounting_mappings")
      .where({ account_id: accountId, event_type: "source.fee", dimension_key: "delivery_platform" })
      .first();
    const updated = await request(app)
      .put(`/api/v1/accounting/mappings/${mapping.id}`)
      .set(auth(ownerToken))
      .send({ credit_account_id: chart.get("bank")!.id });
    expect(updated.status).toBe(200);
    expect(updated.body.data.credit_account_id).toBe(chart.get("bank")!.id);

    const audit = await db("audit_logs")
      .where({ account_id: accountId, action: "accounting.mapping.update", entity_id: mapping.id })
      .first();
    expect(audit).toBeTruthy();
    const meta = typeof audit.meta === "string" ? JSON.parse(audit.meta) : audit.meta;
    expect(meta.before.credit_account_id).toBe(chart.get("accounts_payable")!.id);
  });
});

describe("accounting settings", () => {
  it("returns shipped defaults before any override", async () => {
    const response = await request(app).get("/api/v1/accounting/settings").set(auth(viewerToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      vat_registered: false,
      vat_rate: 14,
      revenue_recognition: "on_payment",
      timezone: "Africa/Cairo",
      day_close_hour: 4,
      materiality_threshold: "0.00",
    });
  });

  it("updates account-level values through the shared settings store (single source of truth)", async () => {
    const updated = await request(app)
      .put("/api/v1/accounting/settings")
      .set(auth(ownerToken))
      .send({ vat_registered: true, vat_rate: 10, materiality_threshold: "25.50" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.vat_registered).toBe(true);
    expect(updated.body.data.vat_rate).toBe(10);
    expect(updated.body.data.materiality_threshold).toBe("25.50");
    expect(updated.body.data.day_close_hour).toBe(4);

    // Alias proof: operational settings see the same VAT values.
    const operational = await getSettings(db, accountId, null);
    expect(operational.vat_enabled).toBe(true);
    expect(operational.vat_percentage).toBe(10);

    const audit = await db("audit_logs")
      .where({ account_id: accountId, action: "accounting.settings.update" })
      .first();
    expect(audit).toBeTruthy();
    expect(audit.entity_type).toBe("accounting_settings");
  });

  it("upserts account-level settings without creating duplicate rows on repeated saves", async () => {
    // Regression: Postgres treats NULL branch_id as distinct in the settings
    // unique index, so onConflict().merge() would insert a new row each save.
    await request(app).put("/api/v1/accounting/settings").set(auth(ownerToken)).send({ vat_rate: 11 });
    await request(app).put("/api/v1/accounting/settings").set(auth(ownerToken)).send({ vat_rate: 12 });
    await request(app).put("/api/v1/accounting/settings").set(auth(ownerToken)).send({ vat_rate: 13 });
    const rows = await db("settings").where({ account_id: accountId, key: "vat_percentage" }).whereNull("branch_id");
    expect(rows).toHaveLength(1);
    const latest = await request(app).get("/api/v1/accounting/settings").set(auth(ownerToken));
    expect(latest.body.data.vat_rate).toBe(13);
    // Restore the account-level rate the following test inherits.
    await request(app).put("/api/v1/accounting/settings").set(auth(ownerToken)).send({ vat_rate: 10 });
  });

  it("applies branch overrides without touching account-level values", async () => {
    const put = await request(app)
      .put(`/api/v1/accounting/settings?branch_id=${branch2Id}`)
      .set(auth(ownerToken))
      .send({ day_close_hour: 6 });
    expect(put.status).toBe(200);
    expect(put.body.data.day_close_hour).toBe(6);

    const branchGet = await request(app)
      .get(`/api/v1/accounting/settings?branch_id=${branch2Id}`)
      .set(auth(ownerToken));
    expect(branchGet.body.data.day_close_hour).toBe(6);
    expect(branchGet.body.data.vat_rate).toBe(10); // account-level override inherited

    const accountGet = await request(app).get("/api/v1/accounting/settings").set(auth(ownerToken));
    expect(accountGet.body.data.day_close_hour).toBe(4);
  });

  it("rejects invalid values and unauthorized writers", async () => {
    for (const body of [
      { day_close_hour: 24 },
      { vat_rate: 101 },
      { timezone: "Mars/Base" },
      { revenue_recognition: "on_delivery" },
      { materiality_threshold: "12.345" },
      {},
    ]) {
      const response = await request(app).put("/api/v1/accounting/settings").set(auth(ownerToken)).send(body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }

    const forbidden = await request(app)
      .put("/api/v1/accounting/settings")
      .set(auth(viewerToken))
      .send({ day_close_hour: 5 });
    expect(forbidden.status).toBe(403);

    const unknownBranch = await request(app)
      .put(`/api/v1/accounting/settings?branch_id=${newId()}`)
      .set(auth(ownerToken))
      .send({ day_close_hour: 5 });
    expect(unknownBranch.status).toBe(404);
  });
});

describe("DATE columns as calendar strings", () => {
  it("returns entry_date exactly as stored with no timezone pass", async () => {
    const chart = await chartBySystemKey(accountId);
    const entryId = newId();
    await db.transaction(async (trx) => {
      await trx("journal_entries").insert({
        id: entryId,
        account_id: accountId,
        branch_id: null,
        event_type: "test.manual",
        source_type: "test_manual",
        source_id: newId(),
        entry_date: "2026-07-01",
        description: "قيد تحقق التاريخ",
        meta: "{}",
      });
      await trx("journal_lines").insert([
        { id: newId(), account_id: accountId, entry_id: entryId, accounting_account_id: chart.get("cash")!.id, component: "debit", debit: 5, credit: 0 },
        { id: newId(), account_id: accountId, entry_id: entryId, accounting_account_id: chart.get("sales_revenue")!.id, component: "credit", debit: 0, credit: 5 },
      ]);
    });

    const raw = await db("journal_entries").where({ id: entryId }).first();
    expect(typeof raw.entry_date).toBe("string");
    expect(raw.entry_date).toBe("2026-07-01");

    const detail = await request(app).get(`/api/v1/accounting/journals/${entryId}`).set(auth(ownerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.entry_date).toBe("2026-07-01");
  });
});
