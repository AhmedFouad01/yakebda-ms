import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const at = (relative) => path.join(root, ...relative.split("/"));
const read = (relative) => fs.readFileSync(at(relative), "utf8");
const write = (relative, content) => {
  fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
  fs.writeFileSync(at(relative), content, "utf8");
};

function replaceOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  if (first < 0) throw new Error("Missing patch target: " + label);
  if (content.indexOf(search, first + search.length) >= 0) {
    throw new Error("Ambiguous patch target: " + label);
  }
  return content.slice(0, first) + replacement + content.slice(first + search.length);
}

function replaceRegexOnce(content, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const matches = [...content.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) {
    throw new Error("Expected one regex target for " + label + "; found " + matches.length);
  }
  return content.replace(regex, replacement);
}

function appendBeforeClosingDiv(content, addition) {
  const marker = "</div>";
  const index = content.lastIndexOf(marker);
  return index >= 0
    ? content.slice(0, index) + addition + "\n\n" + content.slice(index)
    : content + addition;
}

write("apps/api/src/db/migrations/20260712_013_order_sources_price_lists.ts", "import { randomUUID } from \"crypto\";\nimport { Knex } from \"knex\";\n\n/**\n * YKMS-02H — Order sources and source-specific product rules.\n *\n * A source is an operational sales channel (counter, phone, app, aggregator).\n * Products remain canonical; sources only store availability and price overrides.\n */\nexport async function up(db: Knex): Promise<void> {\n  await db.schema.createTable(\"order_sources\", (t) => {\n    t.uuid(\"id\").primary();\n    t.uuid(\"account_id\").notNullable().references(\"accounts.id\").onDelete(\"CASCADE\");\n    t.string(\"code\").notNullable();\n    t.string(\"name_ar\").notNullable();\n    t.boolean(\"is_active\").notNullable().defaultTo(true);\n    t.boolean(\"supports_takeaway\").notNullable().defaultTo(true);\n    t.boolean(\"supports_delivery\").notNullable().defaultTo(true);\n    t.integer(\"sort_order\").notNullable().defaultTo(0);\n    t.timestamps(true, true);\n    t.unique([\"account_id\", \"code\"]);\n    t.index([\"account_id\", \"is_active\", \"sort_order\"]);\n  });\n\n  await db.schema.createTable(\"source_product_rules\", (t) => {\n    t.uuid(\"source_id\").notNullable().references(\"order_sources.id\").onDelete(\"CASCADE\");\n    t.uuid(\"product_id\").notNullable().references(\"products.id\").onDelete(\"CASCADE\");\n    t.decimal(\"price_override\", 10, 2).nullable();\n    t.boolean(\"is_available\").notNullable().defaultTo(true);\n    t.timestamps(true, true);\n    t.primary([\"source_id\", \"product_id\"]);\n    t.index([\"product_id\"]);\n  });\n\n  await db.schema.alterTable(\"orders\", (t) => {\n    t.uuid(\"source_id\").nullable().references(\"order_sources.id\").onDelete(\"SET NULL\");\n    t.string(\"source_name_snapshot\").nullable();\n    t.index([\"source_id\"]);\n  });\n\n  const accounts = await db(\"accounts\").select(\"id\");\n  for (const account of accounts) {\n    await db(\"order_sources\")\n      .insert({\n        id: randomUUID(),\n        account_id: account.id,\n        code: \"direct\",\n        name_ar: \"طلب مباشر\",\n        is_active: true,\n        supports_takeaway: true,\n        supports_delivery: true,\n        sort_order: 0,\n      })\n      .onConflict([\"account_id\", \"code\"])\n      .ignore();\n  }\n}\n\nexport async function down(db: Knex): Promise<void> {\n  await db.schema.alterTable(\"orders\", (t) => {\n    t.dropIndex([\"source_id\"]);\n    t.dropColumn(\"source_name_snapshot\");\n    t.dropColumn(\"source_id\");\n  });\n  await db.schema.dropTableIfExists(\"source_product_rules\");\n  await db.schema.dropTableIfExists(\"order_sources\");\n}\n");

