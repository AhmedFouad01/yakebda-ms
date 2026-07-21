import { Knex } from "knex";
import { ensureAccountingDefaults, LEGACY_CODE_MOVES } from "../../modules/accountingLedger";

/**
 * ACC-FULL-01 CP3 — ADR-004 standard default chart.
 * Realigns pilot account codes to the ADR chart, seeds the missing standard
 * accounts (bank, vat_input, sales_returns, rounding 4090, delivery
 * commission) and the residual.settlement mapping for every existing account.
 * Relies on the shared idempotent ensureAccountingDefaults (seedBreadGroups
 * pattern: same function serves this migration and seedFoundation).
 */

const ADDED_SYSTEM_KEYS = ["bank", "vat_input", "sales_returns", "rounding", "delivery_commission"];

// Legacy default names as seeded by migration 025, restored on rollback.
const LEGACY_NAMES: Record<string, string> = {
  card_clearing: "تسويات البطاقات",
  wallet_clearing: "تسويات المحافظ",
  cash: "النقدية",
  inventory: "المخزون",
  vat_payable: "ضريبة القيمة المضافة",
  sales_revenue: "إيرادات المبيعات",
  cogs: "تكلفة البضاعة المباعة",
  waste_expense: "مصروف الهالك",
};

export async function up(db: Knex): Promise<void> {
  const accounts = await db("accounts").select("id");
  for (const account of accounts) {
    await ensureAccountingDefaults(db, account.id);
  }
}

export async function down(db: Knex): Promise<void> {
  const accounts = await db("accounts").select("id");
  for (const account of accounts) {
    // Remove the settlement mapping first (it references the rounding account).
    await db("accounting_mappings")
      .where({ account_id: account.id, event_type: "residual.settlement", dimension_key: "default" })
      .delete();

    // Drop accounts this migration added — but only when nothing references
    // them (journal_lines FK is RESTRICT; mapped or posted accounts survive).
    const added = await db("accounting_accounts")
      .where({ account_id: account.id })
      .whereIn("system_key", ADDED_SYSTEM_KEYS);
    for (const row of added) {
      const [line, mapping] = await Promise.all([
        db("journal_lines").where({ accounting_account_id: row.id }).first(),
        db("accounting_mappings")
          .where({ account_id: account.id })
          .where((qb) =>
            qb
              .where("debit_account_id", row.id)
              .orWhere("credit_account_id", row.id)
              .orWhere("vat_account_id", row.id)
          )
          .first(),
      ]);
      if (!line && !mapping) {
        await db("accounting_accounts").where({ id: row.id }).delete();
      }
    }

    // Restore legacy codes/names in reverse order (guarded no-ops otherwise).
    // A restore is skipped when the legacy code is occupied — e.g. an added
    // account (bank@1020) that survived deletion because it became referenced.
    for (const [systemKey, fromCode, toCode] of [...LEGACY_CODE_MOVES].reverse()) {
      const occupied = await db("accounting_accounts").where({ account_id: account.id, code: fromCode }).first();
      if (occupied) continue;
      await db("accounting_accounts")
        .where({ account_id: account.id, system_key: systemKey, code: toCode })
        .update({ code: fromCode, name_ar: LEGACY_NAMES[systemKey], updated_at: db.fn.now() });
    }
  }
}
