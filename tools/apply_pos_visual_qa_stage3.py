from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# POS structure: keep the operating controls outside the scroll container.
# ---------------------------------------------------------------------------
pos_path = Path("apps/admin/src/pages/Pos.tsx")
pos = pos_path.read_text(encoding="utf-8")

pos = pos.replace('document.querySelector(".posx-menu")', 'document.querySelector(".posx-product-scroll")')

old_grid = '''          <div className="posx-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                qty={productQty(product)}
                showImage={settings?.show_product_images !== false}
                money={money}
                onAdd={(variant, mods) => addProduct(product, variant, mods)}
                onQuickRemove={() => quickRemove(product)}
                onOpenDetail={() => setPicking(product)}
              />
            ))}
          </div>
        </section>'''
new_grid = '''          <div className="posx-product-scroll">
            <div className="posx-grid">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  qty={productQty(product)}
                  showImage={settings?.show_product_images !== false}
                  money={money}
                  onAdd={(variant, mods) => addProduct(product, variant, mods)}
                  onQuickRemove={() => quickRemove(product)}
                  onOpenDetail={() => setPicking(product)}
                />
              ))}
            </div>
          </div>
        </section>'''
pos = replace_once(pos, old_grid, new_grid, "product scroll structure")

old_placeholder = '<span className="posx-card2-img ph">{product.name_ar.trim().charAt(0)}</span>'
new_placeholder = '''<span className="posx-card2-img ph" aria-label="لا توجد صورة">
            <span className="posx-card2-ph-icon" aria-hidden="true">▧</span>
            <small>بدون صورة</small>
          </span>'''
pos = replace_once(pos, old_placeholder, new_placeholder, "product image placeholder")

pos_path.write_text(pos, encoding="utf-8")


# ---------------------------------------------------------------------------
# POS CSS: remove the legacy auto-fill override and install the final layout.
# ---------------------------------------------------------------------------
css_path = Path("apps/admin/src/ykms-02f.css")
css = css_path.read_text(encoding="utf-8")

css = replace_once(
    css,
    '.posx-grid { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)) !important; }',
    '.posx-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }',
    "legacy desktop auto-fill",
)
css = replace_once(
    css,
    '  .posx-grid { grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)) !important; }',
    '  .posx-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
    "legacy medium auto-fill",
)

stage3 = r'''

/* ================================================================
   YKMS-02G-E Stage 3 — verified cashier-screen structure
   The operating layer is outside the product scroll area.
   ================================================================ */

.app2-pos .app2-main.full,
.app2-pos .posx,
.app2-pos .posx-body { min-height: 0; overflow: hidden; }

.app2-pos .posx-menu {
  min-height: 0;
  overflow: hidden;
  padding: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--yk-black);
}

.app2-pos .posx-menu-top {
  position: relative;
  inset: auto;
  z-index: 24;
  margin: 0;
  padding: 10px 14px 9px;
  background: #0b0e10;
  border-bottom: 1px solid var(--yk-line);
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.28);
}

.app2-pos .posx-menu-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 9px;
}
.app2-pos .posx-menu-tools > select { flex: 0 0 160px; min-width: 140px; }
.app2-pos .posx-menu-tools .posx-shift { flex: 0 0 auto; }
.app2-pos .posx-menu-tools .posx-search { flex: 1 1 280px; min-width: 220px; width: auto; }
.app2-pos .posx-menu-tools .posx-history-btn,
.app2-pos .posx-menu-tools .posx-adminmenu { flex: 0 0 auto; }

.app2-pos .posx-menu-top .posx-cats {
  position: relative;
  inset: auto;
  z-index: 1;
  margin: 0;
  padding: 0 0 1px;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  background: transparent;
}

.app2-pos .posx-product-scroll {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 14px 22px;
  overscroll-behavior: contain;
}

.app2-pos .posx-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 18px;
  align-items: start;
  align-content: start;
}

.app2-pos .posx-card2 {
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: auto;
  overflow: hidden;
  border: 1px solid #725c12;
  border-radius: 12px;
  background: var(--yk-panel);
}

.app2-pos .posx-card2-media {
  width: 100%;
  aspect-ratio: 1.12 / 1;
  min-height: 190px;
  background: #0f1316;
  border-bottom: 1px solid var(--yk-yellow);
}
.app2-pos .posx-card2-img { width: 100%; height: 100%; object-fit: cover; }
.app2-pos .posx-card2-img.ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: radial-gradient(circle at 50% 36%, #2b260f 0, #161810 44%, #101416 100%);
  color: #b79a43;
  font-size: 14px;
  font-weight: 800;
}
.app2-pos .posx-card2-ph-icon { font-size: 30px; line-height: 1; opacity: 0.78; }
.app2-pos .posx-card2-img.ph small { color: #8e8670; font-size: 11px; font-weight: 700; }

.app2-pos .posx-card2-info { padding: 12px 14px 8px; text-align: center; }
.app2-pos .posx-card2-name {
  min-height: 54px;
  margin: 0;
  display: grid;
  place-items: center;
  font-size: clamp(18px, 1.18vw, 22px);
  line-height: 1.35;
  font-weight: 900;
}
.app2-pos .posx-card2-price { margin-top: 3px; font-size: 14px; }

.app2-pos .posx-card2-opt {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 6px 14px;
}
.app2-pos .posx-card2-opt-label {
  padding-top: 5px;
  color: var(--yk-muted);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 900;
  white-space: normal;
}
.app2-pos .posx-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
}
.app2-pos .posx-chips button {
  min-width: 72px;
  min-height: 30px;
  padding: 3px 12px;
  white-space: nowrap;
}

.app2-pos .posx-card2-foot {
  min-height: 58px;
  margin-top: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid rgba(246, 192, 38, 0.2);
}
.app2-pos .posx-card2-hint { color: #817c6e; font-size: 10.5px; }
.app2-pos .posx-card2-stepper { grid-template-columns: 38px 34px 38px; }
.app2-pos .posx-card2-stepper button { width: 38px; height: 36px; }

@media (max-width: 1450px) {
  .app2-pos .posx-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .app2-pos .posx-card2-media { min-height: 180px; }
}
@media (max-width: 1080px) {
  .app2-pos .posx-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .app2-pos .posx-menu-tools .posx-search { flex-basis: 100%; order: 5; }
}
@media (max-width: 760px) {
  .app2-pos .posx-grid { grid-template-columns: minmax(0, 1fr) !important; }
  .app2-pos .posx-product-scroll { padding: 10px; }
  .app2-pos .posx-card2-media { min-height: 220px; }
}
'''

if "YKMS-02G-E Stage 3 — verified cashier-screen structure" in css:
    raise SystemExit("Stage 3 CSS already exists")
css += stage3
css_path.write_text(css, encoding="utf-8")

print("Applied POS visual QA stage 3")
