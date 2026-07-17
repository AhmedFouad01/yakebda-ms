const POWERS_OF_TEN = [1n, 10n, 100n, 1000n, 10000n, 100000n, 1000000n, 10000000n, 100000000n] as const;

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

export function parseDecimal(value: string | number, scale: number): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || scale < 0 || scale >= POWERS_OF_TEN.length) {
    throw new Error("Invalid decimal value");
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] ?? "";
  const retained = fraction.slice(0, scale).padEnd(scale, "0");
  let result = BigInt(match[2]) * POWERS_OF_TEN[scale] + BigInt(retained || "0");
  const firstDiscarded = fraction[scale];
  if (firstDiscarded && firstDiscarded >= "5") result += 1n;
  return sign * result;
}

export function formatDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const divisor = POWERS_OF_TEN[scale];
  return `${sign}${absolute / divisor}.${(absolute % divisor).toString().padStart(scale, "0")}`;
}

export function convertQuantity(quantityScale6: bigint, factorScale8: bigint): bigint {
  return divideRounded(quantityScale6 * factorScale8, POWERS_OF_TEN[8]);
}

export function valueFromQuantity(quantityScale6: bigint, unitCostScale4: bigint): bigint {
  return divideRounded(quantityScale6 * unitCostScale4, POWERS_OF_TEN[6]);
}

export function averageUnitCost(valueScale4: bigint, quantityScale6: bigint): bigint {
  if (quantityScale6 <= 0n) return 0n;
  return divideRounded(valueScale4 * POWERS_OF_TEN[6], quantityScale6);
}
