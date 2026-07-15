import { formatDecimal, parseDecimal } from "./inventoryMath";

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

export const toMinorUnits = (value: string | number): bigint => parseDecimal(value, 2);
export const fromMinorUnits = (value: bigint): string => formatDecimal(value, 2);

export function allocateGross(
  input: {
    grossMinor: bigint;
    totalGrossMinor: bigint;
    totalVatMinor: bigint;
    priorGrossMinor: bigint;
    priorRevenueMinor: bigint;
    priorVatMinor: bigint;
  }
): { revenueMinor: bigint; vatMinor: bigint } {
  const totalRevenue = input.totalGrossMinor - input.totalVatMinor;
  const remainingGross = input.totalGrossMinor - input.priorGrossMinor;
  const remainingRevenue = totalRevenue - input.priorRevenueMinor;
  const remainingVat = input.totalVatMinor - input.priorVatMinor;
  if (input.grossMinor <= 0n || input.grossMinor > remainingGross) {
    throw new Error("Payment allocation exceeds remaining order total");
  }
  if (input.grossMinor === remainingGross) {
    return { revenueMinor: remainingRevenue, vatMinor: remainingVat };
  }
  let vatMinor = input.totalGrossMinor > 0n
    ? divideRounded(input.grossMinor * input.totalVatMinor, input.totalGrossMinor)
    : 0n;
  if (vatMinor > remainingVat) vatMinor = remainingVat;
  const revenueMinor = input.grossMinor - vatMinor;
  if (revenueMinor > remainingRevenue) {
    return { revenueMinor: remainingRevenue, vatMinor: input.grossMinor - remainingRevenue };
  }
  return { revenueMinor, vatMinor };
}

export function allocateRefund(
  input: {
    refundGrossMinor: bigint;
    originalGrossMinor: bigint;
    originalRevenueMinor: bigint;
    originalVatMinor: bigint;
    priorRefundGrossMinor: bigint;
    priorRefundRevenueMinor: bigint;
    priorRefundVatMinor: bigint;
  }
): { revenueMinor: bigint; vatMinor: bigint } {
  const remainingGross = input.originalGrossMinor - input.priorRefundGrossMinor;
  const remainingRevenue = input.originalRevenueMinor - input.priorRefundRevenueMinor;
  const remainingVat = input.originalVatMinor - input.priorRefundVatMinor;
  if (input.refundGrossMinor <= 0n || input.refundGrossMinor > remainingGross) {
    throw new Error("Refund allocation exceeds original payment");
  }
  if (input.refundGrossMinor === remainingGross) {
    return { revenueMinor: remainingRevenue, vatMinor: remainingVat };
  }
  let vatMinor = divideRounded(input.refundGrossMinor * input.originalVatMinor, input.originalGrossMinor);
  if (vatMinor > remainingVat) vatMinor = remainingVat;
  const revenueMinor = input.refundGrossMinor - vatMinor;
  if (revenueMinor > remainingRevenue) {
    return { revenueMinor: remainingRevenue, vatMinor: input.refundGrossMinor - remainingRevenue };
  }
  return { revenueMinor, vatMinor };
}
