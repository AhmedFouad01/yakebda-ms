import { useId } from "react";
import { formatReportMoney } from "../reportFormat";
import { reportText } from "../reportText";

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

export function ReportChart({
  title,
  rows,
  kind,
  valueLabel = reportText.value,
}: ReportChartProps) {
  const titleId = useId();
  const validRows = rows.filter((row) => Number.isFinite(row.value));
  if (!validRows.length) return null;

  const values = validRows.map((row) => row.value);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = Math.max(maximum - minimum, 1);
  const innerWidth = WIDTH - SIDE * 2;
  const innerHeight = HEIGHT - TOP - BOTTOM;
  const yFor = (value: number) => TOP + ((maximum - value) / range) * innerHeight;
  const baseline = yFor(0);

  const points = validRows.map((row, index) => {
    const x = validRows.length === 1
      ? WIDTH / 2
      : SIDE + (index / (validRows.length - 1)) * innerWidth;
    return { ...row, x, y: yFor(row.value) };
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
            const valueY = yFor(point.value);
            return (
              <rect
                key={`${point.label}-${index}`}
                className={`rpt-chart-bar${point.value < 0 ? " is-negative" : ""}`}
                x={SIDE + slot * index + (slot - barWidth) / 2}
                y={Math.min(valueY, baseline)}
                width={barWidth}
                height={Math.abs(baseline - valueY)}
                rx="4"
              />
            );
          })
        )}
      </svg>

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
