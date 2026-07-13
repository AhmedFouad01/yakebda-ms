import { useEffect, useState } from "react";
import { resolveAssetUrl } from "../../lib/api";
import { t } from "../../lib/t";
import type { CartLine, MenuGroup, MenuModifier, MenuProduct, MenuVariant } from "./posTypes";
import { cartLineKey, money } from "./posUtils";

interface ProductCardProps {
  product: MenuProduct;
  cartLines: CartLine[];
  showImage: boolean;
  onAdd: (variant: MenuVariant | null, modifiers: MenuModifier[]) => void;
  onQuickRemove: (variant: MenuVariant | null, modifiers: MenuModifier[]) => void;
}

export function ProductCard({ product, cartLines, showImage, onAdd, onQuickRemove }: ProductCardProps) {
  const inlineGroups = product.modifier_groups.filter((group) => group.is_required && group.max_select === 1);
  const breadTerms = Array.from(new Set(
    inlineGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.name_ar.trim())).filter(Boolean)
  ));

  function sizeLabel(name: string) {
    let label = name.trim();
    for (const bread of breadTerms) label = label.split(bread).join(" ");
    label = label.replace(/\b(فينو|سياحي)\b/g, " ").replace(/[\-–—/|]+/g, " ").replace(/\s+/g, " ").trim();
    return label || name.trim();
  }

  const sizeOptions = product.variants.reduce<Array<{ label: string; fallback: MenuVariant }>>((result, item) => {
    const label = sizeLabel(item.name_ar);
    if (!result.some((option) => option.label === label)) result.push({ label, fallback: item });
    return result;
  }, []);

  const [breadSel, setBreadSel] = useState<Record<string, MenuModifier>>(() => {
    const initial: Record<string, MenuModifier> = {};
    for (const group of inlineGroups) if (group.modifiers[0]) initial[group.id] = group.modifiers[0];
    return initial;
  });
  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);

  const selectedModifiers = Object.values(breadSel);
  const selectedBreadNames = selectedModifiers.map((modifier) => modifier.name_ar.trim()).filter(Boolean);
  const selectedSize = variant ? sizeLabel(variant.name_ar) : sizeOptions[0]?.label ?? "";

  function chooseVariant(size: string, breadNames = selectedBreadNames) {
    const exact = product.variants.find((item) => {
      if (sizeLabel(item.name_ar) !== size) return false;
      return breadNames.length === 0 || breadNames.every((bread) => item.name_ar.includes(bread));
    });
    return exact ?? product.variants.find((item) => sizeLabel(item.name_ar) === size) ?? null;
  }

  function selectModifier(group: MenuGroup, modifier: MenuModifier) {
    setBreadSel((current) => ({ ...current, [group.id]: modifier }));
    if (selectedSize) {
      const nextBreadNames = Object.entries(breadSel)
        .map(([groupId, selected]) => groupId === group.id ? modifier.name_ar.trim() : selected.name_ar.trim())
        .filter(Boolean);
      setVariant(chooseVariant(selectedSize, nextBreadNames));
    }
  }

  const imageSrc = resolveAssetUrl(product.image_url);
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => setImageBroken(false), [imageSrc]);

  const priceNow =
    product.effective_price +
    Number(variant?.price_delta ?? 0) +
    selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price_delta ?? 0), 0);
  const selectedKey = cartLineKey(product, variant, selectedModifiers);
  const selectedQty = cartLines
    .filter((line) => line.key === selectedKey)
    .reduce((sum, line) => sum + line.qty, 0);
  const hasInlineOptions = sizeOptions.length > 0 || inlineGroups.length > 0;

  function isControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a"));
  }

  return (
    <article
      className={product.is_available ? "posx-card2" : "posx-card2 off"}
      role="button"
      tabIndex={product.is_available ? 0 : -1}
      aria-label={`${product.name_ar} — كليك شمال للإضافة، كليك يمين للتقليل`}
      onClick={(event) => { if (!isControl(event.target) && product.is_available) onAdd(variant, selectedModifiers); }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!isControl(event.target) && selectedQty > 0) onQuickRemove(variant, selectedModifiers);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isControl(event.target)) {
          event.preventDefault();
          if (product.is_available) onAdd(variant, selectedModifiers);
        }
      }}
    >
      <div className="posx-card2-media">
        {showImage && imageSrc && !imageBroken
          ? <img className="posx-card2-img" src={imageSrc} alt={product.name_ar} onError={() => setImageBroken(true)} />
          : <span className="posx-card2-img ph" />}
        <span className="posx-card2-price">{money(priceNow)}</span>
        {selectedQty > 0 && <span className="posx-card2-qty-badge">×{selectedQty}</span>}
      </div>

      <div className="posx-card2-info">
        <h3 className="posx-card2-name">{product.name_ar}</h3>
      </div>

      {!product.is_available && <div className="posx-card2-off">{product.availability_note_ar ?? t.menu.unavailable}</div>}

      {product.is_available && (
        <div className="posx-card2-options">
          {sizeOptions.length > 0 && (
            <div className="posx-card2-opt">
              <span className="posx-card2-opt-label">الحجم</span>
              <div className="posx-chips" role="group" aria-label="الحجم">
                {sizeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.label}
                    className={selectedSize === option.label ? "active" : ""}
                    onClick={(event) => { event.stopPropagation(); setVariant(chooseVariant(option.label)); }}
                    onContextMenu={(event) => event.stopPropagation()}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {inlineGroups.map((group) => (
            <div key={group.id} className="posx-card2-opt">
              <span className="posx-card2-opt-label">{group.name_ar.includes("عيش") ? "نوع العيش" : group.name_ar}</span>
              <div className="posx-chips" role="group" aria-label={group.name_ar}>
                {group.modifiers.map((modifier) => (
                  <button
                    type="button"
                    key={modifier.id}
                    className={breadSel[group.id]?.id === modifier.id ? "active" : ""}
                    onClick={(event) => { event.stopPropagation(); selectModifier(group, modifier); }}
                    onContextMenu={(event) => event.stopPropagation()}
                  >
                    {modifier.name_ar}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!hasInlineOptions && <div className="posx-card2-direct">اضغط على الكارت للإضافة</div>}
        </div>
      )}
    </article>
  );
}
