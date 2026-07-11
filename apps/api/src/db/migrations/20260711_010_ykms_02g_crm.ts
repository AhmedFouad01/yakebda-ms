import { Knex } from "knex";

/**
 * YKMS-02G-D — أساس CRM للعملاء.
 * حقول إضافية آمنة (nullable) لملف العميل + جاهزية الولاء/التسويق دون بناء محرك ولاء.
 * العناوين المتعددة تُخزَّن كـ JSON مبدئيًا (addresses) مع بقاء address القديم للتوافق.
 */
export async function up(db: Knex): Promise<void> {
  const hasCol = async (col: string) => db.schema.hasColumn("customers", col);

  await db.schema.alterTable("customers", (t) => {
    t.string("alt_phone").nullable();
    t.string("email").nullable();
    t.date("birthday").nullable();
    t.string("gender").nullable(); // male | female | null
    t.string("preferred_language").nullable().defaultTo("ar");
    t.jsonb("addresses").nullable(); // [{label, area, landmark, floor, notes, is_default}]
    t.string("preferred_order_type").nullable(); // takeaway | delivery
    t.string("preferred_payment_method").nullable(); // cash | card | wallet
    // جاهزية الولاء/التسويق (placeholders — لا محرك فعلي)
    t.integer("loyalty_points").notNullable().defaultTo(0);
    t.string("loyalty_tier").nullable();
    t.boolean("marketing_opt_in").notNullable().defaultTo(false);
    t.boolean("sms_opt_in").notNullable().defaultTo(false);
    t.boolean("whatsapp_opt_in").notNullable().defaultTo(false);
    // تشغيل
    t.boolean("is_blocked").notNullable().defaultTo(false);
    t.text("block_reason").nullable();
    t.boolean("is_vip").notNullable().defaultTo(false);
    t.text("tags").nullable(); // وسوم مفصولة بفواصل
    t.text("allergy_note").nullable();
    t.text("delivery_instructions").nullable();
  });

  // فهرس للبريد للبحث السريع
  await db.schema.alterTable("customers", (t) => {
    t.index(["email"]);
  });

  void hasCol;
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("customers", (t) => {
    t.dropColumn("alt_phone");
    t.dropColumn("email");
    t.dropColumn("birthday");
    t.dropColumn("gender");
    t.dropColumn("preferred_language");
    t.dropColumn("addresses");
    t.dropColumn("preferred_order_type");
    t.dropColumn("preferred_payment_method");
    t.dropColumn("loyalty_points");
    t.dropColumn("loyalty_tier");
    t.dropColumn("marketing_opt_in");
    t.dropColumn("sms_opt_in");
    t.dropColumn("whatsapp_opt_in");
    t.dropColumn("is_blocked");
    t.dropColumn("block_reason");
    t.dropColumn("is_vip");
    t.dropColumn("tags");
    t.dropColumn("allergy_note");
    t.dropColumn("delivery_instructions");
  });
}
