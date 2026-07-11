from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# POS page: sticky operating toolbar, order-only cards, mouse shortcuts,
# visual current-shift history, and authoritative history DTOs.
# ---------------------------------------------------------------------------
pos_path = Path("apps/admin/src/pages/Pos.tsx")
pos = pos_path.read_text(encoding="utf-8")

pos = replace_once(
    pos,
    '''interface ShiftOrderSummary {
  id: string;
  order_no: number;
  order_prefix?: string | null;
  order_type: string;
  status: string;
  total: string | number;
  paid_amount: string | number;
  item_count: number;
  created_at: string;
  submitted_at?: string | null;
  in_kitchen_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
}''',
    '''interface ShiftOrderPreviewItem {
  id: string;
  name_ar: string;
  variant_name_ar?: string | null;
  qty: number;
  image_url?: string | null;
}
interface ShiftOrderSummary {
  id: string;
  order_no: number;
  order_prefix?: string | null;
  order_type: string;
  status: string;
  kitchen_status: "draft" | "waiting" | "preparing" | "ready" | "completed" | "cancelled";
  payment_status: "unpaid" | "partial" | "paid";
  subtotal: string | number;
  discount: string | number;
  service_fee: string | number;
  vat_amount: string | number;
  delivery_fee: string | number;
  rounding_adjustment: string | number;
  total: string | number;
  paid_amount: string | number;
  item_count: number;
  preview_items: ShiftOrderPreviewItem[];
  created_at: string;
  submitted_at?: string | null;
  in_kitchen_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
}''',
    "history interfaces",
)

pos = replace_once(
    pos,
    '''          <div className="posx-menu-tools">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} title="الفرع">''',
    '''          <div className="posx-menu-top">
            <div className="posx-menu-tools">
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} title="الفرع">''',
    "toolbar wrapper open",
)

pos = replace_once(
    pos,
    '''            </details>
          </div>
          <div className="posx-cats">''',
    '''              </details>
            </div>
            <div className="posx-cats">''',
    "toolbar details close",
)

pos = replace_once(
    pos,
    '''            {categories.map((category) => (
              <button key={category.id} className={category.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(category.name_ar); setSearch(""); }}>
                {category.name_ar}
              </button>
            ))}
          </div>
          <div className="posx-grid">''',
    '''              {categories.map((category) => (
                <button key={category.id} className={category.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(category.name_ar); setSearch(""); }}>
                  {category.name_ar}
                </button>
              ))}
            </div>
          </div>
          <div className="posx-grid">''',
    "toolbar wrapper close",
)

pos = replace_once(
    pos,
    '''                canEdit={can("menu.manage")}
                onAdd={(variant, mods) => addProduct(product, variant, mods)}
                onQuickRemove={() => quickRemove(product)}
                onEdit={() => setEditorProductId(product.id)}
                onOpenDetail={() => setPicking(product)}''',
    '''                onAdd={(variant, mods) => addProduct(product, variant, mods)}
                onQuickRemove={() => quickRemove(product)}
                onOpenDetail={() => setPicking(product)}''',
    "product card call props",
)

