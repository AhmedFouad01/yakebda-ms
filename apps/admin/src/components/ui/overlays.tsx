import { ReactNode, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

/** YKMS-02F — طبقات فوقية: Drawer/Modal/ConfirmDialog/Toast. */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let bodyLockCount = 0;
const overlayStack: string[] = [];

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true"
  );
}

export function useFocusTrap<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const containerRef = useRef<T | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const overlayId = useId();

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    bodyLockCount += 1;
    document.body.classList.add("uif-no-scroll");
    overlayStack.push(overlayId);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableElements(container)[0] ?? container;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== overlayId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const stackIndex = overlayStack.lastIndexOf(overlayId);
      if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);
      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount === 0) document.body.classList.remove("uif-no-scroll");
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open, onClose, overlayId]);

  return containerRef;
}

function OverlayPortal({
  open,
  onClose,
  center = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  center?: boolean;
  children: ReactNode;
}) {
  if (!open || typeof document === "undefined") return null;

  function handleBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div
      className={`uif-overlay${center ? " center" : ""}`}
      data-uif-overlay="true"
      onClick={handleBackdropClick}
    >
      {children}
    </div>,
    document.body
  );
}

/* ——— Drawer (RTL: ينزلق من اليمين افتراضيًا) ——— */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  className = "",
  bodyClassName = "",
  closeContent = "✕",
  ariaLabel = "نافذة جانبية",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
  bodyClassName?: string;
  closeContent?: ReactNode;
  ariaLabel?: string;
}) {
  const dialogRef = useFocusTrap<HTMLElement>(open, onClose);
  const titleId = useId();

  if (!open) return null;
  return (
    <OverlayPortal open={open} onClose={onClose}>
      <aside
        ref={dialogRef}
        className={`uif-drawer${wide ? " wide" : ""}${className ? ` ${className}` : ""}`}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
      >
        {title && (
          <header className="uif-drawer-head">
            <div id={titleId} className="uif-drawer-title">{title}</div>
            <button type="button" className="uif-x" aria-label="إغلاق" onClick={onClose}>{closeContent}</button>
          </header>
        )}
        <div className={`uif-drawer-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
        {footer && <footer className="uif-drawer-foot">{footer}</footer>}
      </aside>
    </OverlayPortal>
  );
}

/* ——— Modal ——— */

export function DialogLayer({
  open,
  onClose,
  children,
  className,
  ariaLabel,
  ariaLabelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);

  if (!open) return null;
  return (
    <OverlayPortal open={open} onClose={onClose} center>
      <div
        ref={dialogRef}
        className={className}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </OverlayPortal>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId();
  if (!open) return null;
  return (
    <DialogLayer
      open={open}
      onClose={onClose}
      className="uif-modal"
      ariaLabel={title ? undefined : "نافذة حوار"}
      ariaLabelledBy={title ? titleId : undefined}
    >
        {title && (
          <header className="uif-drawer-head">
            <div id={titleId} className="uif-drawer-title">{title}</div>
            <button type="button" className="uif-x" aria-label="إغلاق" onClick={onClose}>✕</button>
          </header>
        )}
        <div className="uif-modal-body">{children}</div>
        {footer && <footer className="uif-drawer-foot">{footer}</footer>}
    </DialogLayer>
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
