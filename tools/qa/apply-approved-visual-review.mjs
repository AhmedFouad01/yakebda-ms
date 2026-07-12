import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function filePath(relative) {
  return path.join(root, ...relative.split("/"));
}

function read(relative) {
  return fs.readFileSync(filePath(relative), "utf8");
}

function write(relative, content) {
  fs.writeFileSync(filePath(relative), content, "utf8");
}

function replaceOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (content.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous patch target: ${label}`);
  return content.slice(0, first) + replacement + content.slice(first + search.length);
}

function replaceRegexOnce(content, regex, replacement, label) {
  const matches = [...content.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one regex target for ${label}; found ${matches.length}`);
  return content.replace(regex, replacement);
}

// Reports: semantic responsive classes without changing data behavior.
{
  const relative = "apps/admin/src/pages/Reports.tsx";
  let source = read(relative);
  source = replaceOnce(source, '<div dir="rtl">', '<div dir="rtl" className="reports-page">', "reports page class");
  source = replaceOnce(source, '<div className="cards">', '<div className="report-summary-grid">', "reports summary grid");
  source = replaceOnce(source, '<div className="cards">', '<div className="report-grid">', "reports data grid");
  source = source.replaceAll('<div className="panel">', '<div className="report-panel">');
  if ((source.match(/className="report-panel"/g) ?? []).length !== 3) throw new Error("Expected three report panels");
  write(relative, source);
}

// Settings menu: use the shared select and mark the dense product table for responsive rules.
{
  const relative = "apps/admin/src/pages/settings/crudSections.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    '{tab === "products" && (\n        <table>',
    '{tab === "products" && (\n        <table className="settings-menu-table">',
    "settings menu table class",
  );
  source = replaceOnce(
    source,
    '                  <select disabled={!editable} value={p.prep_station_id ?? ""} onChange={(e) => patch(p.id, { prep_station_id: e.target.value || null })}>\n                    <option value="">حسب القسم</option>\n                    {stations.map((st) => <option key={st.id} value={st.id}>{st.name_ar}</option>)}\n                  </select>',
    '                  <Select disabled={!editable} value={p.prep_station_id ?? ""} onChange={(e) => patch(p.id, { prep_station_id: e.target.value || null })}>\n                    <option value="">حسب القسم</option>\n                    {stations.map((st) => <option key={st.id} value={st.id}>{st.name_ar}</option>)}\n                  </Select>',
    "settings menu shared select",
  );
  write(relative, source);
}