write("apps/api/src/modules/orderSources.ts", "import { Router } from \"express\";\nimport { Knex } from \"knex\";\nimport { z } from \"zod\";\nimport { err } from \"../lib/errors\";\nimport { newId } from \"../lib/ids\";\nimport { writeAudit } from \"../lib/audit\";\nimport { requirePermission, requireUser } from \"../middleware/auth\";\nimport { ar } from \"../i18n/ar\";\n\nexport interface OrderSourceRow {\n  id: string;\n  account_id: string;\n  code: string;\n  name_ar: string;\n  is_active: boolean;\n  supports_takeaway: boolean;\n  supports_delivery: boolean;\n  sort_order: number;\n}\n\nconst sourceSchema = z\n  .object({\n    name_ar: z.string().trim().min(1).max(120),\n    is_active: z.boolean().default(true),\n    supports_takeaway: z.boolean().default(true),\n    supports_delivery: z.boolean().default(true),\n    sort_order: z.number().int().default(0),\n    copy_from_source_id: z.string().uuid().optional().nullable(),\n  })\n  .refine((value) => value.supports_takeaway || value.supports_delivery, {\n    message: \"يجب تفعيل نوع طلب واحد على الأقل\",\n    path: [\"supports_takeaway\"],\n  });\n\nconst sourcePatchSchema = sourceSchema\n  .omit({ copy_from_source_id: true })\n  .partial()\n  .refine(\n    (value) =>\n      value.supports_takeaway === undefined ||\n      value.supports_delivery === undefined ||\n      value.supports_takeaway ||\n      value.supports_delivery,\n    { message: \"يجب تفعيل نوع طلب واحد على الأقل\", path: [\"supports_takeaway\"] }\n  );\n\nconst menuRulesSchema = z.object({\n  items: z.array(\n    z.object({\n      product_id: z.string().uuid(),\n      price_override: z.number().nonnegative().nullable(),\n      is_available: z.boolean(),\n    })\n  ),\n});\n\nexport function sourceSupportsOrderType(source: OrderSourceRow, orderType: string): boolean {\n  if (orderType === \"takeaway\") return source.supports_takeaway;\n  if (orderType === \"delivery\") return source.supports_delivery;\n  // Dine-in is a legacy/non-channel flow. Keep it compatible with the direct source.\n  return source.code === \"direct\";\n}\n\nexport async function ensureDefaultOrderSource(db: Knex, accountId: string): Promise<OrderSourceRow> {\n  const existing = await db<OrderSourceRow>(\"order_sources\")\n    .where({ account_id: accountId, code: \"direct\" })\n    .first();\n  if (existing) return existing;\n\n  const id = newId();\n  await db(\"order_sources\").insert({\n    id,\n    account_id: accountId,\n    code: \"direct\",\n    name_ar: \"طلب مباشر\",\n    is_active: true,\n    supports_takeaway: true,\n    supports_delivery: true,\n    sort_order: 0,\n  });\n  return (await db<OrderSourceRow>(\"order_sources\").where({ id }).first())!;\n}\n\nexport async function resolveOrderSource(\n  db: Knex,\n  accountId: string,\n  sourceId: string | null | undefined,\n  orderType: string\n): Promise<OrderSourceRow> {\n  const source = sourceId\n    ? await db<OrderSourceRow>(\"order_sources\")\n        .where({ id: sourceId, account_id: accountId, is_active: true })\n        .first()\n    : await ensureDefaultOrderSource(db, accountId);\n\n  if (!source) throw err.validation({ source_id: \"مصدر الطلب غير متاح\" });\n  if (!sourceSupportsOrderType(source, orderType)) {\n    throw err.validation({ source_id: \"مصدر الطلب لا يدعم نوع الطلب المحدد\" });\n  }\n  return source;\n}\n\nexport function orderSourceRoutes(db: Knex): Router {\n  const router = Router();\n  router.use(requireUser(db));\n\n  router.get(\"/\", async (req, res, next) => {\n    try {\n      const query = z\n        .object({\n          active_only: z.enum([\"true\", \"false\"]).optional(),\n          order_type: z.enum([\"takeaway\", \"delivery\"]).optional(),\n        })\n        .safeParse(req.query);\n      if (!query.success) throw err.validation(query.error.flatten());\n\n      const canManage = req.user!.permissions.includes(\"settings.manage\");\n      const activeOnly = !canManage || query.data.active_only !== \"false\";\n      let rows = await db<OrderSourceRow>(\"order_sources\")\n        .where({ account_id: req.user!.accountId })\n        .modify((builder) => {\n          if (activeOnly) builder.where(\"is_active\", true);\n        })\n        .orderBy([{ column: \"sort_order\", order: \"asc\" }, { column: \"name_ar\", order: \"asc\" }]);\n\n      if (query.data.order_type) {\n        rows = rows.filter((source) => sourceSupportsOrderType(source, query.data.order_type!));\n      }\n      res.json({ data: rows });\n    } catch (error) {\n      next(error);\n    }\n  });\n\n  router.post(\"/\", requirePermission(\"settings.manage\"), async (req, res, next) => {\n    try {\n      const parsed = sourceSchema.safeParse(req.body);\n      if (!parsed.success) throw err.validation(parsed.error.flatten());\n      const input = parsed.data;\n      const accountId = req.user!.accountId;\n\n      let copySource: OrderSourceRow | undefined;\n      if (input.copy_from_source_id) {\n        copySource = await db<OrderSourceRow>(\"order_sources\")\n          .where({ id: input.copy_from_source_id, account_id: accountId })\n          .first();\n        if (!copySource) throw err.notFound();\n      }\n\n      const id = newId();\n      await db.transaction(async (trx) => {\n        await trx(\"order_sources\").insert({\n          id,\n          account_id: accountId,\n          code: \"source-\" + id.slice(0, 8),\n          name_ar: input.name_ar,\n          is_active: input.is_active,\n          supports_takeaway: input.supports_takeaway,\n          supports_delivery: input.supports_delivery,\n          sort_order: input.sort_order,\n        });\n        if (copySource) {\n          const rules = await trx(\"source_product_rules\").where({ source_id: copySource.id });\n          if (rules.length) {\n            await trx(\"source_product_rules\").insert(\n              rules.map((rule) => ({\n                source_id: id,\n                product_id: rule.product_id,\n                price_override: rule.price_override,\n                is_available: rule.is_available,\n              }))\n            );\n          }\n        }\n      });\n\n      await writeAudit(db, {\n        accountId,\n        userId: req.user!.id,\n        action: \"order_source.create\",\n        entityType: \"order_source\",\n        entityId: id,\n        meta: { name_ar: input.name_ar, copied_from: copySource?.id ?? null },\n        ip: req.ip,\n      });\n      res.status(201).json({\n        data: await db(\"order_sources\").where({ id }).first(),\n        message: ar.messages.created,\n      });\n    } catch (error) {\n      next(error);\n    }\n  });\n\n  router.patch(\"/:id\", requirePermission(\"settings.manage\"), async (req, res, next) => {\n    try {\n      const parsed = sourcePatchSchema.safeParse(req.body);\n      if (!parsed.success) throw err.validation(parsed.error.flatten());\n      const source = await db<OrderSourceRow>(\"order_sources\")\n        .where({ id: req.params.id, account_id: req.user!.accountId })\n        .first();\n      if (!source) throw err.notFound();\n\n      const next = { ...source, ...parsed.data };\n      if (!next.supports_takeaway && !next.supports_delivery) {\n        throw err.validation({ supports_takeaway: \"يجب تفعيل نوع طلب واحد على الأقل\" });\n      }\n      await db(\"order_sources\")\n        .where({ id: source.id })\n        .update({ ...parsed.data, updated_at: db.fn.now() });\n\n      await writeAudit(db, {\n        accountId: req.user!.accountId,\n        userId: req.user!.id,\n        action: \"order_source.update\",\n        entityType: \"order_source\",\n        entityId: source.id,\n        meta: parsed.data,\n        ip: req.ip,\n      });\n      res.json({\n        data: await db(\"order_sources\").where({ id: source.id }).first(),\n        message: ar.messages.updated,\n      });\n    } catch (error) {\n      next(error);\n    }\n  });\n\n  router.get(\"/:id/menu\", requirePermission(\"settings.manage\"), async (req, res, next) => {\n    try {\n      const source = await db<OrderSourceRow>(\"order_sources\")\n        .where({ id: req.params.id, account_id: req.user!.accountId })\n        .first();\n      if (!source) throw err.notFound();\n\n      const [products, rules] = await Promise.all([\n        db(\"products as p\")\n          .join(\"categories as c\", \"c.id\", \"p.category_id\")\n          .where({ \"p.account_id\": req.user!.accountId, \"p.is_active\": true })\n          .orderBy([{ column: \"c.sort_order\", order: \"asc\" }, { column: \"p.sort_order\", order: \"asc\" }])\n          .select(\"p.id\", \"p.name_ar\", \"p.base_price\", \"p.image_url\", \"c.name_ar as category_name_ar\"),\n        db(\"source_product_rules\").where({ source_id: source.id }),\n      ]);\n      const byProduct = new Map(rules.map((rule) => [rule.product_id, rule]));\n      res.json({\n        data: {\n          source,\n          products: products.map((product) => {\n            const rule = byProduct.get(product.id);\n            return {\n              ...product,\n              price_override: rule?.price_override == null ? null : Number(rule.price_override),\n              is_available: rule?.is_available ?? true,\n            };\n          }),\n        },\n      });\n    } catch (error) {\n      next(error);\n    }\n  });\n\n  router.put(\"/:id/menu\", requirePermission(\"settings.manage\"), async (req, res, next) => {\n    try {\n      const parsed = menuRulesSchema.safeParse(req.body);\n      if (!parsed.success) throw err.validation(parsed.error.flatten());\n      const source = await db<OrderSourceRow>(\"order_sources\")\n        .where({ id: req.params.id, account_id: req.user!.accountId })\n        .first();\n      if (!source) throw err.notFound();\n\n      const productIds = [...new Set(parsed.data.items.map((item) => item.product_id))];\n      const owned = productIds.length\n        ? await db(\"products\").whereIn(\"id\", productIds).where({ account_id: req.user!.accountId }).pluck(\"id\")\n        : [];\n      if (owned.length !== productIds.length) throw err.notFound();\n\n      await db.transaction(async (trx) => {\n        for (const item of parsed.data.items) {\n          if (item.price_override == null && item.is_available) {\n            await trx(\"source_product_rules\")\n              .where({ source_id: source.id, product_id: item.product_id })\n              .del();\n          } else {\n            await trx(\"source_product_rules\")\n              .insert({\n                source_id: source.id,\n                product_id: item.product_id,\n                price_override: item.price_override,\n                is_available: item.is_available,\n              })\n              .onConflict([\"source_id\", \"product_id\"])\n              .merge({\n                price_override: item.price_override,\n                is_available: item.is_available,\n                updated_at: trx.fn.now(),\n              });\n          }\n        }\n      });\n\n      await writeAudit(db, {\n        accountId: req.user!.accountId,\n        userId: req.user!.id,\n        action: \"order_source.menu_update\",\n        entityType: \"order_source\",\n        entityId: source.id,\n        meta: { products: parsed.data.items.length },\n        ip: req.ip,\n      });\n      res.json({ message: ar.messages.updated });\n    } catch (error) {\n      next(error);\n    }\n  });\n\n  return router;\n}\n");

