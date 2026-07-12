from pathlib import Path
import re

path = Path('apps/admin/src/pages/Pos.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    'import { useEffect, useMemo, useState } from "react";',
    'import { useEffect, useMemo, useRef, useState } from "react";',
    'React imports',
)
replace_once(
    'import { Drawer } from "../components/ui/overlays";\n',
    'import { Drawer } from "../components/ui/overlays";\nimport { PosCartLine } from "../components/pos/PosCartLine";\n',
    'cart line import',
)
replace_once('  const [cashTender, setCashTender] = useState<number | null>(null);\n', '', 'cash tender state')
replace_once(
    '  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);\n',
    '  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);\n'
    '  const searchInputRef = useRef<HTMLInputElement>(null);\n'
    '  const sourceSelectRef = useRef<HTMLSelectElement>(null);\n',
    'POS refs',
)

keyboard_effect = '''
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === "F2") {
        event.preventDefault();
        sourceSelectRef.current?.focus();
      } else if (event.key === "F4") {
        event.preventDefault();
        setHistoryOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
'''
replace_once(
    '''  useEffect(() => {
    setShellControlsRoot(document.getElementById("pos-appshell-controls"));
  }, []);
''',
    '''  useEffect(() => {
    setShellControlsRoot(document.getElementById("pos-appshell-controls"));
  }, []);
''' + keyboard_effect,
    'keyboard shortcuts mount',
)

tender_pattern = re.compile(
    r'  const tenderSuggestions = useMemo\(\(\) => \{.*?'
    r'  const selectedChange = cashTender == null \? 0 : Math\.max\(0, Math\.round\(\(cashTender - total\) \* 100\) / 100\);\n',
    re.S,
)
text, count = tender_pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'cash calculation removal: expected one match, found {count}')

old_portal = '''      {shellControlsRoot && createPortal(
        <div className="posx-shell-order-controls">
          <div className="seg dark posx-shell-order-types">
            {enabledOrderTypes.map((type) => (
              <button
                type="button"
                key={type}
                className={orderType === type ? "active" : ""}
                onClick={() => {
                  setOrderType(type);
                  setSourceId("");
                  setDeliveryZoneId("");
                  setDeliveryFee(0);
                  setCashTender(null);
                }}
              >
                {t.orders.types[type]}
              </button>
            ))}
          </div>
          <label className="posx-shell-source">
            <span>مصدر الطلب</span>
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} aria-label="مصدر الطلب" required>
              <option value="">اختر مصدر الطلب…</option>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name_ar}</option>)}
            </select>
          </label>
        </div>,
        shellControlsRoot
      )}
'''
new_portal = '''      {shellControlsRoot && createPortal(
        <div className="posx-shell-operation-controls" aria-label="أدوات تشغيل نقطة البيع">
          <span className={shift ? "posx-shift on" : "posx-shift off"}>
            <span>{me?.name ?? "الكاشير"}</span>
            <span>{shift ? t.shift.openTitle : t.shift.noShift}</span>
            {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>{shift ? t.shift.close : t.shift.open}</button>}
          </span>
          <input
            ref={searchInputRef}
            className="posx-search"
            placeholder="ابحث باسم الصنف أو المكونات…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="posx-history-btn" onClick={() => setHistoryOpen(true)}>سجل الطلبات</button>
        </div>,
        shellControlsRoot
      )}
'''
replace_once(old_portal, new_portal, 'AppShell operations portal')

replace_once(
    '''            <span className={shift ? "posx-shift on" : "posx-shift off"}>
              <span>{me?.name ?? "الكاشير"}</span>
              <span>{shift ? t.shift.openTitle : t.shift.noShift}</span>
              {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>{shift ? t.shift.close : t.shift.open}</button>}
            </span>
            <input className="posx-search" placeholder="ابحث باسم الصنف أو المكونات…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="posx-history-btn" onClick={() => setHistoryOpen(true)}>سجل الطلبات</button>
''',
    '',
    'duplicate toolbar operations',
)

order_rail = '''          <div className="posx-order-rail" aria-label="بيانات الطلب الأساسية">
            <div className="seg dark">
              {enabledOrderTypes.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={orderType === type ? "active" : ""}
                  onClick={() => {
                    setOrderType(type);
                    setSourceId("");
                    setDeliveryZoneId("");
                    setDeliveryFee(0);
                  }}
                >
                  {t.orders.types[type]}
                </button>
              ))}
            </div>
            <label className="posx-source-field">
              <span>مصدر الطلب</span>
              <select ref={sourceSelectRef} value={sourceId} onChange={(event) => setSourceId(event.target.value)} aria-label="مصدر الطلب" required>
                <option value="">اختر مصدر الطلب…</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name_ar}</option>)}
              </select>
            </label>
          </div>

'''
replace_once(
    '          {msg && <div className="ok dark-ok">{msg}</div>}\n\n          <div className="posx-cart-scroll">\n',
    '          {msg && <div className="ok dark-ok">{msg}</div>}\n\n' + order_rail + '          <div className="posx-cart-scroll">\n',
    'order rail mount',
)