card_start = pos.index('/**\n * YKMS-02G — بطاقة صنف تفاعلية.')
card_end = pos.index('\nfunction OptionPicker(', card_start)
new_card = r'''/**
 * YKMS-02G-E — بطاقة طلب فقط.
 * Left click adds the selected configuration; right click decrements it.
 * Product editing stays exclusively in the top administration flow.
 */
function ProductCard({
  product,
  qty,
  showImage,
  money,
  onAdd,
  onQuickRemove,
  onOpenDetail,
}: {
  product: MenuProduct;
  qty: number;
  showImage: boolean;
  money: (v: number) => string;
  onAdd: (variant: MenuVariant | null, mods: MenuModifier[]) => void;
  onQuickRemove: () => void;
  onOpenDetail: () => void;
}) {
  const inlineGroups = product.modifier_groups.filter((group) => group.is_required && group.max_select === 1);
  const detailGroups = product.modifier_groups.filter((group) => !(group.is_required && group.max_select === 1));
  const hasSizes = product.variants.length > 0;
  const hasDetail = detailGroups.length > 0;

  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);
  const [breadSel, setBreadSel] = useState<Record<string, MenuModifier>>(() => {
    const initial: Record<string, MenuModifier> = {};
    for (const group of inlineGroups) if (group.modifiers[0]) initial[group.id] = group.modifiers[0];
    return initial;
  });

  const imageSrc = resolveAssetUrl(product.image_url);
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => setImageBroken(false), [imageSrc]);

  const priceNow =
    product.effective_price +
    Number(variant?.price_delta ?? 0) +
    Object.values(breadSel).reduce((sum, modifier) => sum + Number(modifier.price_delta ?? 0), 0);

  function add() {
    if (!product.is_available) return;
    onAdd(variant, Object.values(breadSel));
  }

  function isControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a"));
  }

  return (
    <article
      className={product.is_available ? "posx-card2" : "posx-card2 off"}
      role="button"
      tabIndex={product.is_available ? 0 : -1}
      aria-label={`${product.name_ar} — كليك شمال للإضافة، كليك يمين للتقليل`}
      onClick={(event) => {
        if (!isControl(event.target)) add();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!isControl(event.target) && qty > 0) onQuickRemove();
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isControl(event.target)) {
          event.preventDefault();
          add();
        }
      }}
    >
      <div className="posx-card2-media">
        {showImage && imageSrc && !imageBroken ? (
          <img className="posx-card2-img" src={imageSrc} alt={product.name_ar} onError={() => setImageBroken(true)} />
        ) : (
          <span className="posx-card2-img ph">{product.name_ar.trim().charAt(0)}</span>
        )}
        {qty > 0 && <span className="posx-card2-qty-badge">{qty}</span>}
      </div>

      <div className="posx-card2-info">
        <h3 className="posx-card2-name">{product.name_ar}</h3>
        <span className="posx-card2-price">{money(priceNow)}</span>
      </div>

      {!product.is_available && <div className="posx-card2-off">{product.availability_note_ar ?? t.menu.unavailable}</div>}

      {product.is_available && hasSizes && (
        <div className="posx-card2-opt">
          <span className="posx-card2-opt-label">الحجم</span>
          <div className="posx-chips">
            {product.variants.map((item) => (
              <button
                type="button"
                key={item.id}
                className={variant?.id === item.id ? "active" : ""}
                onClick={(event) => { event.stopPropagation(); setVariant(item); }}
                onContextMenu={(event) => event.stopPropagation()}
              >
                {item.name_ar}
              </button>
            ))}
          </div>
        </div>
      )}

      {product.is_available && inlineGroups.map((group) => (
        <div key={group.id} className="posx-card2-opt">
          <span className="posx-card2-opt-label">{group.name_ar}</span>
          <div className="posx-chips">
            {group.modifiers.map((modifier) => (
              <button
                type="button"
                key={modifier.id}
                className={breadSel[group.id]?.id === modifier.id ? "active" : ""}
                onClick={(event) => {
                  event.stopPropagation();
                  setBreadSel((current) => ({ ...current, [group.id]: modifier }));
                }}
                onContextMenu={(event) => event.stopPropagation()}
              >
                {modifier.name_ar}
              </button>
            ))}
          </div>
        </div>
      ))}

      {product.is_available && (
        <footer className="posx-card2-foot">
          {hasDetail ? (
            <button type="button" className="posx-card2-detail" onClick={(event) => { event.stopPropagation(); onOpenDetail(); }}>
              + إضافات
            </button>
          ) : (
            <span className="posx-card2-hint">شمال + / يمين −</span>
          )}
          <div className="posx-card2-stepper">
            <button type="button" onClick={(event) => { event.stopPropagation(); onQuickRemove(); }} disabled={!qty}>−</button>
            <span>{qty}</span>
            <button type="button" onClick={(event) => { event.stopPropagation(); add(); }}>+</button>
          </div>
        </footer>
      )}
    </article>
  );
}
'''
pos = pos[:card_start] + new_card + pos[card_end:]