write("apps/admin/src/pages/settings/SourcesSection.tsx", "import { useEffect, useMemo, useState } from \"react\";\nimport { api } from \"../../lib/api\";\nimport {\n  Button,\n  EmptyState,\n  LoadingState,\n  SectionCard,\n  Select,\n  TextInput,\n  ToggleSwitch,\n} from \"../../components/ui/primitives\";\nimport { toast } from \"../../components/ui/overlays\";\n\ninterface OrderSource {\n  id: string;\n  code: string;\n  name_ar: string;\n  is_active: boolean;\n  supports_takeaway: boolean;\n  supports_delivery: boolean;\n  sort_order: number;\n}\n\ninterface SourceProduct {\n  id: string;\n  name_ar: string;\n  category_name_ar: string;\n  base_price: string | number;\n  image_url?: string | null;\n  price_override: number | null;\n  is_available: boolean;\n}\n\nexport function SourcesSection({ editable }: { editable: boolean }) {\n  const [sources, setSources] = useState<OrderSource[]>([]);\n  const [selectedId, setSelectedId] = useState(\"\");\n  const [products, setProducts] = useState<SourceProduct[]>([]);\n  const [newName, setNewName] = useState(\"\");\n  const [copyFrom, setCopyFrom] = useState(\"\");\n  const [search, setSearch] = useState(\"\");\n  const [loading, setLoading] = useState(true);\n  const [menuLoading, setMenuLoading] = useState(false);\n  const [saving, setSaving] = useState(false);\n  const [error, setError] = useState(\"\");\n\n  const selected = sources.find((source) => source.id === selectedId) ?? null;\n\n  async function loadSources(preferredId?: string) {\n    setLoading(true);\n    setError(\"\");\n    try {\n      const response = await api<{ data: OrderSource[] }>(\"/order-sources?active_only=false\");\n      setSources(response.data);\n      const nextId = preferredId ?? selectedId ?? response.data[0]?.id ?? \"\";\n      setSelectedId(response.data.some((source) => source.id === nextId) ? nextId : response.data[0]?.id ?? \"\");\n    } catch (e: any) {\n      setError(e.message);\n    } finally {\n      setLoading(false);\n    }\n  }\n\n  async function loadMenu(sourceId: string) {\n    if (!sourceId) {\n      setProducts([]);\n      return;\n    }\n    setMenuLoading(true);\n    setError(\"\");\n    try {\n      const response = await api<{ data: { products: SourceProduct[] } }>(\"/order-sources/\" + sourceId + \"/menu\");\n      setProducts(response.data.products);\n    } catch (e: any) {\n      setError(e.message);\n    } finally {\n      setMenuLoading(false);\n    }\n  }\n\n  useEffect(() => {\n    void loadSources();\n  }, []);\n\n  useEffect(() => {\n    void loadMenu(selectedId);\n  }, [selectedId]);\n\n  const filteredProducts = useMemo(() => {\n    const value = search.trim();\n    if (!value) return products;\n    return products.filter(\n      (product) => product.name_ar.includes(value) || product.category_name_ar.includes(value)\n    );\n  }, [products, search]);\n\n  function patchSelected(patch: Partial<OrderSource>) {\n    if (!selectedId) return;\n    setSources((rows) => rows.map((source) => (source.id === selectedId ? { ...source, ...patch } : source)));\n  }\n\n  async function createSource() {\n    if (!newName.trim()) return;\n    setSaving(true);\n    setError(\"\");\n    try {\n      const response = await api<{ data: OrderSource }>(\"/order-sources\", {\n        method: \"POST\",\n        body: {\n          name_ar: newName.trim(),\n          is_active: true,\n          supports_takeaway: true,\n          supports_delivery: true,\n          sort_order: sources.length,\n          copy_from_source_id: copyFrom || null,\n        },\n      });\n      setNewName(\"\");\n      setCopyFrom(\"\");\n      await loadSources(response.data.id);\n      toast(\"تم إنشاء المصدر\");\n    } catch (e: any) {\n      setError(e.message);\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  async function saveSource() {\n    if (!selected) return;\n    setSaving(true);\n    setError(\"\");\n    try {\n      await api(\"/order-sources/\" + selected.id, {\n        method: \"PATCH\",\n        body: {\n          name_ar: selected.name_ar,\n          is_active: selected.is_active,\n          supports_takeaway: selected.supports_takeaway,\n          supports_delivery: selected.supports_delivery,\n          sort_order: selected.sort_order,\n        },\n      });\n      await loadSources(selected.id);\n      toast(\"تم حفظ إعدادات المصدر\");\n    } catch (e: any) {\n      setError(e.message);\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  async function saveMenu() {\n    if (!selected) return;\n    setSaving(true);\n    setError(\"\");\n    try {\n      await api(\"/order-sources/\" + selected.id + \"/menu\", {\n        method: \"PUT\",\n        body: {\n          items: products.map((product) => ({\n            product_id: product.id,\n            price_override: product.price_override,\n            is_available: product.is_available,\n          })),\n        },\n      });\n      await loadMenu(selected.id);\n      toast(\"تم حفظ أسعار وإتاحة المصدر\");\n    } catch (e: any) {\n      setError(e.message);\n    } finally {\n      setSaving(false);\n    }\n  }\n\n  if (loading) return <LoadingState label=\"جارٍ تحميل المصادر…\" />;\n\n  return (\n    <div className=\"sources-section\">\n      <SectionCard\n        title=\"المصادر\"\n        hint=\"منيو واحدة أساسية؛ كل مصدر يحدد الإتاحة والسعر الخاص به بدون تكرار الأصناف.\"\n      >\n        {error && <div className=\"alert\">{error}</div>}\n        {editable && (\n          <div className=\"source-create\">\n            <label className=\"source-field\">\n              <span>اسم المصدر الجديد</span>\n              <TextInput\n                placeholder=\"مثال: طلبات الهاتف\"\n                value={newName}\n                onChange={(event) => setNewName(event.target.value)}\n              />\n            </label>\n            <label className=\"source-field\">\n              <span>نسخ الإعدادات من</span>\n              <Select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)}>\n                <option value=\"\">المنيو الأساسية — بدون أسعار مخصصة</option>\n                {sources.map((source) => (\n                  <option key={source.id} value={source.id}>{source.name_ar}</option>\n                ))}\n              </Select>\n            </label>\n            <Button variant=\"primary\" disabled={!newName.trim() || saving} onClick={createSource}>\n              إضافة مصدر\n            </Button>\n          </div>\n        )}\n\n        <div className=\"source-picker\" role=\"list\" aria-label=\"مصادر الطلب\">\n          {sources.map((source) => (\n            <button\n              key={source.id}\n              type=\"button\"\n              className={\"source-picker-card\" + (selectedId === source.id ? \" active\" : \"\")}\n              aria-pressed={selectedId === source.id}\n              onClick={() => setSelectedId(source.id)}\n            >\n              <strong>{source.name_ar}</strong>\n              <span>{source.is_active ? \"نشط\" : \"موقوف\"}</span>\n              <small>\n                {source.supports_takeaway ? \"تيك أواي\" : \"\"}\n                {source.supports_takeaway && source.supports_delivery ? \" + \" : \"\"}\n                {source.supports_delivery ? \"دليفري\" : \"\"}\n              </small>\n            </button>\n          ))}\n        </div>\n      </SectionCard>\n\n      {!selected && <EmptyState message=\"أضف مصدرًا للبدء.\" />}\n\n      {selected && (\n        <>\n          <SectionCard title={\"إعدادات المصدر — \" + selected.name_ar}>\n            <div className=\"source-settings-grid\">\n              <label className=\"source-field\">\n                <span>اسم المصدر</span>\n                <TextInput\n                  disabled={!editable}\n                  value={selected.name_ar}\n                  onChange={(event) => patchSelected({ name_ar: event.target.value })}\n                />\n              </label>\n              <label className=\"source-field compact\">\n                <span>الترتيب</span>\n                <input\n                  className=\"uif-input uif-num\"\n                  type=\"number\"\n                  min={0}\n                  disabled={!editable}\n                  value={selected.sort_order}\n                  onChange={(event) => patchSelected({ sort_order: Number(event.target.value) })}\n                />\n              </label>\n              <ToggleSwitch\n                checked={selected.is_active}\n                disabled={!editable || selected.code === \"direct\"}\n                label=\"المصدر نشط\"\n                onChange={(value) => patchSelected({ is_active: value })}\n              />\n              <ToggleSwitch\n                checked={selected.supports_takeaway}\n                disabled={!editable}\n                label=\"متاح للتيك أواي\"\n                onChange={(value) => patchSelected({ supports_takeaway: value })}\n              />\n              <ToggleSwitch\n                checked={selected.supports_delivery}\n                disabled={!editable}\n                label=\"متاح للدليفري\"\n                onChange={(value) => patchSelected({ supports_delivery: value })}\n              />\n            </div>\n            {editable && (\n              <div className=\"source-actions\">\n                <Button variant=\"primary\" disabled={saving || !selected.name_ar.trim()} onClick={saveSource}>\n                  حفظ إعدادات المصدر\n                </Button>\n              </div>\n            )}\n          </SectionCard>\n\n          <SectionCard\n            title=\"أسعار وإتاحة الأصناف\"\n            hint=\"اترك السعر فارغًا لاستخدام سعر الفرع أو السعر الأساسي.\"\n          >\n            <div className=\"source-menu-toolbar\">\n              <TextInput\n                placeholder=\"ابحث باسم الصنف أو القسم…\"\n                value={search}\n                onChange={(event) => setSearch(event.target.value)}\n              />\n              <span>{filteredProducts.length} صنف</span>\n              {editable && (\n                <Button variant=\"primary\" disabled={saving || menuLoading} onClick={saveMenu}>\n                  حفظ أسعار المصدر\n                </Button>\n              )}\n            </div>\n\n            {menuLoading ? (\n              <LoadingState label=\"جارٍ تحميل منيو المصدر…\" />\n            ) : (\n              <div className=\"source-product-list\">\n                {filteredProducts.map((product) => (\n                  <div key={product.id} className={\"source-product-row\" + (!product.is_available ? \" unavailable\" : \"\")}>\n                    <div className=\"source-product-copy\">\n                      <strong>{product.name_ar}</strong>\n                      <span>{product.category_name_ar}</span>\n                    </div>\n                    <div className=\"source-base-price\">\n                      <span>السعر الأساسي</span>\n                      <strong>{Number(product.base_price).toFixed(2)} ج.م</strong>\n                    </div>\n                    <label className=\"source-price-field\">\n                      <span>سعر المصدر</span>\n                      <input\n                        className=\"uif-input uif-num\"\n                        type=\"number\"\n                        min={0}\n                        step=\"0.01\"\n                        disabled={!editable}\n                        placeholder=\"استخدم الأساسي\"\n                        value={product.price_override ?? \"\"}\n                        onChange={(event) => {\n                          const value = event.target.value;\n                          setProducts((rows) =>\n                            rows.map((row) =>\n                              row.id === product.id\n                                ? { ...row, price_override: value === \"\" ? null : Number(value) }\n                                : row\n                            )\n                          );\n                        }}\n                      />\n                    </label>\n                    <ToggleSwitch\n                      checked={product.is_available}\n                      disabled={!editable}\n                      label=\"متاح\"\n                      onChange={(value) =>\n                        setProducts((rows) =>\n                          rows.map((row) => (row.id === product.id ? { ...row, is_available: value } : row))\n                        )\n                      }\n                    />\n                  </div>\n                ))}\n                {!filteredProducts.length && <EmptyState message=\"لا توجد أصناف مطابقة.\" />}\n              </div>\n            )}\n          </SectionCard>\n        </>\n      )}\n    </div>\n  );\n}\n");

