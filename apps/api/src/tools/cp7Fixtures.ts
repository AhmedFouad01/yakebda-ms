/**
 * ACC-FULL-01 CP7 — disposable QA fixtures for ykms_cp7 ONLY.
 * Produces realistic data through the real code paths (no hand-forged
 * journals): sub-cent receipts -> residuals + deferred_rounding, a normal
 * receipt -> posted journal, a manual balanced journal + reversal, plus
 * synthetic failed/dead/pending events for the dashboard/exceptions display,
 * and two dedicated QA users (view-only, manage).
 *
 * Guard: refuses to run unless DATABASE_URL names a ...ykms_cp7 database.
 */
import bcrypt from "bcryptjs";
import { makeKnex } from "../db/knex";
import { newId } from "../lib/ids";
import { claimFinancialEvents, enqueueFinancialEvent } from "../modules/financialOutbox";
import { postClaimedFinancialEvent, reverseJournalEntry } from "../modules/accountingLedger";
import { createStockMovement } from "../modules/inventoryService";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/ykms_cp7(\b|$)/.test(url)) {
    throw new Error(`Refusing to run: DATABASE_URL must target ykms_cp7 (got: ${url || "unset"})`);
  }
  const db = makeKnex(url);

  const account = await db("accounts").first();
  const accountId = account.id as string;
  const owner = await db("users").where({ account_id: accountId, email: "owner@ykms.local" }).first();
  const branches = await db("branches").where({ account_id: accountId }).orderBy("created_at");
  const mainBranch = branches[0];
  const secondBranch = branches[1];
  const locations = await db("inventory_locations").where({ account_id: accountId });
  const mainLocation = locations.find((l: { branch_id: string }) => l.branch_id === mainBranch.id);
  const secondLocation = locations.find((l: { branch_id: string }) => l.branch_id === secondBranch.id);
  const unit = await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first();

  // ---- QA users ---------------------------------------------------------
  async function ensureRoleUser(email: string, roleKey: string, perms: string[]) {
    let role = await db("roles").where({ account_id: accountId, key: roleKey }).first();
    if (!role) {
      const roleId = newId();
      await db("roles").insert({ id: roleId, account_id: accountId, key: roleKey, name_ar: roleKey, is_system: false });
      await db("role_permissions").insert(perms.map((permission) => ({ role_id: roleId, permission_key: permission })));
      role = { id: roleId };
    }
    let user = await db("users").where({ account_id: accountId, email }).first();
    if (!user) {
      const userId = newId();
      await db("users").insert({
        id: userId,
        account_id: accountId,
        branch_id: null,
        name: email,
        email,
        password_hash: bcrypt.hashSync("Qa@123456", 10),
        is_active: true,
      });
      await db("user_roles").insert({ user_id: userId, role_id: role.id });
    }
  }
  await ensureRoleUser("qa-view@ykms.local", "qa_view_only", ["accounting.view"]);
  await ensureRoleUser("qa-manage@ykms.local", "qa_manage", ["accounting.view", "accounting.manage"]);
  await ensureRoleUser("qa-none@ykms.local", "qa_no_accounting", ["orders.create"]);

  let itemSeq = 0;
  async function receipt(unitCost: string, location: { id: string }, dateIso?: string) {
    itemSeq += 1;
    const itemId = newId();
    await db("inventory_items").insert({
      id: itemId,
      account_id: accountId,
      name_ar: `صنف QA ${itemSeq}`,
      sku: `QA-${itemSeq}`,
      base_unit_id: unit.id,
      reorder_level: "0",
      is_active: true,
    });
    const movement = await createStockMovement(db, {
      accountId,
      locationId: location.id,
      itemId,
      movementType: "receipt",
      quantity: "1",
      unitCost,
      sourceType: "cp7_qa",
      idempotencyKey: `cp7-${itemSeq}-${newId()}`,
      createdBy: owner.id,
    });
    if (dateIso) {
      await db("financial_events")
        .where({ account_id: accountId, source_type: "stock_movement", source_id: movement.id })
        .update({ created_at: dateIso });
    }
    return movement.id as string;
  }

  async function processAll() {
    const workerId = `cp7-${Date.now()}-${Math.random()}`;
    const claimed = await claimFinancialEvents(db, { workerId, limit: 500, accountId });
    for (const event of claimed) {
      await postClaimedFinancialEvent(db, { eventId: event.id, workerId });
    }
  }

  // ---- Sub-cent residuals (open) for settlement/trial-balance -----------
  // Three 0.004 receipts on the main branch in June, one on the second
  // branch — each defers to deferred_rounding and leaves an open residual.
  await receipt("0.004", mainLocation, "2026-06-10T09:00:00.000Z");
  await receipt("0.004", mainLocation, "2026-06-12T09:00:00.000Z");
  await receipt("0.004", mainLocation, "2026-06-15T09:00:00.000Z");
  await receipt("0.004", secondLocation, "2026-06-14T09:00:00.000Z");
  // A normal-value receipt -> posted journal.
  await receipt("125.50", mainLocation, "2026-06-20T09:00:00.000Z");
  await processAll();

  // ---- A manual balanced journal + reversal (July, open period) ---------
  const cash = await db("accounting_accounts").where({ account_id: accountId, system_key: "cash" }).first();
  const revenue = await db("accounting_accounts").where({ account_id: accountId, system_key: "sales_revenue" }).first();
  const manualId = newId();
  await db.transaction(async (trx) => {
    await trx("journal_entries").insert({
      id: manualId,
      account_id: accountId,
      branch_id: mainBranch.id,
      event_type: "test.manual",
      source_type: "cp7_manual",
      source_id: newId(),
      entry_date: "2026-07-05",
      description: "قيد يدوي للاختبار — قابل للعكس",
      meta: "{}",
      created_by: owner.id,
    });
    await trx("journal_lines").insert([
      { id: newId(), account_id: accountId, entry_id: manualId, accounting_account_id: cash.id, branch_id: mainBranch.id, component: "debit", debit: 500, credit: 0 },
      { id: newId(), account_id: accountId, entry_id: manualId, accounting_account_id: revenue.id, branch_id: mainBranch.id, component: "credit", debit: 0, credit: 500 },
    ]);
  });
  // Reverse a *different* manual entry so both a reversible and a reversed
  // entry exist for the journals-screen QA.
  const reversibleId = newId();
  await db.transaction(async (trx) => {
    await trx("journal_entries").insert({
      id: reversibleId,
      account_id: accountId,
      branch_id: mainBranch.id,
      event_type: "test.manual",
      source_type: "cp7_manual",
      source_id: newId(),
      entry_date: "2026-07-06",
      description: "قيد يدوي مُعكوس",
      meta: "{}",
      created_by: owner.id,
    });
    await trx("journal_lines").insert([
      { id: newId(), account_id: accountId, entry_id: reversibleId, accounting_account_id: cash.id, branch_id: mainBranch.id, component: "debit", debit: 300, credit: 0 },
      { id: newId(), account_id: accountId, entry_id: reversibleId, accounting_account_id: revenue.id, branch_id: mainBranch.id, component: "credit", debit: 0, credit: 300 },
    ]);
  });
  await reverseJournalEntry(db, { accountId, entryId: reversibleId, reason: "عكس اختباري CP7", createdBy: owner.id });

  // ---- Synthetic status events for dashboard/exceptions display ---------
  async function synthetic(status: string, eventType: string, branch: string, lastError: string | null, createdAt: string) {
    await db("financial_events").insert({
      id: newId(),
      account_id: accountId,
      branch_id: branch,
      source_type: "cp7_synthetic",
      source_id: newId(),
      event_type: eventType,
      status,
      last_error: lastError,
      idempotency_key: `cp7-syn-${newId()}`,
      payload: JSON.stringify({ note: "CP7 synthetic display fixture" }),
      created_at: createdAt,
    });
  }
  await synthetic("failed", "cash.movement", mainBranch.id, "قاعدة الترحيل غير موجودة: cash.movement:cash_in", "2026-07-18T08:00:00.000Z");
  await synthetic("failed", "payment.captured", mainBranch.id, "تعذّر تخصيص الضريبة", "2026-07-18T09:30:00.000Z");
  await synthetic("dead", "inventory.receipt", secondBranch.id, "استُنفدت المحاولات (5)", "2026-07-17T10:00:00.000Z");
  await synthetic("pending_policy", "inventory.issue", mainBranch.id, null, "2026-07-19T07:00:00.000Z");
  await synthetic("non_posting", "cash.movement", mainBranch.id, null, "2026-07-16T07:00:00.000Z");
  await synthetic("pending", "payment.captured", mainBranch.id, null, "2026-07-20T07:00:00.000Z");

  const counts = await db("financial_events").where({ account_id: accountId }).groupBy("status").select("status").count({ n: "*" });
  const openResiduals = await db("financial_event_reconciliations").where({ account_id: accountId, status: "open" }).count({ n: "*" }).first();
  // eslint-disable-next-line no-console
  console.log("CP7 fixtures ready:", { statuses: counts, openResiduals: openResiduals?.n, manualEntry: manualId });
  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
