import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportChart } from "./ReportChart";

/**
 * Chart.js renders to a real <canvas>, which jsdom does not implement, so the
 * chart components are stubbed and we assert on the data/options actually
 * handed to them. That is where the theme and styling contract lives.
 */
const captured = vi.hoisted(() => ({ line: [] as unknown[], bar: [] as unknown[] }));

vi.mock("react-chartjs-2", () => ({
  Line: (props: Record<string, unknown>) => {
    captured.line.push(props);
    return <div data-testid="chart-line" />;
  },
  Bar: (props: Record<string, unknown>) => {
    captured.bar.push(props);
    return <div data-testid="chart-bar" />;
  },
}));

function lastLine() {
  return captured.line.at(-1) as { data: any; options: any };
}
function lastBar() {
  return captured.bar.at(-1) as { data: any; options: any };
}

describe("ReportChart", () => {
  it("renders a line chart with a 2px stroke and a soft fill", () => {
    render(
      <ReportChart
        title="اتجاه المبيعات"
        kind="line"
        rows={[{ label: "١٧ يوليو", value: 1250 }, { label: "١٨ يوليو", value: 900 }]}
      />
    );

    expect(screen.getByTestId("chart-line")).toBeTruthy();
    const { data, options } = lastLine();
    const dataset = data.datasets[0];

    expect(data.labels).toEqual(["١٧ يوليو", "١٨ يوليو"]);
    expect(dataset.data).toEqual([1250, 900]);
    expect(dataset.borderWidth).toBe(2);
    expect(dataset.fill).toBe(true);
    expect(dataset.tension).toBe(0.25);
    expect(dataset.pointRadius).toBe(0);
    expect(dataset.pointHoverRadius).toBe(4);
    // soft fill derives from the series colour, never fully opaque
    expect(String(dataset.backgroundColor)).toMatch(/0\.11|11%/);
    expect(options.plugins.legend.display).toBe(false);
    expect(options.maintainAspectRatio).toBe(false);
    expect(options.scales.x.border.display).toBe(false);
  });

  it("renders bars for categorical reports and flags negative values as danger", () => {
    render(
      <ReportChart
        title="المبيعات حسب الفرع"
        kind="bar"
        rows={[{ label: "الفرع الرئيسي", value: 900 }, { label: "فرع تجريبي", value: -50 }]}
      />
    );

    expect(screen.getByTestId("chart-bar")).toBeTruthy();
    const dataset = lastBar().data.datasets[0];
    expect(dataset.borderWidth).toBe(2);
    expect(dataset.fill).toBe(false);
    expect(dataset.maxBarThickness).toBe(28);
    expect(Array.isArray(dataset.backgroundColor)).toBe(true);
    // the negative bar gets its own colour rather than the series colour
    expect(dataset.backgroundColor[0]).not.toBe(dataset.backgroundColor[1]);
  });

  it("keeps a single-point line visible without adding persistent points to longer series", () => {
    render(
      <ReportChart
        title="يوم واحد"
        kind="line"
        rows={[{ label: "٢٣ يوليو", value: 185 }]}
      />
    );

    expect(lastLine().data.datasets[0].pointRadius).toBe(4);
  });

  it("keeps an accessible description and the data table fallback", () => {
    render(
      <ReportChart
        title="اتجاه المبيعات"
        kind="line"
        rows={[{ label: "١٧ يوليو", value: 1250 }]}
      />
    );

    // accessible name is the report title on its own
    const figure = screen.getByRole("img", { name: "اتجاه المبيعات" });
    // series values reach screen readers via the description, not the name
    const describedBy = figure.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("١٧ يوليو");
    expect(screen.getByText("عرض جدول بيانات الرسم")).toBeTruthy();
    expect(screen.getByText("١٧ يوليو")).toBeTruthy();
  });

  it("renders nothing when every row is non-numeric", () => {
    const { container } = render(
      <ReportChart
        title="بلا بيانات"
        kind="line"
        rows={[{ label: "س", value: Number.NaN }]}
      />
    );
    expect(container.querySelector(".rpt-chart")).toBeNull();
  });
});
