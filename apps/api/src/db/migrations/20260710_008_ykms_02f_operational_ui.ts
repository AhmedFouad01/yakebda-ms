import { Knex } from "knex";
import { syncPermissionCatalog } from "../seedData";

/**
 * YKMS-02F — Operational UI completion prerequisites.
 * 1) Kitchen flow timestamps: المصدر الحقيقي لمؤقت المطبخ الجاري —
 *    لا نخزن "دقائق منقضية" أبدًا؛ نشتق الزمن من timestamps.
 * 2) RBAC healing: مزامنة كتالوج الصلاحيات ومنح owner/admin كل الصلاحيات —
 *    يعالج قواعد بيانات قديمة زُرعت قبل إضافة settings.manage وأخواتها
 *    (سبب ظهور «الإعدادات مقفولة» للمالك على بيئات قديمة) دون أي فقد للبيانات.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.timestamp("in_kitchen_at").nullable();
    t.timestamp("ready_at").nullable();
    t.timestamp("cancelled_at").nullable();
  });

  // Backfill تقريبي للطلبات القديمة الجارية حتى لا يظهر مؤقت فارغ:
  await db("orders").where({ status: "in_kitchen" }).whereNull("in_kitchen_at").update({ in_kitchen_at: db.ref("submitted_at") });
  await db("orders").where({ status: "ready" }).whereNull("ready_at").update({ ready_at: db.ref("updated_at") });

  await syncPermissionCatalog(db);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.dropColumn("cancelled_at");
    t.dropColumn("ready_at");
    t.dropColumn("in_kitchen_at");
  });
  // مزامنة الصلاحيات علاجية — لا تُسترجع.
}
