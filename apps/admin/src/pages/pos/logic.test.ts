import { describe, expect, it, vi } from "vitest";
import {
  cartLineKey,
  cartSubtotal,
  getOrderSubmissionState,
  hasRequiredSelections,
  selectVariantForOptions,
  submitWithSuccessReset,
  type PosProductLike,
} from "./logic";

const product: PosProductLike = {
  id: "product-1",
  effective_price: 20,
  variants: [
    { id: "small-fino", name_ar: "لقمة فينو", price_delta: 0 },
    { id: "small-siahi", name_ar: "لقمة سياحي", price_delta: 1 },
    { id: "large-fino", name_ar: "هامر فينو", price_delta: 5 },
    { id: "large-siahi", name_ar: "هامر سياحي", price_delta: 6 },
  ],
  modifier_groups: [
    {
      id: "bread",
      name_ar: "نوع العيش",
      min_select: 1,
      max_select: 1,
      is_required: true,
      modifiers: [
        { id: "fino", name_ar: "فينو", price_delta: 0 },
        { id: "siahi", name_ar: "سياحي", price_delta: 2 },
      ],
    },
  ],
};

describe("POS cart totals", () => {
  it("includes quantity, variant and bread deltas in the subtotal", () => {
    const subtotal = cartSubtotal([
      {
        product,
        variant: product.variants.find((variant) => variant.id === "large-siahi"),
        modifiers: [product.modifier_groups[0].modifiers[1]],
        qty: 2,
      },
      {
        product: { ...product, id: "product-2", effective_price: 10 },
        variant: null,
        modifiers: [],
        qty: 1,
      },
    ]);

    expect(subtotal).toBe(66);
  });

  it("builds a stable key regardless of modifier order", () => {
    const first = cartLineKey(product, product.variants[0], [{ id: "b" }, { id: "a" }]);
    const second = cartLineKey(product, product.variants[0], [{ id: "a" }, { id: "b" }]);
    expect(first).toBe(second);
  });
});

describe("POS variant selection", () => {
  it("rejects a required bread group until a valid bread is selected", () => {
    expect(hasRequiredSelections(product, {})).toBe(false);
    expect(hasRequiredSelections(product, { bread: product.modifier_groups[0].modifiers[0] })).toBe(true);
  });

  it("maps لقمة/هامر and فينو/سياحي to the matching structured variant", () => {
    expect(selectVariantForOptions(product, "لقمة", ["سياحي"])?.id).toBe("small-siahi");
    expect(selectVariantForOptions(product, "هامر", ["فينو"])?.id).toBe("large-fino");
  });
});

describe("POS payment gating", () => {
  const validGate = {
    cartLength: 1,
    sourceId: "source-1",
    busy: false,
    hasQuote: true,
    quoteBusy: false,
    quoteError: "",
    deliveryIncomplete: false,
    belowMinDelivery: false,
    discountReasonMissing: false,
    discountOverLimit: false,
    canDiscountAboveLimit: false,
    cashBlocked: false,
  };

  it("disables طلب الآن for an empty cart and shows loading while submitting", () => {
    expect(getOrderSubmissionState({ ...validGate, cartLength: 0 })).toMatchObject({
      disabled: true,
      reason: "السلة فارغة",
      label: "طلب الآن",
    });
    expect(getOrderSubmissionState({ ...validGate, busy: true })).toMatchObject({
      disabled: true,
      label: "جاري تسجيل الطلب…",
    });
  });

  it("runs reset only after a successful submission", async () => {
    const reset = vi.fn();
    await expect(submitWithSuccessReset(async () => { throw new Error("failed"); }, reset)).rejects.toThrow("failed");
    expect(reset).not.toHaveBeenCalled();

    await expect(submitWithSuccessReset(async () => ({ id: "order-1" }), reset)).resolves.toEqual({ id: "order-1" });
    expect(reset).toHaveBeenCalledOnce();
  });
});
