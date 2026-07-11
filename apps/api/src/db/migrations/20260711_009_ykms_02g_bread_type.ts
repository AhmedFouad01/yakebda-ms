import { Knex } from "knex";
import { seedBreadGroups } from "../seedData";

/**
 * YKMS-02G — نوع العيش كخيار مُنظَّم (لا استنتاج من النص).
 * يعتمد على seedBreadGroups المشتركة (idempotent) — تعالج الحسابات القائمة.
 * الحسابات الجديدة تُهيّأ عبر seedFoundation.
 */
export async function up(db: Knex): Promise<void> {
  const accounts = await db("accounts").pluck("id");
  for (const accountId of accounts) {
    await seedBreadGroups(db, accountId);
  }
}

export async function down(db: Knex): Promise<void> {
  const groups = await db("modifier_groups").whereIn("name_ar", ["نوع العيش", "نوع العيش (حواوشي)"]).pluck("id");
  if (!groups.length) return;
  const modifiers = await db("modifiers").whereIn("modifier_group_id", groups).pluck("id");
  // لا نحذف مُعدِّلات مستخدمة في طلبات تاريخية (FK order_item_modifiers) — نزيل الروابط فقط.
  const used = modifiers.length
    ? await db("order_item_modifiers").whereIn("modifier_id", modifiers).pluck("modifier_id")
    : [];
  const usedSet = new Set(used);
  await db("product_modifier_groups").whereIn("modifier_group_id", groups).del();
  const deletable = modifiers.filter((id) => !usedSet.has(id));
  if (deletable.length) await db("modifiers").whereIn("id", deletable).del();
  // مجموعات بلا مُعدِّلات مستخدمة تُحذف؛ غيرها يبقى حفاظًا على السجل.
  const stillReferenced = await db("modifiers").whereIn("modifier_group_id", groups).pluck("modifier_group_id");
  const groupsToDrop = groups.filter((g) => !stillReferenced.includes(g));
  if (groupsToDrop.length) await db("modifier_groups").whereIn("id", groupsToDrop).del();
}
