const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

const moneyFormatter = new Intl.NumberFormat("ar-EG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function finiteNumber(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatReportNumber(value: number | string): string {
  const parsed = finiteNumber(value);
  return parsed == null ? "غير متاح" : numberFormatter.format(parsed);
}

export function formatReportMoney(value: number | string): string {
  const parsed = finiteNumber(value);
  return parsed == null ? "غير متاح" : `${moneyFormatter.format(parsed)} ج.م`;
}

export function formatReportDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "غير متاح";
  return parsed.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatReportTimestamp(value: string, timezone: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "غير متاح";
  try {
    return parsed.toLocaleString("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    });
  } catch {
    return "غير متاح";
  }
}