write("apps/api/tests/order-sources.test.ts", "import { afterAll, beforeAll, describe, expect, it } from \"vitest\";\nimport request from \"supertest\";\nimport { createApp } from \"../src/app\";\nimport { config } from \"../src/config\";\nimport { makeKnex } from \"../src/db/knex\";\nimport { seedFoundation } from \"../src/db/seedData\";\nimport { newId } from \"../src/lib/ids\";\n\nconst db = makeKnex(config.testDatabaseUrl);\nlet app: ReturnType<typeof createApp>;\nlet token = \"\";\nlet branchId = \"\";\nlet productId = \"\";\nlet directSourceId = \"\";\nlet sourceId = \"\";\n\nconst auth = () => ({ Authorization: \"Bearer \" + token });\n\nfunction orderPayload(extra: Record<string, unknown> = {}) {\n  return {\n    branch_id: branchId,\n    source_id: sourceId,\n    order_type: \"takeaway\",\n    delivery_fee: 0,\n    discount: 0,\n    items: [{ product_id: productId, qty: 1, modifier_ids: [] }],\n    ...extra,\n  };\n}\n\nbeforeAll(async () => {\n  await db.migrate.rollback(undefined, true);\n  await db.migrate.latest();\n  const seed = await seedFoundation(db);\n  branchId = seed.branchId;\n  app = createApp(db);\n\n  const login = await request(app)\n    .post(\"/api/v1/auth/login\")\n    .send({ email: seed.ownerEmail, password: seed.ownerPassword });\n  token = login.body.token;\n\n  const categoryId = newId();\n  productId = newId();\n  await db(\"categories\").insert({\n    id: categoryId,\n    account_id: seed.accountId,\n    name_ar: \"مصادر الاختبار\",\n    sort_order: 80,\n    is_active: true,\n  });\n  await db(\"products\").insert({\n    id: productId,\n    account_id: seed.accountId,\n    category_id: categoryId,\n    name_ar: \"صنف مصدر\",\n    base_price: 30,\n    sort_order: 0,\n    is_active: true,\n  });\n\n  const sources = await request(app).get(\"/api/v1/order-sources?active_only=false\").set(auth());\n  directSourceId = sources.body.data.find((source: { code: string }) => source.code === \"direct\").id;\n\n  const created = await request(app)\n    .post(\"/api/v1/order-sources\")\n    .set(auth())\n    .send({\n      name_ar: \"طلبات الهاتف\",\n      supports_takeaway: true,\n      supports_delivery: false,\n      is_active: true,\n      sort_order: 1,\n      copy_from_source_id: directSourceId,\n    });\n  expect(created.status).toBe(201);\n  sourceId = created.body.data.id;\n});\n\nafterAll(async () => {\n  await db.destroy();\n});\n\ndescribe(\"Order sources and source price lists\", () => {\n  it(\"creates and lists sources scoped to the account\", async () => {\n    const response = await request(app)\n      .get(\"/api/v1/order-sources?active_only=false\")\n      .set(auth());\n\n    expect(response.status).toBe(200);\n    expect(response.body.data.map((source: { name_ar: string }) => source.name_ar)).toEqual(\n      expect.arrayContaining([\"طلب مباشر\", \"طلبات الهاتف\"])\n    );\n  });\n\n  it(\"uses source price override in branch menu and quote\", async () => {\n    const update = await request(app)\n      .put(\"/api/v1/order-sources/\" + sourceId + \"/menu\")\n      .set(auth())\n      .send({\n        items: [{ product_id: productId, price_override: 44, is_available: true }],\n      });\n    expect(update.status).toBe(200);\n\n    const menu = await request(app)\n      .get(\"/api/v1/branches/\" + branchId + \"/menu?source_id=\" + sourceId)\n      .set(auth());\n    const product = menu.body.data.categories\n      .flatMap((category: { products: unknown[] }) => category.products)\n      .find((row: { id: string }) => row.id === productId);\n    expect(product.effective_price).toBe(44);\n\n    const quote = await request(app)\n      .post(\"/api/v1/orders/quote\")\n      .set(auth())\n      .send(orderPayload());\n    expect(quote.status).toBe(200);\n    expect(quote.body.data.items[0].unit_price).toBe(44);\n    expect(quote.body.data.source.name_ar).toBe(\"طلبات الهاتف\");\n  });\n\n  it(\"rejects a source that does not support the order type\", async () => {\n    const response = await request(app)\n      .post(\"/api/v1/orders/quote\")\n      .set(auth())\n      .send(orderPayload({ order_type: \"delivery\" }));\n\n    expect(response.status).toBe(422);\n  });\n\n  it(\"stores source snapshot on the created order\", async () => {\n    const response = await request(app)\n      .post(\"/api/v1/orders\")\n      .set(auth())\n      .send(orderPayload({ submit: true, payment_method: \"unpaid\" }));\n\n    expect(response.status).toBe(201);\n    expect(response.body.data.source_id).toBe(sourceId);\n    expect(response.body.data.source_name).toBe(\"طلبات الهاتف\");\n    expect(response.body.data.source_name_snapshot).toBe(\"طلبات الهاتف\");\n  });\n\n  it(\"keeps API compatibility by mapping a missing source to direct\", async () => {\n    const response = await request(app)\n      .post(\"/api/v1/orders/quote\")\n      .set(auth())\n      .send(orderPayload({ source_id: undefined }));\n\n    expect(response.status).toBe(200);\n    expect(response.body.data.source.id).toBe(directSourceId);\n  });\n});\n");