history_start = pos.index('        <div className="posx-history-list">')
history_end = pos.index('        </div>\n      </Drawer>', history_start) + len('        </div>')
new_history = r'''        <div className="posx-history-list">
          {history.map((order) => {
            const amount = Number(order.total);
            const paymentState = order.payment_status === "paid" ? "مدفوع" : order.payment_status === "partial" ? "مدفوع جزئيًا" : "غير مدفوع";
            const kitchenState =
              order.kitchen_status === "waiting" ? "في انتظار المطبخ" :
              order.kitchen_status === "preparing" ? "قيد التحضير" :
              order.kitchen_status === "ready" ? "جاهز" :
              order.kitchen_status === "completed" ? "مكتمل" :
              order.kitchen_status === "cancelled" ? "ملغي" : "مسودة";
            return (
              <button key={order.id} className="posx-history-card" onClick={() => openHistoryOrder(order.id)}>
                <div className="posx-history-card-head">
                  <span className="posx-history-main">
                    <strong>#{order.order_prefix ?? ""}{order.order_no}</strong>
                    <span>{new Date(order.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  <strong className="posx-history-total">{money(amount)}</strong>
                </div>
                <div className="posx-history-items">
                  {order.preview_items.map((item) => {
                    const src = resolveAssetUrl(item.image_url);
                    return (
                      <span key={item.id} className="posx-history-item">
                        {src ? <img src={src} alt="" /> : <span className="posx-history-item-ph">{item.name_ar.trim().charAt(0)}</span>}
                        <span className="posx-history-item-copy">
                          <b>{item.qty} × {item.name_ar}</b>
                          {item.variant_name_ar && <small>{item.variant_name_ar}</small>}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <div className="posx-history-meta">
                  <span>{t.orders.types[order.order_type] ?? order.order_type}</span>
                  <span>{order.item_count} قطعة</span>
                  <span className={`posx-history-status pay-${order.payment_status}`}>{paymentState}</span>
                  <span className={`posx-history-status kitchen-${order.kitchen_status}`}>{kitchenState}</span>
                </div>
              </button>
            );
          })}
        </div>'''
pos = pos[:history_start] + new_history + pos[history_end:]
pos_path.write_text(pos, encoding="utf-8")


# ---------------------------------------------------------------------------
# Full order images in detail types and UI.
# ---------------------------------------------------------------------------
receipt_path = Path("apps/admin/src/components/Receipt.tsx")
receipt = receipt_path.read_text(encoding="utf-8")
receipt = replace_once(
    receipt,
    '''    notes?: string | null;
    modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }>;''',
    '''    notes?: string | null;
    image_url?: string | null;
    modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }>;''',
    "receipt item image type",
)
receipt_path.write_text(receipt, encoding="utf-8")

order_detail_path = Path("apps/admin/src/components/OrderDetail.tsx")
order_detail = order_detail_path.read_text(encoding="utf-8")
order_detail = replace_once(
    order_detail,
    'import { t } from "../lib/t";',
    'import { t } from "../lib/t";\nimport { resolveAssetUrl } from "../lib/api";',
    "OrderDetail import",
)
old_item_cell = '''                <td>
                  <strong>{i.name_ar}{i.variant_name_ar ? ` — ${i.variant_name_ar}` : ""}</strong>
                  {i.modifiers.length > 0 && <div className="od-mods">{i.modifiers.map((m) => m.name_ar).join("، ")}</div>}
                  {i.notes && <div className="od-inote">ملاحظة: {i.notes}</div>}
                </td>'''
new_item_cell = '''                <td>
                  <div className="od-item-main">
                    {i.image_url ? <img className="od-item-image" src={resolveAssetUrl(i.image_url)} alt="" /> : <span className="od-item-image ph">{i.name_ar.trim().charAt(0)}</span>}
                    <div>
                      <strong>{i.name_ar}{i.variant_name_ar ? ` — ${i.variant_name_ar}` : ""}</strong>
                      {i.modifiers.length > 0 && <div className="od-mods">{i.modifiers.map((m) => m.name_ar).join("، ")}</div>}
                      {i.notes && <div className="od-inote">ملاحظة: {i.notes}</div>}
                    </div>
                  </div>
                </td>'''