// POS: remove the redundant admin shortcut and rebuild shift history as a compact searchable accordion.
{
  const relative = "apps/admin/src/pages/Pos.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { useNavigate, useSearchParams } from "react-router-dom";',
    'import { useSearchParams } from "react-router-dom";',
    "remove useNavigate import",
  );
  source = replaceOnce(source, '  const navigate = useNavigate();\n', "", "remove navigate hook");
  source = replaceOnce(
    source,
    '  const [historyOrderError, setHistoryOrderError] = useState("");\n',
    '  const [historyOrderError, setHistoryOrderError] = useState("");\n  const [historySearch, setHistorySearch] = useState("");\n  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);\n',
    "shift history state",
  );
  source = replaceRegexOnce(
    source,
    /\n            <details className="posx-adminmenu">[\s\S]*?\n              <\/details>/,
    "",
    "remove POS admin menu",
  );
  source = replaceOnce(
    source,
    `  function calcPress(key: string) {
    if (key === "C") return setCalc("");
    if (key === "⌫") return setCalc((value) => value.slice(0, -1));
    if (key === "=") return setCalc((value) => safeCalc(value));
    if (key === "خصم") return setDiscount(Number(calc || 0));
    if (key === "دليفري") return setDeliveryFee(Number(calc || 0));
    setCalc((value) => value + key);
  }

  return (`,
    `  function calcPress(key: string) {
    if (key === "C") return setCalc("");
    if (key === "⌫") return setCalc((value) => value.slice(0, -1));
    if (key === "=") return setCalc((value) => safeCalc(value));
    if (key === "خصم") return setDiscount(Number(calc || 0));
    if (key === "دليفري") return setDeliveryFee(Number(calc || 0));
    setCalc((value) => value + key);
  }

  const normalizedHistorySearch = historySearch.trim().replace(/^#/, "").toLocaleLowerCase("ar-EG");
  const filteredHistory = normalizedHistorySearch
    ? history.filter((order) => \`${'${order.order_prefix ?? ""}'}${'${order.order_no}'}\`.toLocaleLowerCase("ar-EG").includes(normalizedHistorySearch))
    : history;
  const shiftOrdersCount = shift?.totals?.orders_count ?? history.length;

  return (`,
    "shift history derived values",
  );

  const drawer = `      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="سجل طلبات الشيفت" wide>
        <div className="posx-history">
          <div className="posx-history-toolbar">
            <label className="posx-history-search">
              <span>بحث برقم الطلب</span>
              <input
                inputMode="numeric"
                placeholder="مثال: 31 أو #31"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
              />
            </label>
            <div className="posx-history-kpi" aria-label={\`إجمالي طلبات الشيفت ${'${shiftOrdersCount}'}\`}>
              <span>إجمالي طلبات الشيفت</span>
              <strong>{shiftOrdersCount}</strong>
            </div>
          </div>

          {historyBusy && <div className="posx-history-empty">جارٍ تحميل الطلبات…</div>}
          {!historyBusy && historyError && <div className="alert dark-alert">{historyError}</div>}
          {historyOrderBusy && <div className="posx-history-empty">جارٍ تحميل تفاصيل الطلب…</div>}
          {!historyOrderBusy && historyOrderError && <div className="alert dark-alert">{historyOrderError}</div>}
          {!historyBusy && !historyError && !shift && (
            <div className="posx-history-empty">لا يوجد شيفت مفتوح لهذا الكاشير.</div>
          )}
          {!historyBusy && !historyError && shift && !history.length && (
            <div className="posx-history-empty">لم يتم تسجيل طلبات في الشيفت الحالي بعد.</div>
          )}
          {!historyBusy && !historyError && history.length > 0 && !filteredHistory.length && (
            <div className="posx-history-empty">لا يوجد طلب مطابق لرقم البحث.</div>
          )}

          <div className="posx-history-list">
            {filteredHistory.map((order) => {
              const expanded = expandedHistoryId === order.id;
              const amount = Number(order.total);
              const paymentState = order.payment_status === "paid" ? "مدفوع" : order.payment_status === "partial" ? "مدفوع جزئيًا" : "غير مدفوع";
              const kitchenState =
                order.kitchen_status === "waiting" ? "في انتظار المطبخ" :
                order.kitchen_status === "preparing" ? "قيد التحضير" :
                order.kitchen_status === "ready" ? "جاهز" :
                order.kitchen_status === "completed" ? "مكتمل" :
                order.kitchen_status === "cancelled" ? "ملغي" : "مسودة";
              return (
                <article key={order.id} className={\`posx-history-card${'${expanded ? " expanded" : ""}'}\`}>
                  <button
                    type="button"
                    className="posx-history-summary"
                    aria-expanded={expanded}
                    aria-controls={\`shift-order-${'${order.id}'}\`}
                    onClick={() => setExpandedHistoryId((current) => current === order.id ? null : order.id)}
                  >
                    <span className="posx-history-main">
                      <strong>#{order.order_prefix ?? ""}{order.order_no}</strong>
                      <span>{new Date(order.created_at).toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="posx-history-meta">
                      <span>{t.orders.types[order.order_type] ?? order.order_type}</span>
                      <span>{order.item_count} قطعة</span>
                      <span className={\`posx-history-status pay-${'${order.payment_status}'}\`}>{paymentState}</span>
                      <span className={\`posx-history-status kitchen-${'${order.kitchen_status}'}\`}>{kitchenState}</span>
                    </span>
                    <span className="posx-history-expand-icon" aria-hidden>{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded && (
                    <div id={\`shift-order-${'${order.id}'}\`} className="posx-history-expanded">
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
                      <div className="posx-history-expanded-foot">
                        <strong>{money(amount)}</strong>
                        <button type="button" disabled={historyOrderBusy} onClick={() => openHistoryOrder(order.id)}>فتح التفاصيل الكاملة</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </Drawer>`;

  source = replaceRegexOnce(
    source,
    /      <Drawer open=\{historyOpen\} onClose=\{\(\) => setHistoryOpen\(false\)\} title="سجل طلبات الشيفت" wide>[\s\S]*?      <\/Drawer>/,
    drawer,
    "compact searchable shift history drawer",
  );
  write(relative, source);
}