write("docs/adr/ADR-002-order-sources-and-price-lists.md", "# ADR-002 — مصادر الطلب وقوائم الأسعار\n\n**التاريخ:** 2026-07-12  \n**الحالة:** Accepted  \n**المرحلة:** YKMS-02H\n\n## السياق\n\nنقطة البيع تحتاج تسجيل قناة/مصدر الطلب بصورة إلزامية، مع اختلاف سعر أو إتاحة بعض الأصناف حسب المصدر. تكرار المنتجات والمنيو لكل قناة سيؤدي إلى تضارب الصور والمكونات والتعديلات التشغيلية.\n\n## القرار\n\n- توجد منيو أساسية واحدة للحساب.\n- يمثل `order_sources` قنوات البيع التشغيلية.\n- يخزن `source_product_rules` فقط إتاحة الصنف والسعر المخصص للمصدر.\n- أولوية السعر: سعر المصدر ← سعر الفرع ← السعر الأساسي.\n- يحفظ الطلب `source_id` و`source_name_snapshot`.\n- يحفظ `order_items.unit_price` و`line_total` كسجل مالي ثابت.\n- نقطة البيع تمنع إنشاء الطلب بدون اختيار مصدر.\n- خلال فترة الانتقال فقط، طلبات API القديمة التي لا ترسل `source_id` تُنسب إلى المصدر النظامي `direct`.\n- الطلبات التاريخية السابقة للهجرة تظل بدون مصدر وتظهر بصيغة «طلب سابق — المصدر غير مسجل».\n\n## الأسباب\n\n- منع تكرار كتالوج المنتجات.\n- الحفاظ على مصدر حقيقة واحد للصور والمكونات والخيارات.\n- دعم أسعار القنوات مع بقاء الطلبات القديمة ثابتة.\n- توفير انتقال آمن لعملاء API الحاليين.\n\n## التأثير\n\n- إضافة هجرتين منطقيتين داخل هجرة واحدة: المصادر، ثم قواعد المنتج للمصدر، ثم مرجع اختياري على الطلب.\n- التسعير وإتاحة المنتجات يتحققان على الخادم.\n- إعدادات المصادر تستخدم واجهة بطاقات وصفوف responsive بدل جدول عريض.\n- يلزم اختبار بصري نهائي لنقطة البيع والإعدادات قبل الدمج.\n\n## البدائل المرفوضة\n\n- نسخ المنتجات والمنيو لكل مصدر.\n- حفظ السعر القادم من الواجهة.\n- جعل المصدر نصًا حرًا داخل الطلب.\n");

{
  const relative = "apps/api/src/db/knex.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import * as m012 from "./migrations/20260712_012_order_integrity_stabilization";',
    'import * as m012 from "./migrations/20260712_012_order_integrity_stabilization";\nimport * as m013 from "./migrations/20260712_013_order_sources_price_lists";',
    "register migration import"
  );
  source = replaceOnce(
    source,
    '  "20260712_012_order_integrity_stabilization": m012,',
    '  "20260712_012_order_integrity_stabilization": m012,\n  "20260712_013_order_sources_price_lists": m013,',
    "register migration source"
  );
  write(relative, source);
}

{
  const relative = "apps/api/src/app.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { settingsRoutes, prepStationRoutes, deliveryZoneRoutes, driverRoutes } from "./modules/settings";',
    'import { settingsRoutes, prepStationRoutes, deliveryZoneRoutes, driverRoutes } from "./modules/settings";\nimport { orderSourceRoutes } from "./modules/orderSources";',
    "order source routes import"
  );
  source = replaceOnce(
    source,
    '  v1.use("/modifier-groups", modifierGroupRoutes(db));',
    '  v1.use("/modifier-groups", modifierGroupRoutes(db));\n  v1.use("/order-sources", orderSourceRoutes(db));',
    "mount order source routes"
  );
  write(relative, source);
}

{
  const relative = "apps/api/src/db/seedData.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { newId } from "../lib/ids";',
    'import { newId } from "../lib/ids";\nimport { ensureDefaultOrderSource } from "../modules/orderSources";',
    "seed source helper import"
  );
  source = replaceOnce(
    source,
    '  if (existing) {\n    const branch = await db("branches").where({ account_id: existing.id }).first();\n    return { accountId: existing.id, branchId: branch?.id, ownerEmail, ownerPassword };\n  }',
    '  if (existing) {\n    const branch = await db("branches").where({ account_id: existing.id }).first();\n    await ensureDefaultOrderSource(db, existing.id);\n    return { accountId: existing.id, branchId: branch?.id, ownerEmail, ownerPassword };\n  }',
    "ensure default source for existing seed"
  );
  source = replaceOnce(
    source,
    '  await db("accounts").insert({ id: accountId, name: "يا كبدة" });',
    '  await db("accounts").insert({ id: accountId, name: "يا كبدة" });\n  await ensureDefaultOrderSource(db, accountId);',
    "ensure default source for fresh seed"
  );
  write(relative, source);
}

{
  const relative = "apps/api/src/modules/orderPricing.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { validateOrderConfiguration } from "./orderIntegrity";',
    'import { validateOrderConfiguration } from "./orderIntegrity";\nimport { OrderSourceRow, resolveOrderSource } from "./orderSources";',
    "pricing source import"
  );
  source = replaceOnce(
    source,
    'export interface PricingInput {\n  order_type: "dine_in" | "takeaway" | "delivery";',
    'export interface PricingInput {\n  source_id?: string | null;\n  order_type: "dine_in" | "takeaway" | "delivery";',
    "pricing input source"
  );
  source = replaceOnce(
    source,
    'export interface OrderQuote {\n  lines: PricedOrderLine[];',
    'export interface OrderQuote {\n  source: OrderSourceRow;\n  lines: PricedOrderLine[];',
    "quote source type"
  );
  source = replaceOnce(
    source,
    '  await validateOrderConfiguration(db, accountId, input.items);\n\n  const productIds',
    '  await validateOrderConfiguration(db, accountId, input.items);\n  const source = await resolveOrderSource(db, accountId, input.source_id, input.order_type);\n\n  const productIds',
    "resolve pricing source"
  );
  source = replaceOnce(
    source,
    '  const availability = await db("branch_product_availability")\n    .where({ branch_id: branchId })\n    .whereIn("product_id", productIds);',
    '  const availability = await db("branch_product_availability")\n    .where({ branch_id: branchId })\n    .whereIn("product_id", productIds);\n  const sourceRules = await db("source_product_rules")\n    .where({ source_id: source.id })\n    .whereIn("product_id", productIds);',
    "load source product rules"
  );
  source = replaceOnce(
    source,
    '    const itemAvailability = availability.find((candidate) => candidate.product_id === item.product_id);\n    if (itemAvailability && !itemAvailability.is_available) {\n      throw err.validation({ product: `${ar.errors.product_unavailable}: ${product.name_ar}` });\n    }',
    '    const itemAvailability = availability.find((candidate) => candidate.product_id === item.product_id);\n    const sourceRule = sourceRules.find((candidate) => candidate.product_id === item.product_id);\n    if ((itemAvailability && !itemAvailability.is_available) || sourceRule?.is_available === false) {\n      throw err.validation({ product: `${ar.errors.product_unavailable}: ${product.name_ar}` });\n    }',
    "source availability"
  );
  source = replaceOnce(
    source,
    '    const override = overrides.find((candidate) => candidate.product_id === product.id)?.price_override;\n    const base = override != null ? Number(override) : Number(product.base_price);',
    '    const branchOverride = overrides.find((candidate) => candidate.product_id === product.id)?.price_override;\n    const sourceOverride = sourceRule?.price_override;\n    const base = sourceOverride != null\n      ? Number(sourceOverride)\n      : branchOverride != null\n        ? Number(branchOverride)\n        : Number(product.base_price);',
    "source price precedence"
  );
  source = replaceOnce(
    source,
    '  return {\n    lines,',
    '  return {\n    source,\n    lines,',
    "return quote source"
  );
  source = replaceOnce(
    source,
    'const quoteSchema = z.object({\n  branch_id: z.string().uuid(),',
    'const quoteSchema = z.object({\n  branch_id: z.string().uuid(),\n  source_id: z.string().uuid().optional().nullable(),',
    "quote schema source"
  );
  source = replaceOnce(
    source,
    'function publicQuote(quote: OrderQuote) {\n  return {\n    items:',
    'function publicQuote(quote: OrderQuote) {\n  return {\n    source: { id: quote.source.id, code: quote.source.code, name_ar: quote.source.name_ar },\n    items:',
    "public quote source"
  );
  source = replaceOnce(
    source,
    '            branch_id: branch.id,\n            order_prefix:',
    '            branch_id: branch.id,\n            source_id: quote.source.id,\n            source_name_snapshot: quote.source.name_ar,\n            order_prefix:',
    "persist order source"
  );
  source = replaceOnce(
    source,
    '             order_type: input.order_type,\n             total: quote.total,',
    '             order_type: input.order_type,\n             source_id: quote.source.id,\n             source_name: quote.source.name_ar,\n             total: quote.total,',
    "audit order source"
  );
  write(relative, source);
}

