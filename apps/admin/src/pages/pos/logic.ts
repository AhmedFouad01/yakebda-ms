export interface PosModifierLike {
  id: string;
  name_ar: string;
  price_delta: string | number;
}

export interface PosGroupLike {
  id: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  modifiers: PosModifierLike[];
}

export interface PosVariantLike {
  id: string;
  name_ar: string;
  price_delta: string | number;
}

export interface PosProductLike {
  id: string;
  effective_price: number;
  variants: PosVariantLike[];
  modifier_groups: PosGroupLike[];
}

export interface PosCartLineLike {
  product: PosProductLike;
  variant?: PosVariantLike | null;
  modifiers: PosModifierLike[];
  qty: number;
}

export function unitPrice(line: PosCartLineLike): number {
  return (
    Number(line.product.effective_price) +
    Number(line.variant?.price_delta ?? 0) +
    line.modifiers.reduce((sum, modifier) => sum + Number(modifier.price_delta ?? 0), 0)
  );
}

export function cartSubtotal(lines: PosCartLineLike[]): number {
  return lines.reduce((sum, line) => sum + unitPrice(line) * line.qty, 0);
}

export function cartLineKey(
  product: Pick<PosProductLike, "id">,
  variant?: Pick<PosVariantLike, "id"> | null,
  modifiers: Array<Pick<PosModifierLike, "id">> = []
): string {
  return `${product.id}|${variant?.id ?? ""}|${modifiers.map((modifier) => modifier.id).sort().join(",")}`;
}

export function requiredSingleSelectGroups(product: PosProductLike): PosGroupLike[] {
  return product.modifier_groups.filter(
    (group) => group.is_required && group.max_select === 1
  );
}

export function hasRequiredSelections(
  product: PosProductLike,
  selections: Record<string, PosModifierLike | undefined>
): boolean {
  return requiredSingleSelectGroups(product).every((group) => {
    const selected = selections[group.id];
    return Boolean(selected && group.modifiers.some((modifier) => modifier.id === selected.id));
  });
}

export function sizeLabel(product: PosProductLike, name: string): string {
  const breadTerms = Array.from(
    new Set(
      requiredSingleSelectGroups(product)
        .flatMap((group) => group.modifiers.map((modifier) => modifier.name_ar.trim()))
        .filter(Boolean)
    )
  );
  let label = name.trim();
  for (const bread of breadTerms) label = label.split(bread).join(" ");
  label = label
    .replace(/\b(فينو|سياحي)\b/g, " ")
    .replace(/[\-–—/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label || name.trim();
}

export function selectVariantForOptions(
  product: PosProductLike,
  selectedSize: string,
  selectedBreadNames: string[]
): PosVariantLike | null {
  const exact = product.variants.find((variant) => {
    if (sizeLabel(product, variant.name_ar) !== selectedSize) return false;
    return selectedBreadNames.every((bread) => variant.name_ar.includes(bread));
  });
  return exact ?? product.variants.find((variant) => sizeLabel(product, variant.name_ar) === selectedSize) ?? null;
}

export interface OrderSubmissionGateInput {
  cartLength: number;
  sourceId: string;
  busy: boolean;
  hasQuote: boolean;
  quoteBusy: boolean;
  quoteError: string;
  deliveryIncomplete: boolean;
  belowMinDelivery: boolean;
  discountReasonMissing: boolean;
  discountOverLimit: boolean;
  canDiscountAboveLimit: boolean;
  cashBlocked: boolean;
}

export interface OrderSubmissionState {
  disabled: boolean;
  label: string;
  reason: string | null;
}

export function getOrderSubmissionState(input: OrderSubmissionGateInput): OrderSubmissionState {
  const reason = !input.cartLength
    ? "السلة فارغة"
    : !input.sourceId
      ? "اختر مصدر الطلب"
      : input.quoteError
        ? input.quoteError
        : input.quoteBusy || !input.hasQuote
          ? "جاري حساب الإجمالي"
          : input.deliveryIncomplete
            ? "بيانات الدليفري ناقصة"
            : input.belowMinDelivery
              ? "أقل من الحد الأدنى للتوصيل"
              : input.discountReasonMissing
                ? "سبب الخصم مطلوب"
                : input.discountOverLimit && !input.canDiscountAboveLimit
                  ? "الخصم يتطلب موافقة مدير"
                  : input.cashBlocked
                    ? "يجب فتح شيفت"
                    : null;

  return {
    disabled: input.busy || Boolean(reason),
    label: input.busy ? "جاري تسجيل الطلب…" : "طلب الآن",
    reason,
  };
}

export async function submitWithSuccessReset<T>(
  submit: () => Promise<T>,
  onSuccess: (value: T) => void
): Promise<T> {
  const result = await submit();
  onSuccess(result);
  return result;
}
