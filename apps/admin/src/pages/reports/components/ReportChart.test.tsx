import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportChart } from "./ReportChart";

const mocks = vi.hoisted(() => ({
  loadECharts: vi.fn(),
  init: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("./echartsAdapter", () => ({
  loadECharts: mocks.loadECharts,
}));

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.init.mockReturnValue({
    setOption: mocks.setOption,
    resize: mocks.resize,
    dispose: mocks.dispose,
  });
  mocks.loadECharts.mockResolvedValue({ init: mocks.init });
});

describe("ReportChart", () => {
  it("initializes Apache ECharts with the SVG renderer and semantic accessible options", async () => {
    const { unmount } = render(
      <ReportChart
        title="اتجاه المبيعات"
        kind="line"
        rows={[{ label: "١٧ يوليو", value: 1250 }]}
      />
    );

    expect(screen.getByRole("img", { name: "اتجاه المبيعات" })).toBeTruthy();
    expect(screen.getByText("عرض جدول بيانات الرسم")).toBeTruthy();
    expect(screen.getByText("١٧ يوليو")).toBeTruthy();

    await waitFor(() => expect(mocks.init).toHaveBeenCalledTimes(1));
    expect(mocks.init.mock.calls[0][2]).toEqual({ renderer: "svg" });
    expect(mocks.setOption).toHaveBeenCalledTimes(1);
    const option = mocks.setOption.mock.calls[0][0];
    expect(option.aria.enabled).toBe(true);
    expect(option.xAxis.data).toEqual(["١٧ يوليو"]);
    expect(option.series[0]).toMatchObject({ type: "line", showSymbol: true });

    unmount();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the data table available when ECharts cannot load", async () => {
    mocks.loadECharts.mockRejectedValueOnce(new Error("network unavailable"));
    render(
      <ReportChart
        title="المبيعات حسب الفرع"
        kind="bar"
        rows={[{ label: "الفرع الرئيسي", value: 900 }]}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("تعذر تحميل الرسم التفاعلي");
    });
    expect(screen.getByText("عرض جدول بيانات الرسم")).toBeTruthy();
    expect(screen.getByText("الفرع الرئيسي")).toBeTruthy();
  });
});
