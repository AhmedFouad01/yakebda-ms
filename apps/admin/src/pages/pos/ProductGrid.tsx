import { usePosController } from "./PosContext";
import { ProductCard } from "./ProductCard";

export function ProductGrid() {
  const {
    activeCat,
    setActiveCat,
    search,
    setSearch,
    categories,
    visibleProducts,
    cart,
    settings,
    addProduct,
    quickRemove,
    itemCount,
    cartDrawerOpen,
    setCartDrawerOpen,
  } = usePosController();

  return (
    <section className="posx-menu">
      <div className="posx-menu-top">
        <div className="posx-menu-tools">
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
        <div className="posx-cats">
          <button className={activeCat === "الكل" && !search ? "active" : ""} onClick={() => { setActiveCat("الكل"); setSearch(""); }}>الكل</button>
          {categories.map((category) => (
            <button key={category.id} className={category.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(category.name_ar); setSearch(""); }}>
              {category.name_ar}
            </button>
          ))}
        </div>
      </div>
      <div className="posx-grid">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            cartLines={cart}
            showImage={settings?.show_product_images !== false}
            onAdd={(variant, modifiers) => addProduct(product, variant, modifiers)}
            onQuickRemove={(variant, modifiers) => quickRemove(product, variant, modifiers)}
          />
        ))}
      </div>
    </section>
  );
}