{
  const relative = "apps/api/src/modules/menu.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { buildWorkbook, buildTemplate, parseWorkbook, planImport, applyImport, type ExportRow } from "./menuExcel";',
    'import { buildWorkbook, buildTemplate, parseWorkbook, planImport, applyImport, type ExportRow } from "./menuExcel";\nimport { resolveOrderSource } from "./orderSources";',
    "menu source resolver import"
  );
  source = replaceOnce(
    source,
    '      if (!branch) throw err.notFound();\n      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();\n      const categories',
    '      if (!branch) throw err.notFound();\n      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();\n      const query = z.object({ source_id: z.string().uuid().optional() }).safeParse(req.query);\n      if (!query.success) throw err.validation(query.error.flatten());\n      const source = query.data.source_id\n        ? await resolveOrderSource(db, req.user!.accountId, query.data.source_id, "takeaway")\n        : null;\n      const categories',
    "branch menu source query"
  );
  source = replaceOnce(
    source,
    '      const [variants, links, groups, mods, prices, avail] = await Promise.all([',
    '      const [variants, links, groups, mods, prices, avail, sourceRules] = await Promise.all([',
    "branch menu promise list"
  );
  source = replaceOnce(
    source,
    '        db("branch_product_availability").where({ branch_id: branch.id }),\n      ]);',
    '        db("branch_product_availability").where({ branch_id: branch.id }),\n        source ? db("source_product_rules").where({ source_id: source.id }) : [],\n      ]);',
    "branch menu source rules"
  );
  source = replaceOnce(
    source,
    '            const override = prices.find((x) => x.product_id === p.id)?.price_override;\n            const a = avail.find((x) => x.product_id === p.id);\n            return {\n              ...p,\n              effective_price: override != null ? Number(override) : Number(p.base_price),\n              is_available: a ? a.is_available : true,',
    '            const branchOverride = prices.find((x) => x.product_id === p.id)?.price_override;\n            const sourceRule = sourceRules.find((x) => x.product_id === p.id);\n            const a = avail.find((x) => x.product_id === p.id);\n            return {\n              ...p,\n              effective_price: sourceRule?.price_override != null\n                ? Number(sourceRule.price_override)\n                : branchOverride != null\n                  ? Number(branchOverride)\n                  : Number(p.base_price),\n              is_available: (a ? a.is_available : true) && sourceRule?.is_available !== false,',
    "branch menu source price and availability"
  );
  source = replaceOnce(
    source,
    '      res.json({ data: { branch: { id: branch.id, name: branch.name }, categories: data } });',
    '      res.json({ data: { branch: { id: branch.id, name: branch.name }, source, categories: data } });',
    "branch menu source response"
  );
  write(relative, source);
}

{
  const relative = "apps/api/src/modules/orders.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    '  const driver = order.driver_id ? await db("drivers").where({ id: order.driver_id }).first() : null;\n  // YKMS-02G:',
    '  const driver = order.driver_id ? await db("drivers").where({ id: order.driver_id }).first() : null;\n  const sourceRow = order.source_id ? await db("order_sources").where({ id: order.source_id }).first() : null;\n  // YKMS-02G:',
    "load full order source"
  );
  source = replaceOnce(
    source,
    '    driver_name: driver?.name ?? null,\n    cashier_name:',
    '    driver_name: driver?.name ?? null,\n    source_name: order.source_name_snapshot ?? sourceRow?.name_ar ?? "طلب سابق — المصدر غير مسجل",\n    cashier_name:',
    "full order source name"
  );
  source = replaceOnce(
    source,
    '          "o.order_type",\n          "o.status",',
    '          "o.order_type",\n          "o.source_name_snapshot",\n          "o.status",',
    "shift history source select"
  );
  source = replaceOnce(
    source,
    '        return { ...order, payment_status: paymentStatus, kitchen_status: kitchenStatus };',
    '        return {\n          ...order,\n          source_name: order.source_name_snapshot ?? "طلب سابق — المصدر غير مسجل",\n          payment_status: paymentStatus,\n          kitchen_status: kitchenStatus,\n        };',
    "shift history source mapping"
  );
  write(relative, source);
}

{
  const relative = "apps/api/src/lib/receipt.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    '  branch_name: string;\n  table_name_ar?:',
    '  branch_name: string;\n  source_name?: string | null;\n  table_name_ar?:',
    "receipt source type"
  );
  source = replaceOnce(
    source,
    '  lines.push(`طلب رقم: ${order.order_no} — ${ORDER_TYPE_AR[order.order_type] ?? order.order_type}`);\n  if (order.table_name_ar)',
    '  lines.push(`طلب رقم: ${order.order_no} — ${ORDER_TYPE_AR[order.order_type] ?? order.order_type}`);\n  if (order.source_name) lines.push(`المصدر: ${order.source_name}`);\n  if (order.table_name_ar)',
    "receipt source line"
  );
  source = replaceOnce(
    source,
    '  lines.push(`طلب ${order.order_no}${order.order_type ? ` — ${ORDER_TYPE_AR[order.order_type] ?? order.order_type}` : ""}`);\n  lines.push(`الوقت:',
    '  lines.push(`طلب ${order.order_no}${order.order_type ? ` — ${ORDER_TYPE_AR[order.order_type] ?? order.order_type}` : ""}`);\n  if (order.source_name) lines.push(`المصدر: ${order.source_name}`);\n  lines.push(`الوقت:',
    "kitchen ticket source line"
  );
  write(relative, source);
}

{
  const relative = "apps/admin/src/components/Receipt.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    '  branch_name: string;\n  table_name_ar?:',
    '  branch_name: string;\n  source_id?: string | null;\n  source_name?: string | null;\n  source_name_snapshot?: string | null;\n  table_name_ar?:',
    "frontend receipt source type"
  );
  source = replaceOnce(
    source,
    '      </div>\n      {order.table_name_ar && <div className="receipt-line">',
    '      </div>\n      {order.source_name && <div className="receipt-line">المصدر: {order.source_name}</div>}\n      {order.table_name_ar && <div className="receipt-line">',
    "frontend receipt source line"
  );
  write(relative, source);
}

{
  const relative = "apps/admin/src/components/OrderDetail.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    '        <SummaryItem label="نوع الطلب" value={t.orders.types[order.order_type] ?? order.order_type} />',
    '        <SummaryItem label="نوع الطلب" value={t.orders.types[order.order_type] ?? order.order_type} />\n        <SummaryItem label="المصدر" value={order.source_name ?? "طلب سابق — المصدر غير مسجل"} />',
    "order detail source summary"
  );
  source = replaceOnce(
    source,
    '          <Row label="تاريخ الإنشاء" value={exact(order.created_at)} />',
    '          <Row label="تاريخ الإنشاء" value={exact(order.created_at)} />\n          <Row label="مصدر الطلب" value={order.source_name ?? "طلب سابق — المصدر غير مسجل"} />',
    "order detail source row"
  );
  write(relative, source);
}

{
  const relative = "apps/admin/src/pages/settings/SettingsLayout.tsx";
  let source = read(relative);
  source = replaceOnce(source, '  MenuSection,\n', '', "remove settings menu import");
  source = replaceOnce(
    source,
    '} from "./crudSections";',
    '} from "./crudSections";\nimport { SourcesSection } from "./SourcesSection";',
    "sources section import"
  );
  source = replaceOnce(
    source,
    '  ["menu", "المنيو", false],',
    '  ["sources", "المصادر", false],',
    "settings source nav"
  );
  source = replaceOnce(
    source,
    '          {section === "menu" && <MenuSection editable={editable} />}',
    '          {section === "sources" && <SourcesSection editable={editable} />}',
    "settings source content"
  );
  write(relative, source);
}