// Final targeted CSS: responsive reports/settings, one select contract, typography tokens, and compact history.
{
  const relative = "apps/admin/src/final-closure.css";
  let source = read(relative);
  const marker = "Approved visual review — responsive layout and typography";
  if (source.includes(marker)) throw new Error("Approved visual review CSS already exists");
  source += `

/* ==================================================================
   Approved visual review — responsive layout and typography
   Scoped away from approved POS product cards and KDS presentation.
   ================================================================== */

:root {
  --type-xs: 0.75rem;
  --type-sm: 0.8125rem;
  --type-body: 0.875rem;
  --type-md: 1rem;
  --type-lg: 1.125rem;
  --type-xl: clamp(1.35rem, 1.7vw, 1.6rem);
  --type-leading-ar: 1.55;
}

/* Typography contract for admin pages, settings, tables, modals, and drawers. */
.app2-main:not(.full),
.settings-page,
.reports-page,
.uif-drawer,
.modal {
  font-size: var(--type-body);
  line-height: var(--type-leading-ar);
}

:is(.uif-pagehead h1, .page-head h1, .reports-page h1, .settings-page > .uif-pagehead h1) {
  font-size: var(--type-xl) !important;
  line-height: 1.35 !important;
  font-weight: 900 !important;
}

:is(.uif-card-head h3, .report-panel thead th:first-child, .uif-drawer-title, .modal h3) {
  font-size: var(--type-md) !important;
  line-height: 1.45 !important;
}

:is(.app2-main:not(.full), .settings-page, .reports-page, .uif-drawer, .modal) :is(button, input, select, textarea) {
  font-size: var(--type-body);
}

:is(.data-table-shell, .report-panel, .settings-page .uif-card-body) table tbody td {
  font-size: var(--type-body);
}

:is(.data-table-shell, .report-panel, .settings-page .uif-card-body) table thead th {
  font-size: var(--type-sm) !important;
}

:is(.uif-hint, .muted, .uif-sub, .posx-history-main span, .posx-history-item-copy small) {
  font-size: var(--type-xs);
  line-height: 1.5;
}

/* One RTL select geometry contract. */
.app2 select,
.uif-drawer select,
.modal select {
  min-height: 40px;
  padding-block: 0 !important;
  padding-inline: 12px 40px !important;
  background-position: left 12px center !important;
  background-size: 16px 16px !important;
  text-align: right !important;
  text-align-last: right;
  line-height: 1.35;
  white-space: nowrap;
}

.app2 select:focus-visible,
.uif-drawer select:focus-visible,
.modal select:focus-visible {
  border-color: var(--brand) !important;
  outline: 3px solid var(--focus-ring) !important;
  outline-offset: 2px;
}

/* Settings use the available viewport instead of clipping the content column. */
.settings-page {
  width: min(1480px, 100%) !important;
  max-width: 100%;
  overflow-x: hidden;
}

.settings-page .setx2 {
  grid-template-columns: minmax(190px, 220px) minmax(0, 1fr) !important;
  width: 100%;
  max-width: 100%;
  justify-content: stretch !important;
}

.settings-page .setx2-body {
  width: 100%;
  max-width: none !important;
  overflow: hidden;
}

.settings-page .uif-card-body:has(.settings-menu-table) {
  overflow-x: hidden !important;
}

.settings-menu-table {
  width: 100% !important;
  min-width: 0 !important;
  table-layout: fixed;
}

.settings-menu-table :is(th, td) {
  min-width: 0 !important;
  padding-inline: 8px !important;
  white-space: normal !important;
  overflow-wrap: anywhere;
}

.settings-menu-table th:nth-child(1) { width: 15%; }
.settings-menu-table th:nth-child(2) { width: 29%; }
.settings-menu-table th:nth-child(3),
.settings-menu-table th:nth-child(4),
.settings-menu-table th:nth-child(5) { width: 9%; }
.settings-menu-table th:nth-child(6) { width: 19%; }
.settings-menu-table th:nth-child(7) { width: 10%; }

.settings-menu-table .set-img {
  grid-template-columns: 40px minmax(0, 1fr) !important;
  min-width: 0 !important;
}

.settings-menu-table .set-img > :is(img, span) {
  width: 40px;
  height: 40px;
}

.settings-menu-table :is(input, select, .uif-input) {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

.settings-menu-table td:nth-child(3),
.settings-menu-table td:nth-child(4),
.settings-menu-table td:nth-child(5) {
  text-align: center;
}

/* Reports: responsive cards and tables, no desktop horizontal scroll frames. */
.reports-page {
  min-width: 0;
  overflow-x: hidden;
}

.report-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.report-summary-grid .card {
  min-width: 0;
  margin: 0;
}

.report-summary-grid .num {
  font-size: clamp(1.25rem, 1.8vw, 1.65rem) !important;
  line-height: 1.2;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr));
  align-items: stretch;
  gap: 12px;
  min-width: 0;
}

.report-panel {
  min-width: 0;
  max-width: 100%;
  overflow: hidden !important;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-1);
  box-shadow: 0 5px 18px var(--theme-shadow);
}

.report-panel > table {
  width: 100% !important;
  min-width: 0 !important;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

.report-panel table :is(th, td) {
  width: auto !important;
  min-width: 0 !important;
  padding: 10px 11px !important;
  white-space: normal !important;
  overflow-wrap: anywhere;
}

.report-panel table :is(th, td):last-child {
  text-align: left;
}

.report-panel .empty {
  padding: 24px 12px;
}

/* POS toolbar after removing the redundant Admin shortcut. */
.app2-pos .posx-menu-tools {
  grid-template-columns: minmax(150px, 190px) auto minmax(260px, 1fr) auto auto !important;
}

/* Shift history: compact collapsed rows, one search, one shift total. */
.posx-history {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.posx-history-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(150px, 190px);
  align-items: end;
  gap: 10px;
  position: sticky;
  top: 0;
  z-index: 2;
  padding-block: 2px 10px;
  background: var(--surface-1);
}

.posx-history-search {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--text-secondary);
  font-weight: 800;
}

.posx-history-search input {
  width: 100%;
  min-width: 0;
}

.posx-history-kpi {
  min-height: 58px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--brand);
  border-radius: 11px;
  background: var(--theme-brand-soft);
}

.posx-history-kpi span {
  color: var(--text-secondary);
  font-size: var(--type-sm);
  font-weight: 800;
}

.posx-history-kpi strong {
  color: var(--brand);
  font-size: 1.45rem;
  line-height: 1;
}

.posx-history-list {
  gap: 8px !important;
}

.posx-history-card {
  display: block !important;
  padding: 0 !important;
  overflow: hidden;
  cursor: default !important;
}

.uif-drawer .posx-history-summary {
  width: 100%;
  min-height: 64px !important;
  display: grid !important;
  grid-template-columns: minmax(120px, 0.75fr) minmax(0, 1.8fr) 34px;
  align-items: center;
  gap: 10px;
  padding: 9px 11px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--text-primary) !important;
  text-align: start;
  transform: none !important;
}

.uif-drawer .posx-history-summary:hover:not(:disabled),
.posx-history-card.expanded .posx-history-summary {
  background: var(--surface-2) !important;
}

.posx-history-main strong {
  color: var(--brand);
  font-size: var(--type-md);
}

.posx-history-meta {
  min-width: 0;
  align-items: center;
}

.posx-history-meta > span {
  font-size: var(--type-xs) !important;
  line-height: 1.35;
  white-space: nowrap;
}

.posx-history-expand-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--brand);
  font-size: 1.15rem;
  font-weight: 900;
}

.posx-history-expanded {
  display: grid;
  gap: 10px;
  padding: 10px 11px 12px;
  border-top: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-2) 66%, var(--surface-1));
}

.posx-history-expanded .posx-history-items {
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.posx-history-expanded-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.posx-history-expanded-foot > strong {
  color: var(--brand);
  font-size: var(--type-lg);
}

@media (max-width: 1050px) {
  .settings-page .setx2 {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .settings-page .setx2-nav {
    position: static;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .app2-pos .posx-menu-tools {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .app2-pos .posx-search {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .settings-page .uif-card-body:has(.settings-menu-table) {
    overflow-x: auto !important;
  }

  .settings-menu-table {
    min-width: 760px !important;
  }

  .posx-history-toolbar,
  .uif-drawer .posx-history-summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .posx-history-expand-icon {
    position: absolute;
    inset-inline-end: 10px;
    margin-top: 4px;
  }

  .posx-history-expanded .posx-history-items {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;
  write(relative, source);
}

console.log("Applied approved visual review patch successfully.");
