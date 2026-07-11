import * as XLSX from "xlsx";
import { Knex } from "knex";

/**
 * YKMS-02G — خدمة استيراد/تصدير المنيو عبر Excel.
 * - تصدير كل الأصناف إلى ورقة عمل واحدة.
 * - قالب فارغ للتنزيل مع صف تعليمات.
 * - استيراد مع dry-run: تحقق صف-بصف، أخطاء لكل صف، مطابقة بالـ SKU أولًا.
 * لا كتابة صامتة: dry-run يعرض ماذا سيحدث، ثم apply يكتب فعليًا.
 */

// أعمدة الملف (عربية العناوين لسهولة الاستخدام) → مفاتيح داخلية
export const COLUMNS: Array<{ header: string; key: string }> = [
  { header: "معرف الصنف", key: "id" },
  { header: "الاسم بالعربية", key: "name_ar" },
  { header: "الاسم بالإنجليزية", key: "name_en" },
  { header: "SKU", key: "sku" },
  { header: "الفئة", key: "category" },
  { header: "السعر", key: "base_price" },
  { header: "نشط", key: "is_active" },
  { header: "ظاهر في الكاشير", key: "pos_visible" },
  { header: "قابل للخصم", key: "discountable" },
  { header: "زمن التحضير", key: "prep_time_minutes" },
  { header: "رابط الصورة", key: "image_url" },
  { header: "الوصف", key: "description_ar" },
  { header: "المكونات", key: "ingredients_ar" },
  { header: "الحجم/الحصة", key: "portion_note_ar" },
];

const HEADER_TO_KEY: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.header, c.key]));

export interface ExportRow {
  id: string;
  name_ar: string;
  name_en?: string | null;
  sku?: string | null;
  category: string;
  base_price: number;
  is_active: boolean;
  pos_visible: boolean;
  discountable: boolean;
  prep_time_minutes: number;
  image_url?: string | null;
  description_ar?: string | null;
  ingredients_ar?: string | null;
  portion_note_ar?: string | null;
}

function boolAr(v: boolean): string {
  return v ? "نعم" : "لا";
}

function parseBool(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["نعم", "yes", "true", "1", "y"].includes(s)) return true;
  if (["لا", "no", "false", "0", "n"].includes(s)) return false;
  return null;
}