{
  const relative = "apps/admin/src/pages/PrintJobs.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { useList } from "./hooks";',
    'import { useList } from "./hooks";\nimport { Button, Select } from "../components/ui/primitives";',
    "print jobs primitives"
  );
  source = replaceOnce(source, '    <>', '    <div className="print-jobs-page">', "print jobs page wrapper");
  source = replaceOnce(source, '      </div>\n    </>', '      </div>\n    </div>', "print jobs page closing");
  source = replaceOnce(
    source,
    '          <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} required>',
    '          <Select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} required>'
  , "print jobs select open");
  source = replaceOnce(source, '          </select>', '          </Select>', "print jobs select close");
  source = replaceOnce(
    source,
    '        <button className="btn">{t.printJobs.test}</button>',
    '        <Button variant="secondary" type="submit">{t.printJobs.test}</Button>',
    "print jobs test button"
  );
  write(relative, source);
}

{
  const relative = "apps/admin/src/pages/Pos.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    'interface Branch {\n  id: string;\n  name: string;\n}',
    'interface Branch {\n  id: string;\n  name: string;\n}\ninterface OrderSource {\n  id: string;\n  code: string;\n  name_ar: string;\n  supports_takeaway: boolean;\n  supports_delivery: boolean;\n}'
  , "POS source type");
  source = replaceOnce(
    source,
    '  order_type: string;\n  status: string;',
    '  order_type: string;\n  source_name?: string | null;\n  status: string;',
    "POS history source type"
  );
  source = replaceOnce(
    source,
    '  const [branchId, setBranchId] = useState(params.get("branch") ?? "");\n  const [settings',
    '  const [branchId, setBranchId] = useState(params.get("branch") ?? "");\n  const [sources, setSources] = useState<OrderSource[]>([]);\n  const [sourceId, setSourceId] = useState("");\n  const [settings',
    "POS source state"
  );
  source = replaceOnce(
    source,
    '  const quotePayload = useMemo(() => ({\n    branch_id: branchId,',
    '  const quotePayload = useMemo(() => ({\n    branch_id: branchId,\n    source_id: sourceId || null,',
    "POS quote source"
  );
  source = replaceOnce(
    source,
    '  }), [branchId, orderType, deliveryFee, discount, discountReason, settings?.allow_discounts, cart]);',
    '  }), [branchId, sourceId, orderType, deliveryFee, discount, discountReason, settings?.allow_discounts, cart]);',
    "POS quote deps"
  );
  source = replaceOnce(
    source,
    '    if (!branchId || !cart.length) {',
    '    if (!branchId || !sourceId || !cart.length) {',
    "POS quote source guard"
  );
  source = replaceOnce(
    source,
    '  }, [branchId, cart.length, quoteKey, quotePayload]);',
    '  }, [branchId, sourceId, cart.length, quoteKey, quotePayload]);',
    "POS quote source effect deps"
  );
  source = replaceOnce(
    source,
    '  async function loadMenu(currentBranchId = branchId) {\n    if (!currentBranchId) return;\n    const response = await api<{ data: { categories: MenuCategory[] } }>(`/branches/${currentBranchId}/menu`);\n    const sorted = [...response.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));\n    setCategories(sorted);\n    setActiveCat("الكل");\n  }',
    '  async function loadMenu(currentBranchId = branchId, currentSourceId = sourceId) {\n    if (!currentBranchId) return;\n    const query = currentSourceId ? "?source_id=" + encodeURIComponent(currentSourceId) : "";\n    const response = await api<{ data: { categories: MenuCategory[] } }>("/branches/" + currentBranchId + "/menu" + query);\n    const sorted = [...response.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));\n    const refreshed = new Map(sorted.flatMap((category) => category.products).map((product) => [product.id, product]));\n    setCategories(sorted);\n    setCart((rows) => rows.map((line) => ({ ...line, product: refreshed.get(line.product.id) ?? line.product })));\n    setActiveCat("الكل");\n  }',
    "POS source-aware menu"
  );
  source = replaceOnce(
    source,
    '    loadMenu(branchId).catch((e: Error) => setError(e.message));',
    '    setSourceId("");\n    loadMenu(branchId, "").catch((e: Error) => setError(e.message));',
    "POS branch resets source"
  );
  source = replaceOnce(
    source,
    '  useEffect(() => {\n    if (!historyOpen || !branchId) return;',
    '  useEffect(() => {\n    if (!branchId) return;\n    let cancelled = false;\n    setSources([]);\n    setSourceId("");\n    api<{ data: OrderSource[] }>("/order-sources?active_only=true&order_type=" + orderType)\n      .then((response) => {\n        if (!cancelled) setSources(response.data);\n      })\n      .catch((e: Error) => {\n        if (!cancelled) setError(e.message);\n      });\n    return () => { cancelled = true; };\n  }, [branchId, orderType]);\n\n  useEffect(() => {\n    if (!branchId) return;\n    loadMenu(branchId, sourceId).catch((e: Error) => setError(e.message));\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [branchId, sourceId]);\n\n  useEffect(() => {\n    if (!historyOpen || !branchId) return;',
    "POS load sources effect"
  );
  source = replaceOnce(
    source,
    '          branch_id: branchId,\n          order_type: orderType,',
    '          branch_id: branchId,\n          source_id: sourceId,\n          order_type: orderType,',
    "POS create order source"
  );
  source = replaceOnce(
    source,
    '    if (!cart.length || busy || !currentQuote) return;',
    '    if (!sourceId || !cart.length || busy || !currentQuote) return;',
    "POS fire source guard"
  );
  source = replaceOnce(
    source,
    '                    setOrderType(type);\n                    // YKMS-02E:',
    '                    setOrderType(type);\n                    setSourceId("");\n                    // YKMS-02E:',
    "POS reset source on type"
  );
  source = replaceOnce(
    source,
    '            </div>\n            {orderType === "delivery" && (',
    '            </div>\n            <label className="posx-source-field">\n              <span>مصدر الطلب</span>\n              <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} aria-label="مصدر الطلب" required>\n                <option value="">اختر مصدر الطلب…</option>\n                {sources.map((source) => <option key={source.id} value={source.id}>{source.name_ar}</option>)}\n              </select>\n            </label>\n            {orderType === "delivery" && (',
    "POS source selector"
  );
  source = replaceOnce(
    source,
    '            const fireReason = !cart.length\n              ? "السلة فارغة"',
    '            const fireReason = !cart.length\n              ? "السلة فارغة"\n              : !sourceId\n                ? "اختر مصدر الطلب"',
    "POS source fire reason"
  );
  source = replaceOnce(
    source,
    '                       <span>{order.item_count} قطعة</span>',
    '                       <span>{order.item_count} قطعة</span>\n                       <span>{order.source_name ?? "مصدر غير مسجل"}</span>',
    "POS history source badge"
  );
  write(relative, source);
}


