import { ReactNode, useEffect, useState } from "react";

/** YKMS-02F — طبقات فوقية: Drawer/Modal/ConfirmDialog/Toast. */

/* ——— Drawer (RTL: ينزلق من اليمين افتراضيًا) ——— */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("uif-no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("uif-no-scroll");
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="uif-overlay" onClick={onClose}>
      <aside className={`uif-drawer${wide ? " wide" : ""}`} dir="rtl" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        {title && (
          <header className="uif-drawer-head">
            <div className="uif-drawer-title">{title}</div>
            <button type="button" className="uif-x" aria-label="إغلاق" onClick={onClose}>✕</button>
          </header>
        )}
        <div className="uif-drawer-body">{children}</div>
        {footer && <footer className="uif-drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/* ——— Modal ——— */

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="uif-overlay center" onClick={onClose}>
      <div className="uif-modal" dir="rtl" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        {title && (
          <header className="uif-drawer-head">
            <div className="uif-drawer-title">{title}</div>
            <button type="button" className="uif-x" aria-label="إغلاق" onClick={onClose}>✕</button>
          </header>
        )}
        <div className="uif-modal-body">{children}</div>
        {footer && <footer className="uif-drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ——— ConfirmDialog ——— */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="uif-confirm-msg">{message}</p>
      <div className="uif-sticky-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className={`uif-btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="uif-btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </Modal>
  );
}

/* ——— Toast (مخزن على مستوى الموديول — بلا Provider) ——— */

interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

let toastSeq = 0;
let toasts: ToastItem[] = [];
const toastListeners = new Set<(items: ToastItem[]) => void>();

export function toast(text: string, kind: ToastItem["kind"] = "success") {
  const item = { id: ++toastSeq, kind, text };
  toasts = [...toasts, item];
  toastListeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== item.id);
    toastListeners.forEach((l) => l(toasts));
  }, 3500);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    const listener = (next: ToastItem[]) => setItems([...next]);
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);
  if (!items.length) return null;
  return (
    <div className="uif-toaster" dir="rtl" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`uif-toast ${item.kind}`}>{item.text}</div>
      ))}
    </div>
  );
}