/** يبني workbook من صفوف التصدير. */
export function buildWorkbook(rows: ExportRow[]): Buffer {
  const aoa: (string | number)[][] = [COLUMNS.map((c) => c.header)];
  for (const r of rows) {
    aoa.push([
      r.id,
      r.name_ar,
      r.name_en ?? "",
      r.sku ?? "",
      r.category,
      r.base_price,
      boolAr(r.is_active),
      boolAr(r.pos_visible),
      boolAr(r.discountable),
      r.prep_time_minutes,
      r.image_url ?? "",
      r.description_ar ?? "",
      r.ingredients_ar ?? "",
      r.portion_note_ar ?? "",
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = COLUMNS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المنيو");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** قالب فارغ بصف تعليمات واحد. */
export function buildTemplate(): Buffer {
  const example: ExportRow = {
    id: "",
    name_ar: "ساندوتش كبدة",
    name_en: "Liver Sandwich",
    sku: "SAN-KBD",
    category: "ساندوتشات",
    base_price: 25,
    is_active: true,
    pos_visible: true,
    discountable: true,
    prep_time_minutes: 8,
    image_url: "",
    description_ar: "",
    ingredients_ar: "كبدة، خبز، بهارات",
    portion_note_ar: "لقمة / هامر",
  };
  return buildWorkbook([example]);
}

export interface ParsedRow {
  row: number; // رقم الصف في الملف (يبدأ من 2 بعد العنوان)
  id?: string;
  name_ar?: string;
  name_en?: string | null;
  sku?: string | null;
  category?: string;
  base_price?: number;
  is_active?: boolean | null;
  pos_visible?: boolean | null;
  discountable?: boolean | null;
  prep_time_minutes?: number | null;
  image_url?: string | null;
  description_ar?: string | null;
  ingredients_ar?: string | null;
  portion_note_ar?: string | null;
}

/** يحوّل ملف Excel إلى صفوف موحّدة. */
export function parseWorkbook(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return raw.map((obj, idx) => {
    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(obj)) {
      const key = HEADER_TO_KEY[header.trim()];
      if (key) mapped[key] = value;
    }
    const num = (v: unknown): number | undefined => {
      if (v === "" || v == null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const str = (v: unknown): string | undefined => {
      const s = v == null ? "" : String(v).trim();
      return s === "" ? undefined : s;
    };
    return {
      row: idx + 2,
      id: str(mapped.id),
      name_ar: str(mapped.name_ar),
      name_en: str(mapped.name_en) ?? null,
      sku: str(mapped.sku) ?? null,
      category: str(mapped.category),
      base_price: num(mapped.base_price),
      is_active: parseBool(mapped.is_active),
      pos_visible: parseBool(mapped.pos_visible),
      discountable: parseBool(mapped.discountable),
      prep_time_minutes: num(mapped.prep_time_minutes) ?? null,
      image_url: str(mapped.image_url) ?? null,
      description_ar: str(mapped.description_ar) ?? null,
      ingredients_ar: str(mapped.ingredients_ar) ?? null,
      portion_note_ar: str(mapped.portion_note_ar) ?? null,
    };
  });
}

export interface RowPlan {
  row: number;
  name_ar: string;
  sku: string | null;
  action: "create" | "update" | "error";
  matched_by: "id" | "sku" | null;
  errors: string[];
}

export interface ImportPlan {
  rows: RowPlan[];
  summary: { created: number; updated: number; failed: number; total: number };
}

/**
 * يبني خطة الاستيراد (dry-run) بمطابقة: id ثابت أولًا ثم SKU.
 * لا يطابق بالاسم تلقائيًا (يُعتبر create مع تحذير ضمني في UI).
 */
export async function planImport(db: Knex, accountId: string, rows: ParsedRow[]): Promise<ImportPlan> {
  const plan: RowPlan[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const r of rows) {
    const errors: string[] = [];
    if (!r.name_ar) errors.push("الاسم بالعربية مطلوب");
    if (!r.category) errors.push("الفئة مطلوبة");
    if (r.base_price == null || r.base_price < 0) errors.push("السعر غير صالح");

    let matchedBy: "id" | "sku" | null = null;
    let existing: { id: string } | undefined;
    if (r.id) {
      existing = await db("products").where({ account_id: accountId, id: r.id }).first();
      if (existing) matchedBy = "id";
    }
    if (!existing && r.sku) {
      existing = await db("products").where({ account_id: accountId, sku: r.sku }).first();
      if (existing) matchedBy = "sku";
    }

    if (errors.length) {
      failed++;
      plan.push({ row: r.row, name_ar: r.name_ar ?? "", sku: r.sku ?? null, action: "error", matched_by: matchedBy, errors });
    } else if (existing) {
      updated++;
      plan.push({ row: r.row, name_ar: r.name_ar!, sku: r.sku ?? null, action: "update", matched_by: matchedBy, errors: [] });
    } else {
      created++;
      plan.push({ row: r.row, name_ar: r.name_ar!, sku: r.sku ?? null, action: "create", matched_by: null, errors: [] });
    }
  }

  return { rows: plan, summary: { created, updated, failed, total: rows.length } };
}

/** يطبّق الاستيراد فعليًا داخل معاملة. الصفوف ذات الأخطاء تُتخطّى. */
export async function applyImport(
  db: Knex,
  accountId: string,
  rows: ParsedRow[],
  findOrCreateCategory: (trx: Knex.Transaction, accountId: string, name: string) => Promise<string>,
  newId: () => string
): Promise<{ created: number; updated: number; skipped: number; failed: number; total: number }> {
  return db.transaction(async (trx) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of rows) {
      if (!r.name_ar || !r.category || r.base_price == null || r.base_price < 0) {
        failed++;
        continue;
      }
      const categoryId = await findOrCreateCategory(trx, accountId, r.category);
      const data: Record<string, unknown> = {
        category_id: categoryId,
        name_ar: r.name_ar,
        name_en: r.name_en ?? null,
        sku: r.sku ?? null,
        base_price: r.base_price,
        description_ar: r.description_ar ?? null,
        image_url: r.image_url ?? null,
        ingredients_ar: r.ingredients_ar ?? null,
        portion_note_ar: r.portion_note_ar ?? null,
        prep_time_minutes: r.prep_time_minutes ?? 0,
      };
      if (r.is_active != null) data.is_active = r.is_active;
      if (r.pos_visible != null) data.pos_visible = r.pos_visible;
      if (r.discountable != null) data.discountable = r.discountable;

      let existing: { id: string } | undefined;
      if (r.id) existing = await trx("products").where({ account_id: accountId, id: r.id }).first();
      if (!existing && r.sku) existing = await trx("products").where({ account_id: accountId, sku: r.sku }).first();

      if (existing) {
        await trx("products").where({ id: existing.id }).update({ ...data, updated_at: trx.fn.now() });
        updated++;
      } else {
        await trx("products").insert({ id: newId(), account_id: accountId, ...data });
        created++;
      }
    }

    return { created, updated, skipped, failed, total: rows.length };
  });
}