{
  const relative = "apps/admin/src/final-closure.css";
  let source = read(relative);
  const marker = "YKMS-02H — Order sources and field consistency";
  if (!source.includes(marker)) source += "\n\n/* ==================================================================\n   YKMS-02H — Order sources and field consistency\n   Deliberately scoped away from POS product cards and KDS.\n   ================================================================== */\n\n.sources-section {\n  display: grid;\n  gap: 14px;\n  min-width: 0;\n}\n\n.source-create,\n.source-settings-grid,\n.source-menu-toolbar {\n  display: grid;\n  align-items: end;\n  gap: 10px;\n  min-width: 0;\n}\n\n.source-create {\n  grid-template-columns: minmax(220px, 1fr) minmax(240px, 1fr) auto;\n}\n\n.source-settings-grid {\n  grid-template-columns: minmax(220px, 1.5fr) minmax(100px, 0.55fr) repeat(3, minmax(145px, 0.8fr));\n  align-items: center;\n}\n\n.source-field,\n.source-price-field {\n  display: grid;\n  gap: 6px;\n  min-width: 0;\n  color: var(--text-secondary);\n  font-size: var(--type-sm);\n  font-weight: 800;\n}\n\n.source-field.compact {\n  max-width: 140px;\n}\n\n.source-field > :is(input, select),\n.source-price-field > input {\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: 100% !important;\n  box-sizing: border-box;\n}\n\n.source-picker {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 8px;\n  margin-top: 14px;\n}\n\n.settings-page .source-picker-card {\n  min-height: 88px !important;\n  display: grid !important;\n  justify-items: start;\n  align-content: center;\n  gap: 3px;\n  padding: 11px 13px !important;\n  border: 1px solid var(--border-subtle) !important;\n  border-radius: 11px !important;\n  background: var(--surface-2) !important;\n  color: var(--text-primary) !important;\n  text-align: start !important;\n}\n\n.settings-page .source-picker-card.active {\n  border-color: var(--brand) !important;\n  background: var(--theme-brand-soft) !important;\n  box-shadow: inset 3px 0 0 var(--brand);\n}\n\n.source-picker-card > span,\n.source-picker-card > small {\n  color: var(--text-secondary);\n  font-size: var(--type-xs);\n}\n\n.source-actions {\n  display: flex;\n  justify-content: flex-start;\n  margin-top: 12px;\n}\n\n.source-menu-toolbar {\n  grid-template-columns: minmax(240px, 1fr) auto auto;\n  margin-bottom: 10px;\n}\n\n.source-menu-toolbar > span {\n  color: var(--text-secondary);\n  font-weight: 800;\n  white-space: nowrap;\n}\n\n.source-product-list {\n  display: grid;\n  gap: 7px;\n  min-width: 0;\n}\n\n.source-product-row {\n  display: grid;\n  grid-template-columns: minmax(190px, 1.4fr) minmax(125px, 0.65fr) minmax(150px, 0.75fr) minmax(110px, auto);\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n  padding: 9px 10px;\n  border: 1px solid var(--border-subtle);\n  border-radius: 10px;\n  background: var(--surface-2);\n}\n\n.source-product-row.unavailable {\n  opacity: 0.68;\n}\n\n.source-product-copy,\n.source-base-price {\n  display: grid;\n  gap: 2px;\n  min-width: 0;\n}\n\n.source-product-copy strong,\n.source-product-copy span {\n  overflow-wrap: anywhere;\n}\n\n.source-product-copy span,\n.source-base-price span {\n  color: var(--text-secondary);\n  font-size: var(--type-xs);\n}\n\n.source-base-price strong {\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.app2-pos .posx-source-field {\n  display: grid;\n  gap: 5px;\n  width: 100%;\n  min-width: 0;\n  padding: 9px 10px;\n  border: 1px solid var(--border-subtle);\n  border-radius: 10px;\n  background: var(--surface-2);\n  color: var(--text-secondary);\n  font-size: var(--type-sm);\n  font-weight: 900;\n}\n\n.app2-pos .posx-source-field select {\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: 100% !important;\n  background-color: var(--surface-1) !important;\n}\n\n.print-jobs-page .form-row {\n  display: grid !important;\n  grid-template-columns: minmax(260px, 520px) auto;\n  align-items: end !important;\n  justify-content: start;\n}\n\n.print-jobs-page .form-row .field {\n  width: 100%;\n  min-width: 0;\n}\n\n.print-jobs-page .form-row select {\n  width: 100%;\n  max-width: 520px;\n}\n\n.app2 :is(input:not([type=\"checkbox\"]):not([type=\"radio\"]), select, textarea),\n.uif-drawer :is(input:not([type=\"checkbox\"]):not([type=\"radio\"]), select, textarea),\n.modal :is(input:not([type=\"checkbox\"]):not([type=\"radio\"]), select, textarea) {\n  box-sizing: border-box;\n  font-size: var(--type-body);\n  line-height: 1.4;\n}\n\n@media (max-width: 1050px) {\n  .source-create,\n  .source-settings-grid,\n  .source-product-row {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .source-menu-toolbar {\n    grid-template-columns: minmax(0, 1fr) auto;\n  }\n\n  .source-menu-toolbar > button {\n    grid-column: 1 / -1;\n    justify-self: start;\n  }\n}\n\n@media (max-width: 680px) {\n  .source-create,\n  .source-settings-grid,\n  .source-product-row,\n  .source-menu-toolbar,\n  .print-jobs-page .form-row {\n    grid-template-columns: minmax(0, 1fr) !important;\n  }\n\n  .source-field.compact {\n    max-width: none;\n  }\n\n  .source-menu-toolbar > button {\n    grid-column: auto;\n    width: 100%;\n  }\n}\n";
  write(relative, source);
}


{
  const relative = "docs/YAKEBDA_MS_Diagrams_Roadmap_v1_AR_RTL.md";
  let source = read(relative);
  const marker = "Order Source Pricing Flow — YKMS-02H";
  if (!source.includes(marker)) source = appendBeforeClosingDiv(source, "\n\n---\n\n## 8. Order Source Pricing Flow — YKMS-02H\n\n```mermaid\nsequenceDiagram\n    participant Admin as مدير النظام\n    participant Settings as إعدادات المصادر\n    participant POS as نقطة البيع\n    participant API as Backend API\n    participant DB as PostgreSQL\n\n    Admin->>Settings: إضافة مصدر أو نسخه من مصدر قائم\n    Settings->>API: حفظ إعدادات المصدر وقواعد الأسعار\n    API->>DB: order_sources + source_product_rules\n\n    POS->>API: طلب المصادر المتاحة لنوع الطلب\n    API-->>POS: المصادر النشطة\n    POS->>API: تحميل منيو الفرع مع source_id\n    API->>DB: السعر الأساسي + سعر الفرع + سعر المصدر\n    API-->>POS: السعر والإتاحة الفعليان\n\n    POS->>API: Quote مع source_id\n    API->>DB: إعادة تحقق وتسعير من الخادم\n    API-->>POS: الإجمالي النهائي\n    POS->>API: إنشاء الطلب مع source_id\n    API->>DB: source snapshot + item price snapshots\n```\n");
  write(relative, source);
}


{
  const relative = "docs/YAKEBDA_MS_Milestone_Log.md";
  let source = read(relative);
  const marker = "Milestone Log — YKMS-02H";
  if (!source.includes(marker)) source = appendBeforeClosingDiv(source, "\n\n---\n\n## Milestone Log — YKMS-02H (مصادر الطلب وقوائم الأسعار)\n\n**التاريخ:** 2026-07-12  \n**الحالة:** In Progress — تنفيذ مكتمل آليًا، القبول البصري والدمج معلّقان  \n**الفرع:** `feature/order-sources-price-lists`  \n**الهدف:** مصدر طلب إلزامي في POS مع أسعار وإتاحة خاصة بالمصدر دون تكرار المنيو.\n\n### ما تم إنجازه\n\n- استبدال قسم المنيو المكرر داخل الإعدادات بقسم «المصادر».\n- إضافة إنشاء مصدر فارغ أو نسخ قواعد مصدر قائم.\n- إضافة سعر وإتاحة كل صنف حسب المصدر مع منيو أساسية واحدة.\n- إضافة `source_id` إلى quote وإنشاء الطلب، وتخزين اسم المصدر snapshot.\n- منع POS من حساب/إرسال الطلب قبل اختيار المصدر.\n- إضافة المصدر إلى سجل الشيفت وتفاصيل الإيصال.\n- توحيد الحقول الخاصة بالمصادر وطابور الطباعة بدون تغيير كروت POS أو تصميم KDS.\n\n### قرارات معمارية\n\n- ADR-002: المصادر طبقة قواعد فوق المنيو الأساسية، وليست نسخًا من المنتجات.\n- أولوية السعر: المصدر ثم الفرع ثم السعر الأساسي.\n- توافق انتقالي لعملاء API القديمة عبر المصدر `direct`.\n\n### التحقق\n\n- اختبارات API جديدة لمصادر الطلب.\n- جميع اختبارات API وبناء Admin مطلوب نجاحها في CI قبل المراجعة البصرية.\n- لا دمج قبل القبول البصري الصريح.\n");
  write(relative, source);
}

console.log("Applied YKMS-02H order sources patch.");
