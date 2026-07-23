import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChartOptions } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { formatReportMoney } from "../reportFormat";
import { t } from "../../../lib/t";
import { ensureChartsRegistered } from "./chartSetup";

ensureChartsRegistered();

export interface ReportChartRow {
  label: string;
  value: number;
}

interface ReportChartProps {
  title: string;
  rows: ReportChartRow[];
  kind: "line" | "bar";
  valueLabel?: string;
}

interface ChartTokens {
  series: string;
  seriesAlt: string;
  danger: string;
  grid: string;
  axis: string;
  surface: string;
  text: string;
  border: string;
}

const FALLBACK: ChartTokens = {
  series: "#1d4ed8",
  seriesAlt: "#0e7490",
  danger: "#b3261e",
  grid: "#d5ddd8",
  axis: "#4f5d57",
  surface: "#ffffff",
  text: "#1d2622",
  border: "#c5cec9",
};

function token(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

function readChartTokens(element: HTMLElement | null): ChartTokens {
  if (!element || typeof getComputedStyle !== "function") return FALLBACK;
  const style = getComputedStyle(element);
  return {
    series: token(style, "--chart-series-1", FALLBACK.series),
    seriesAlt: token(style, "--chart-series-2", FALLBACK.seriesAlt),
    danger: token(style, "--danger", FALLBACK.danger),
    grid: token(style, "--chart-grid", FALLBACK.grid),
    axis: token(style, "--chart-axis", FALLBACK.axis),
    surface: token(style, "--surface-1", FALLBACK.surface),
    text: token(style, "--text-primary", FALLBACK.text),
    border: token(style, "--border-subtle", FALLBACK.border),
  };
}

/** Soft fill under the series — accepts hex or any CSS colour the theme supplies. */
function softFill(color: string, alpha: number): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
  let body = match[1];
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  const int = parseInt(body, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const compact = new Intl.NumberFormat("ar-EG", { notation: "compact", maximumFractionDigits: 1 });

export function ReportChart({
  title,
  rows,
  kind,
  valueLabel = t.reports.value,
}: ReportChartProps) {
  const titleId = useId();
  const descId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [tokens, setTokens] = useState<ChartTokens>(FALLBACK);

  const validRows = useMemo(
    () => rows.filter((row) => Number.isFinite(row.value)),
    [rows]
  );

  // Re-read tokens on mount and whenever the light/dark theme flips, so the
  // chart follows the theme the same way the rest of the UI does.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const sync = () => setTokens(readChartTokens(host));
    sync();

    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => {
    const values = validRows.map((row) => row.value);
    const base = kind === "line" ? tokens.series : tokens.seriesAlt;
    return {
      labels: validRows.map((row) => row.label),
      datasets: [
        {
          label: title,
          data: values,
          borderColor: base,
          borderWidth: 2,
          backgroundColor:
            kind === "line"
              ? softFill(base, 0.11)
              : values.map((value) => (value < 0 ? tokens.danger : softFill(base, 0.75))),
          fill: kind === "line",
          tension: 0.25,
          pointRadius: kind === "line" && validRows.length === 1 ? 4 : 0,
          pointHoverRadius: 4,
          pointBackgroundColor: base,
          borderRadius: kind === "bar" ? 6 : undefined,
          maxBarThickness: 28,
        },
      ],
    };
  }, [validRows, kind, title, tokens]);

  const options = useMemo<ChartOptions<"line" | "bar">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderWidth: 1,
        titleColor: tokens.text,
        bodyColor: tokens.text,
        displayColors: false,
        callbacks: {
          label: (item) => formatReportMoney(Number(item.parsed.y)),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: tokens.axis,
          autoSkip: false,
          maxRotation: validRows.length > 6 ? 28 : 0,
        },
      },
      y: {
        grid: { color: tokens.grid },
        border: { display: false },
        ticks: {
          color: tokens.axis,
          callback: (value) => compact.format(Number(value)),
        },
      },
    },
  }), [tokens, validRows.length]);

  if (!validRows.length) return null;

  const ChartComponent = kind === "line" ? Line : Bar;
  const describedRows = validRows
    .map((row) => `${row.label}: ${formatReportMoney(row.value)}`)
    .join("، ");

  return (
    <div className="rpt-chart" aria-labelledby={titleId}>
      <span id={titleId} className="rpt-visually-hidden">{title}</span>
      {/* Accessible name stays the report title; the series values are exposed
          as the description so screen readers get both, not one run-on label. */}
      <div
        ref={hostRef}
        className="rpt-chart-canvas"
        role="img"
        aria-label={title}
        aria-describedby={descId}
      >
        <ChartComponent data={data as never} options={options as never} />
      </div>
      <span id={descId} className="rpt-visually-hidden">{describedRows}</span>

      <details className="rpt-chart-data">
        <summary>{t.reports.showChartData}</summary>
        <div className="rpt-table-wrap">
          <table>
            <thead>
              <tr><th>{t.reports.item}</th><th>{valueLabel}</th></tr>
            </thead>
            <tbody>
              {validRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{formatReportMoney(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
