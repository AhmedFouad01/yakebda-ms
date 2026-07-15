import { createPortal } from "react-dom";
import { resolveAssetUrl } from "../../lib/api";
import { t } from "../../lib/t";
import { ProductCard } from "./ProductCard";
import { PosCart } from "./PosCart";
import { PosHistory } from "./PosHistory";
import { PosModals } from "./PosModals";
import type { PosController } from "./usePosController";
import { money } from "./utils";

export function PosWorkspace({ controller }: { controller: PosController }) {
  const {
    shellControlsRoot, branches, branchId, setBranchId, setHistoryOpen, searchInputRef,
    search, setSearch, shellSessionRoot, can, shift, setAdminPanel, cartDrawerOpen,
    setCartDrawerOpen, itemCount, activeCat, categories, setActiveCat, visibleProducts,
    cart, settings, addProduct, quickRemove,
  } = controller;
  const categoryOptions = [
    {
      id: "all",
      name: "الكل",
      imageUrl: categories.flatMap((category) => category.products).find((product) => product.image_url)?.image_url,
    },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name_ar,
      imageUrl: category.products.find((product) => product.image_url)?.image_url,
    })),
  ];

  return (
    <div className="posx" dir="rtl">
      {shellControlsRoot && createPortal(
        <div className="posx-shell-operation-controls" aria-label="أدوات تشغيل نقطة البيع">
          <label
            className="posx-shell-icon posx-branch-picker"
            title={branches.find((branch) => branch.id === branchId)?.name ?? "اختيار الفرع"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 9h18" /><path d="M5 9v11h14V9" /><path d="M8 20v-6h8v6" /><path d="m4 9 2-5h12l2 5" />
            </svg>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="اختيار الفرع">
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="posx-shell-icon posx-history-btn"
            title="سجل الطلبات"
            aria-label="سجل الطلبات"
            onClick={() => setHistoryOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />
            </svg>
          </button>
          <input
            ref={searchInputRef}
            className="posx-search"
            placeholder="ابحث باسم الصنف أو المكونات…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>,
        shellControlsRoot
      )}
      {shellSessionRoot && can("shifts.manage") && createPortal(
        <button
          type="button"
          className={`posx-shift-action${shift ? " is-open" : ""}`}
          onClick={() => setAdminPanel("shift")}
        >
          {shift ? t.shift.close : t.shift.open}
        </button>,
        shellSessionRoot
      )}

      <div className="posx-body">
        <section className="posx-menu">
          <div className="posx-menu-top">
            <div className="posx-menu-tools">
              <div className="posx-cats" aria-label="أقسام المنيو">
                {categoryOptions.map((category) => {
                  const imageSrc = resolveAssetUrl(category.imageUrl);
                  return (
                    <button
                      type="button"
                      key={category.id}
                      className={category.name === activeCat && !search ? "active" : ""}
                      onClick={() => { setActiveCat(category.name); setSearch(""); }}
                    >
                      <span className="posx-cat-media" aria-hidden="true">
                        <span className="posx-cat-fallback">{category.name.trim().charAt(0)}</span>
                        {imageSrc && <img src={imageSrc} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
                      </span>
                      <span className="posx-cat-label">{category.name}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="posx-cart-toggle"
                aria-controls="posx-cart-drawer"
                aria-expanded={cartDrawerOpen}
                onClick={() => setCartDrawerOpen(true)}
              >
                السلة <span>{itemCount}</span>
              </button>
            </div>
          </div>
          <div className="posx-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cartLines={cart}
                showImage={settings?.show_product_images !== false}
                money={money}
                onAdd={(variant, modifiers) => addProduct(product, variant, modifiers)}
                onQuickRemove={(variant, modifiers) => quickRemove(product, variant, modifiers)}
              />
            ))}
          </div>
        </section>


        <PosCart controller={controller} />
        {cartDrawerOpen && (
          <button
            type="button"
            className="posx-cart-backdrop"
            aria-label="إغلاق السلة"
            onClick={() => setCartDrawerOpen(false)}
          />
        )}
      </div>

      <PosHistory controller={controller} />
      <PosModals controller={controller} />
    </div>
  );
}