old_lines = '''            <div className="posx-cart-lines">
            {!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}
            {cart.map((line, index) => (
              <div key={`${line.key}-${index}`} className="posx-line">
                <ProductThumb product={line.product} />
                <div className="posx-line-content">
                  <div className="posx-line-head">
                    <span className="posx-line-name">{line.product.name_ar}</span>
                    <span className="posx-line-total">{money(unitPrice(line) * line.qty)}</span>
                  </div>
                  <div className="posx-line-selection">
                    {line.variant?.name_ar && <span>{line.variant.name_ar}</span>}
                    {line.modifiers.map((modifier) => <span key={modifier.id}>{modifier.name_ar}</span>)}
                  </div>
                  <div className="posx-line-actions">
                    <span className="posx-line-qty" aria-label={`الكمية ${line.qty}`}>{line.qty}</span>
                    <button aria-label="زيادة الكمية" onClick={() => setCart((rows) => rows.map((row, i) => (i === index ? { ...row, qty: row.qty + 1 } : row)))}>+</button>
                    <button aria-label="تقليل الكمية" onClick={() => setCart((rows) => rows.flatMap((row, i) => i !== index ? [row] : row.qty > 1 ? [{ ...row, qty: row.qty - 1 }] : []))}>−</button>
                    <button className="rm" aria-label="حذف الصنف من الطلب" onClick={() => setCart((rows) => rows.filter((_, i) => i !== index))}>✕</button>
                  </div>
                  <input className="posx-line-note" placeholder={t.pos.itemNotes} value={line.notes} onChange={(e) => setCart((rows) => rows.map((row, i) => (i === index ? { ...row, notes: e.target.value } : row)))} />
                </div>
              </div>
            ))}
          </div>
'''
new_lines = '''            <div className="posx-cart-lines">
              {!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}
              {cart.map((line, index) => (
                <PosCartLine
                  key={`${line.key}-${index}`}
                  line={line}
                  totalLabel={money(unitPrice(line) * line.qty)}
                  onIncrease={() => setCart((rows) => rows.map((row, i) => i === index ? { ...row, qty: row.qty + 1 } : row))}
                  onDecrease={() => setCart((rows) => rows.flatMap((row, i) => i !== index ? [row] : row.qty > 1 ? [{ ...row, qty: row.qty - 1 }] : []))}
                  onRemove={() => setCart((rows) => rows.filter((_, i) => i !== index))}
                  onNotesChange={(notes) => setCart((rows) => rows.map((row, i) => i === index ? { ...row, notes } : row))}
                />
              ))}
            </div>
'''
replace_once(old_lines, new_lines, 'cart line component mount')

replace_once(
    '                <button key={method} className={payment === method ? "active" : ""} onClick={() => { setPayment(method); setCashTender(null); }}>{paymentLabels[method] ?? method}</button>\n',
    '                <button key={method} className={payment === method ? "active" : ""} onClick={() => setPayment(method)}>{paymentLabels[method] ?? method}</button>\n',
    'payment selection',
)

quick_panel = re.compile(
    r'            \{payment === "cash" && total > 0 && \(\n'
    r'              <div className="posx-change-panel">.*?'
    r'            \)\}\n',
    re.S,
)
text, count = quick_panel.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'quick-change panel: expected one match, found {count}')

replace_once(
    '            <div className="receipt-row posx-total"><span>{t.pos.total}</span><span>{quoteBusy && !currentQuote ? "…" : money(total)}</span></div>\n',
    '            <div className="receipt-row posx-total"><span>{t.pos.total}</span><span aria-live="polite">{!sourceId ? "—" : quoteBusy && !currentQuote ? "…" : currentQuote ? money(total) : "—"}</span></div>\n'
    '            {!sourceId && cart.length > 0 && <span className="posx-total-helper">اختر مصدر الطلب لحساب الإجمالي</span>}\n',
    'safe total display',
)

text = re.sub(r'^\s*setCashTender\(null\);\n', '', text, flags=re.M)
thumb_pattern = re.compile(r'\nfunction ProductThumb\(.*?\n}\n\nfunction ShiftPanel', re.S)
text, count = thumb_pattern.subn('\nfunction ShiftPanel', text, count=1)
if count != 1:
    raise SystemExit(f'legacy ProductThumb removal: expected one match, found {count}')

for token in ['cashTender', 'tenderSuggestions', 'selectedChange', 'ProductThumb product=', 'posx-shell-order-controls']:
    if token in text:
        raise SystemExit(f'legacy POS token remains: {token}')
for required in ['PosCartLine', 'posx-order-rail', 'posx-shell-operation-controls', 'sourceSelectRef', 'searchInputRef']:
    if required not in text:
        raise SystemExit(f'missing required token: {required}')

path.write_text(text, encoding='utf-8')

main = Path('apps/admin/src/main.tsx')
main_text = main.read_text(encoding='utf-8')
main_text = main_text.replace('import "./pos-cart-workflow.css";\n', '')
main_text = main_text.replace('import "./pos-layout-runtime";\n', '')
if 'import "./pos-fast-rail.css";' not in main_text:
    main_text = main_text.replace('import "./pos-delivery-checkout.css";\n', 'import "./pos-delivery-checkout.css";\nimport "./pos-fast-rail.css";\n')
main.write_text(main_text, encoding='utf-8')

for obsolete in ['apps/admin/src/pos-layout-runtime.ts', 'apps/admin/src/pos-cart-workflow.css']:
    obsolete_path = Path(obsolete)
    if obsolete_path.exists():
        obsolete_path.unlink()