order_detail = replace_once(order_detail, old_item_cell, new_item_cell, "OrderDetail item image")
order_detail_path.write_text(order_detail, encoding="utf-8")


# ---------------------------------------------------------------------------
# API: item images in full order + audited, authoritative shift-history DTO.
# ---------------------------------------------------------------------------
orders_path = Path("apps/api/src/modules/orders.ts")
orders = orders_path.read_text(encoding="utf-8")
orders = replace_once(
    orders,
    '  const items = await db("order_items").where({ order_id: order.id }).orderBy("created_at", "asc");',
    '''  const items = await db("order_items as oi")
    .leftJoin("products as p", "p.id", "oi.product_id")
    .where("oi.order_id", order.id)
    .orderBy("oi.created_at", "asc")
    .select("oi.*", "p.image_url");''',
    "full order item images",
)
old_history_select = '''          "o.status",
          "o.total",
          "o.created_at",
          "o.submitted_at",
          "o.in_kitchen_at",
          "o.ready_at",
          "o.completed_at",
          db.raw("(select coalesce(sum(p.amount), 0) from payments p where p.order_id = o.id) as paid_amount"),
          db.raw("(select coalesce(sum(oi.qty), 0)::int from order_items oi where oi.order_id = o.id) as item_count")
        );'''
new_history_select = '''          "o.status",
          "o.subtotal",
          "o.discount",
          "o.service_fee",
          "o.vat_amount",
          "o.delivery_fee",
          "o.rounding_adjustment",
          "o.total",
          "o.created_at",
          "o.submitted_at",
          "o.in_kitchen_at",
          "o.ready_at",
          "o.completed_at",
          "o.cancelled_at",
          db.raw("(select coalesce(sum(p.amount), 0) from payments p where p.order_id = o.id) as paid_amount"),
          db.raw("(select coalesce(sum(oi.qty), 0)::int from order_items oi where oi.order_id = o.id) as item_count"),
          db.raw(`(
            select coalesce(json_agg(json_build_object(
              'id', preview.id,
              'name_ar', preview.name_ar,
              'variant_name_ar', preview.variant_name_ar,
              'qty', preview.qty,
              'image_url', preview.image_url
            ) order by preview.created_at), '[]'::json)
            from (
              select oi.id, oi.name_ar, oi.variant_name_ar, oi.qty, oi.created_at, p.image_url
              from order_items oi
              left join products p on p.id = oi.product_id
              where oi.order_id = o.id
              order by oi.created_at
              limit 6
            ) preview
          ) as preview_items`)
        );

      const mapped = orders.map((order: Record<string, unknown>) => {
        const total = Number(order.total ?? 0);
        const paid = Number(order.paid_amount ?? 0);
        const status = String(order.status ?? "draft");
        const paymentStatus = paid <= 0 ? "unpaid" : paid + 0.001 < total ? "partial" : "paid";
        const kitchenStatus =
          status === "submitted" ? "waiting" :
          status === "in_kitchen" ? "preparing" :
          status === "ready" ? "ready" :
          status === "completed" ? "completed" :
          status === "cancelled" ? "cancelled" : "draft";
        return { ...order, payment_status: paymentStatus, kitchen_status: kitchenStatus };
      });'''
orders = replace_once(orders, old_history_select, new_history_select, "history authoritative data")
orders = replace_once(
    orders,
    '      res.json({ data: { shift, orders } });',
    '      res.json({ data: { shift, orders: mapped } });',
    "history mapped response",
)
orders_path.write_text(orders, encoding="utf-8")


# ---------------------------------------------------------------------------
# Approved visual card system and sticky top operating controls.
# ---------------------------------------------------------------------------
css_path = Path("apps/admin/src/ykms-02f.css")
css = css_path.read_text(encoding="utf-8")
marker = '''/* ================================================================
   YKMS-02G-E — POS operational QA fixes'''
