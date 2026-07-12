import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, FormField, Tabs, TextInput, ToggleSwitch } from "./primitives";

describe("shared UI primitives", () => {
  it("exposes an explicit selected state for tabs", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[["detail", "المراجعة"], ["receipt", "الفاتورة"]]}
        active="detail"
        onChange={onChange}
      />
    );

    const detail = screen.getByRole("tab", { name: "المراجعة" });
    const receipt = screen.getByRole("tab", { name: "الفاتورة" });

    expect(detail).toHaveAttribute("aria-selected", "true");
    expect(detail).toHaveClass("active");
    expect(receipt).toHaveAttribute("aria-selected", "false");

    fireEvent.click(receipt);
    expect(onChange).toHaveBeenCalledWith("receipt");
  });

  it("keeps the native checkbox semantics inside the modern toggle", () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} label="طابعة الإيصالات" onChange={onChange} />);

    const control = screen.getByRole("checkbox", { name: "طابعة الإيصالات" });
    expect(control).not.toBeChecked();

    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("associates form labels with wrapped inputs", () => {
    render(
      <FormField label="اسم الصنف">
        <TextInput defaultValue="ساندوتش سجق" />
      </FormField>
    );

    expect(screen.getByLabelText("اسم الصنف")).toHaveValue("ساندوتش سجق");
  });

  it("uses a safe button type and semantic variant class", () => {
    render(<Button variant="danger">إلغاء الطلب</Button>);
    const button = screen.getByRole("button", { name: "إلغاء الطلب" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("uif-btn", "danger");
  });
});
