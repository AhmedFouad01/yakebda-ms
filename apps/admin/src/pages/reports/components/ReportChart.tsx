import { useId } from "react";
import { formatReportMoney } from "../reportFormat";

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

const WIDTH = 640;
const HEIGHT = 240;
const TOP = 18;
const BOTTOM = 38;
const SIDE = 34;

export function ReportChart({ title, rows, kind, valueLabel = "القيمة" }: ReportChartProps) {
  const titleId = useId();
  const validRows = rows.filter((row) => Number.isFinite(row.value));
  if (!validRows.length) return null;

  const maxMagnitude = Math.max(...validRows.map((row) => Math.abs(row.value)), 1);
  const innerWidth = WIDTH - SIDE * 2;
  const innerHeight = HEIGHT - TOP - BOTTOM;
  const baseline = HEIGHT - BOTTOM;

  const points = validRows.map((row, index) => {
    const x = validRows.length === 1
      ? WIDTH / 2
      : SIDE + (index / (validRows.length - 1)) * innerWidth;
    const y = baseline - (Math.max(row.value, 0) / maxMagnitude) * innerHeight;
    return { ...row, x, y };
  });

  return (
    <div className="rpt-chart">
      <svg
        className="rpt-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{title}</title>
        <line className="rpt-chart-axis" x1={SIDE} y1={baseline} x2={WIDTH - SIDE} y2={baseline} />
        <line className="rpt-chart-grid" x1={SIDE} y1={TOP} x2={WIDTH - SIDE} y2={TOP} />
        <line
          className="rpt-chart-grid"
          x1={SIDE}
          y1={TOP + innerHeight / 2}
          x2={WIDTH - SIDE}
          y2={TOP + innerHeight / 2}
        />

        {kind === "line" ? (
          <>
            <polyline
              className="rpt-chart-series"
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
            />
            {points.map((point) => (
              <circle
                key={`${point.label}-${point.x}`}
                className="rpt-chart-point"
                cx={point.x}
                cy={point.y}
                r="5"
              />
            ))}
          </>
        ) : (
          points.map((point, index) => {
            const slot = innerWidth / Math.max(points.length, 1);
            const barWidth = Math.min(52, Math.max(16, slot * 0.56));
            const height = (Math.abs(point.value) / maxMagnitude) * innerHeight;
            return (
              <rect
                key={`${point.label}-${index}`}
                className={`rpt-chart-bar${point.value < 0 ? " is-negative" : ""}`}
                x={SIDE + slot * index + (slot - barWidth) / 2}
                y={point.value < 0 ? baseline : baseline - height}
                width={barWidth}
                height={height}
                rx="4"
              />
            );
          })
        )}
      </svg>

      <details className="rpt-chart-data">
        <summary>عرض جدول بيانات الرسم</summary>
        <div className="rpt-table-wrap">
          <table>
            <thead>
              <tr><th>البند</th><th>{valueLabel}</th></tr>
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
