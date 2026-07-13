import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Drawer, Modal } from "./overlays";

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>فتح الدرج</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="سجل الطلبات">
        <button type="button">أول إجراء</button>
        <button type="button">آخر إجراء</button>
      </Drawer>
    </>
  );
}

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>فتح النافذة</button>
      <Modal open={open} onClose={() => setOpen(false)} title="تأكيد">
        <input aria-label="الاسم" />
        <button type="button">حفظ</button>
      </Modal>
    </>
  );
}

describe("overlay accessibility", () => {
  it("traps Tab inside the Drawer, closes on Escape and restores trigger focus", () => {
    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", { name: "فتح الدرج" });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "إغلاق" });
    const last = screen.getByRole("button", { name: "آخر إجراء" });
    expect(document.activeElement).toBe(close);

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("applies the same focus and Escape contract to Modal", () => {
    render(<ModalHarness />);
    const trigger = screen.getByRole("button", { name: "فتح النافذة" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "إغلاق" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
