import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DialogLayer, Drawer, Modal } from "./overlays";

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="screen-content">
      <button type="button" onClick={() => setOpen(true)}>فتح الدرج</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="سجل الطلبات">
        <button type="button">أول إجراء</button>
        <button type="button">آخر إجراء</button>
      </Drawer>
    </div>
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

function NestedOrderDialogHarness() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDrawerOpen(true)}>فتح سجل الطلبات</button>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="سجل الطلبات">
        <button type="button" onClick={() => setOrderOpen(true)}>فتح تفاصيل الطلب</button>
      </Drawer>
      <DialogLayer
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        className="modal wide od-modal"
        ariaLabel="تفاصيل الطلب"
      >
        <header className="od-modal-head">
          <button type="button" onClick={() => setOrderOpen(false)}>إغلاق التفاصيل</button>
        </header>
        <div className="od-modal-body">
          <button type="button">آخر إجراء في الطلب</button>
        </div>
      </DialogLayer>
    </>
  );
}

describe("overlay accessibility", () => {
  it("portals one RTL Drawer outside page content and locks background scrolling", () => {
    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", { name: "فتح الدرج" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    const overlay = dialog.closest("[data-uif-overlay='true']") as HTMLElement;
    expect(screen.getByTestId("screen-content").contains(dialog)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
    expect(document.body.querySelectorAll("[data-uif-overlay='true']")).toHaveLength(1);
    expect(dialog.getAttribute("dir")).toBe("rtl");
    expect(dialog.querySelector(".uif-drawer-body")).toBeTruthy();
    expect(document.body.classList.contains("uif-no-scroll")).toBe(true);

    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(overlay);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.classList.contains("uif-no-scroll")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

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

  it("keeps the background locked and restores focus when an order modal closes over a Drawer", () => {
    render(<NestedOrderDialogHarness />);
    const drawerTrigger = screen.getByRole("button", { name: "فتح سجل الطلبات" });
    drawerTrigger.focus();
    fireEvent.click(drawerTrigger);

    const orderTrigger = screen.getByRole("button", { name: "فتح تفاصيل الطلب" });
    orderTrigger.focus();
    fireEvent.click(orderTrigger);

    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    expect(document.body.classList.contains("uif-no-scroll")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "إغلاق التفاصيل" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.body.classList.contains("uif-no-scroll")).toBe(true);
    expect(document.activeElement).toBe(orderTrigger);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.classList.contains("uif-no-scroll")).toBe(false);
    expect(document.activeElement).toBe(drawerTrigger);
  });
});