marker_index = css.index(marker)
css = css[:marker_index] + r'''/* ================================================================
   YKMS-02G-E — POS operational QA / approved card system
   ================================================================ */

.posx { height: 100%; min-height: 0; grid-template-rows: minmax(0, 1fr); }
.posx-body { height: 100%; min-height: 0; }
.posx-menu { padding: 0 14px 20px; }
.posx-menu-top {
  position: sticky;
  top: 0;
  z-index: 20;
  margin: 0 -14px 14px;
  padding: 10px 14px 9px;
  background: rgba(9, 11, 13, 0.98);
  border-bottom: 1px solid var(--yk-line);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
}
.posx-menu-tools {
  display: grid;
  grid-template-columns: minmax(145px, 180px) auto minmax(230px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
}
.posx-menu-tools .posx-search { min-width: 0; width: 100%; }
.posx-menu-tools .posx-adminmenu { position: relative; }
.posx-history-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--yk-yellow);
  border-radius: 9px;
  background: transparent;
  color: var(--yk-yellow);
  font-family: inherit;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
}
.posx-history-btn:hover { background: rgba(246, 192, 38, 0.1); }
.posx-menu-top .posx-cats {
  position: static;
  margin: 0;
  padding: 0;
  background: none;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.posx-menu-top .posx-cats::-webkit-scrollbar { display: none; }
.posx-menu-top .posx-cats button { flex: 0 0 auto; padding: 8px 16px; }

.posx-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.posx-card2 {
  min-width: 0;
  min-height: 420px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--yk-panel);
  border: 1px solid #725c12;
  border-radius: 0;
  color: var(--yk-text);
  cursor: pointer;
  user-select: none;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.posx-card2:hover, .posx-card2:focus-visible {
  transform: translateY(-2px);
  border-color: var(--yk-yellow);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(246, 192, 38, 0.28);
  outline: none;
}
.posx-card2.off { opacity: 0.48; cursor: not-allowed; }
.posx-card2-media { position: relative; width: 100%; aspect-ratio: 1.25 / 1; background: #0d1114; overflow: hidden; border-bottom: 1px solid var(--yk-yellow); }
.posx-card2-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0; }
.posx-card2-img.ph { display: grid; place-items: center; background: linear-gradient(145deg, #13191e, #362d0c); color: var(--yk-yellow); font-size: 48px; font-weight: 900; }
.posx-card2-qty-badge { position: absolute; top: 10px; inset-inline-start: 10px; min-width: 30px; height: 30px; display: grid; place-items: center; padding: 0 8px; border-radius: 999px; background: var(--yk-yellow); color: #111; font-weight: 900; box-shadow: 0 3px 12px rgba(0,0,0,.4); }
.posx-card2-info { padding: 12px 14px 8px; text-align: center; }
.posx-card2-name { margin: 0; min-height: 52px; display: grid; place-items: center; font-size: clamp(17px, 1.25vw, 23px); line-height: 1.35; font-weight: 900; }
.posx-card2-price { display: block; color: var(--yk-yellow); font-size: 15px; font-weight: 900; margin-top: 3px; }
.posx-card2-opt { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 8px; padding: 5px 14px; }
.posx-card2-opt-label { color: var(--yk-muted); font-size: 12px; font-weight: 900; }
.posx-chips { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
.posx-chips button { min-width: 74px; min-height: 28px; padding: 3px 12px; border: 1px solid var(--yk-yellow); border-radius: 999px; background: transparent; color: var(--yk-text); font-family: inherit; font-size: 12px; font-weight: 900; cursor: pointer; }
.posx-chips button.active { background: var(--yk-yellow); color: #111; }
.posx-card2-off { margin: 8px 14px; padding: 8px; border: 1px solid #8a372f; color: #ffc7c0; text-align: center; }
.posx-card2-foot { margin-top: auto; min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px 12px; border-top: 1px solid rgba(246, 192, 38, 0.18); }
.posx-card2-stepper { display: inline-grid; grid-template-columns: 34px 32px 34px; gap: 4px; align-items: center; }
.posx-card2-stepper button { width: 34px; height: 34px; border: 1px solid var(--yk-line); border-radius: 8px; background: #0d1114; color: var(--yk-text); font-size: 18px; font-weight: 900; cursor: pointer; }
.posx-card2-stepper button:last-child { background: var(--yk-yellow); border-color: var(--yk-yellow); color: #111; }
.posx-card2-stepper span { text-align: center; font-weight: 900; color: var(--yk-yellow); }
.posx-card2-detail { min-height: 34px; padding: 0 12px; border: 1px dashed #725c12; border-radius: 8px; background: transparent; color: var(--yk-yellow); font-family: inherit; font-weight: 900; cursor: pointer; }
.posx-card2-hint { color: var(--yk-muted); font-size: 11px; font-weight: 800; }

.posx-order-now { width: 100%; min-height: 52px; border: 1px solid var(--yk-yellow); border-radius: 11px; background: var(--yk-yellow); color: #111; font-family: inherit; font-size: 16px; font-weight: 900; cursor: pointer; }
.posx-order-now:hover:not(:disabled) { background: var(--yk-yellow-2); }
.posx-order-now:disabled { opacity: 0.45; cursor: not-allowed; }
.posx-fire-reason { margin-top: 5px; color: var(--yk-yellow); font-size: 11.5px; font-weight: 800; text-align: center; }

.posx-history-list { display: grid; gap: 10px; }
.posx-history-card { width: 100%; display: grid; gap: 10px; padding: 12px; border: 1px solid var(--yk-line); border-radius: 12px; background: var(--yk-black-2); color: var(--yk-text); font-family: inherit; text-align: start; cursor: pointer; }
.posx-history-card:hover { border-color: var(--yk-yellow); }
.posx-history-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.posx-history-main { display: flex; flex-direction: column; gap: 2px; }
.posx-history-main strong, .posx-history-total { color: var(--yk-yellow); }
.posx-history-main span { color: var(--yk-muted); font-size: 12px; }
.posx-history-items { display: grid; gap: 6px; }
.posx-history-item { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 9px; align-items: center; padding: 6px; border-radius: 9px; background: #0d1114; }
.posx-history-item img, .posx-history-item-ph { width: 46px; height: 46px; object-fit: cover; border-radius: 8px; }
.posx-history-item-ph { display: grid; place-items: center; background: #2d260d; color: var(--yk-yellow); font-weight: 900; }
.posx-history-item-copy { display: grid; gap: 2px; }
.posx-history-item-copy b { font-size: 12px; }
.posx-history-item-copy small { color: var(--yk-muted); }
.posx-history-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.posx-history-meta > span { padding: 4px 8px; border: 1px solid var(--yk-line); border-radius: 999px; font-size: 11px; font-weight: 800; }
.posx-history-status.pay-paid, .posx-history-status.kitchen-completed { color: #78e08f; border-color: #1f6f46; }
.posx-history-status.pay-partial, .posx-history-status.kitchen-waiting { color: var(--yk-yellow); border-color: #665214; }
.posx-history-status.kitchen-preparing { color: #79c8ff; border-color: #275d80; }
.posx-history-status.kitchen-ready { color: #b7ff8a; border-color: #4d7c2f; }
.posx-history-status.kitchen-cancelled { color: #ff9c8a; border-color: #7a2a2a; }
.posx-history-empty { padding: 24px; color: var(--yk-muted); text-align: center; }

.od-item-main { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 10px; align-items: center; }
.od-item-image { width: 54px; height: 54px; object-fit: cover; border-radius: 9px; }
.od-item-image.ph { display: grid; place-items: center; background: #2d260d; color: var(--yk-yellow); font-weight: 900; }

@media (max-width: 1450px) {
  .posx-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1120px) {
  .posx-menu-tools { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .posx-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .posx-body { grid-template-columns: 1fr; }
  .posx-cart { display: none; }
  .posx-menu-tools { grid-template-columns: 1fr; }
  .posx-grid { grid-template-columns: 1fr; }
}
'''
css_path.write_text(css, encoding="utf-8")

print("Applied POS QA stage 2 source transformation.")
