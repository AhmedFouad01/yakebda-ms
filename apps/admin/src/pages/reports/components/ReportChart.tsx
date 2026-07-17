import { useEffect, useId, useRef, useState } from "react";
import { formatReportMoney } from "../reportFormat";
import { reportText } from "../reportText";
import { loadECharts, type EChartsInstance } from "./echartsAdapter";

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
  brand: string;
  danger: string;
  text: string;
  muted: string;
  border: string;
  surface: string;
}

function cssToken(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

function readChartTokens(element: HTMLElement): ChartTokens {
  const style = getComputedStyle(element);
  return {
    brand: cssToken(style, "--brand", "currentColor"),
    danger: cssToken(style, "--danger", "currentColor"),
    text: cssToken(style, "--text-primary", "currentColor"),
    muted: cssToken(style, "--text-secondary", "currentColor"),
    border: cssToken(style, "--border-subtle", "currentColor"),
    surface: cssToken(style, "--surface-1", "transparent"),
  };
}

function chartOption(
  title: string,
  rows: ReportChartRow[],
  kind: "line" | "bar",
  tokens: ChartTokens
): Record<string, unknown> {
  const data = rows.map((row) => ({
    value: row.value,
    itemStyle: { color: row.value < 0 ? tokens.danger : tokens.brand },
  }));

  return {
    animation: false,
    backgroundColor: "transparent",
    aria: {
      enabled: true,
      decal: { show: false },
      description: `${title}. ${rows.map((row) => `${row.label}: ${formatReportMoney(row.value)}`).join("، ")}`,
    },
    grid: {
      top: 24,
      right: 18,
      bottom: rows.length > 6 ? 76 : 54,
      left: 70,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      appendToBody: true,
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
      textStyle: { color: tokens.text, fontFamily: "inherit" },
      valueFormatter: (value: unknown) => formatReportMoney(Number(value)),
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisLine: { lineStyle: { color: tokens.border } },
      axisTick: { alignWithLabel: true },
      axisLabel: {
        color: tokens.muted,
        interval: 0,
        rotate: rows.length > 6 ? 28 : 0,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: tokens.muted,
        formatter: (value: number) => new Intl.NumberFormat("ar-EG", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value),
      },
      splitLine: { lineStyle: { color: tokens.border, type: "dashed" } },
    },
    series: [{
      name: title,
      type: kind,
      data,
      smooth: false,
      symbolSize: 8,
      showSymbol: kind === "line",
      lineStyle: { width: 3, color: tokens.brand },
      itemStyle: { color: tokens.brand },
      barMaxWidth: 52,
      emphasis: { focus: "series" },
    }],
  };
}

export function ReportChart({
  title,
  rows,
  kind,
  valueLabel = reportText.value,
}: ReportChartProps) {
  const titleId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const [chartError, setChartError] = useState(false);
  const validRows = rows.filter((row) => Number.isFinite(row.value));
  const dataSignature = JSON.stringify(validRows);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || validRows.length === 0) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeHandler: (() => void) | null = null;
    let themeObserver: MutationObserver | null = null;
    setChartError(false);

    void loadECharts()
      .then((echarts) => {
        if (cancelled || !host) return;
        const chart = echarts.init(host, null, { renderer: "svg" });
        chartRef.current = chart;
        const render = () => {
          chart.setOption(chartOption(title, validRows, kind, readChartTokens(host)), {
            notMerge: true,
          });
        };
        render();

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => chart.resize());
          resizeObserver.observe(host);
        } else {
          resizeHandler = () => chart.resize();
          window.addEventListener("resize", resizeHandler);
        }

        if (typeof MutationObserver !== "undefined") {
          themeObserver = new MutationObserver(render);
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-theme"],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setChartError(true);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [kind, title, dataSignature]);

  if (!validRows.length) return null;

  return (
    <div className="rpt-chart" aria-labelledby={titleId}>
      <span id={titleId} className="rpt-visually-hidden">{title}</span>
      <div
        ref={hostRef}
        className="rpt-chart-canvas"
        role="img"
        aria-label={title}
      />
      {chartError && <p className="rpt-chart-warning" role="status">{reportText.chartUnavailable}</p>}

      <details className="rpt-chart-data">
        <summary>{reportText.showChartData}</summary>
        <div className="rpt-table-wrap">
          <table>
            <thead>
              <tr><th>{reportText.item}</th><th>{valueLabel}</th></tr>
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
