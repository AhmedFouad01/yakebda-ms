import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * YKMS-02F — نظام مكونات الواجهة.
 * لا عناصر متصفح خام في الشاشات: الحقول تمر عبر FormField/TextInput/…،
 * والمفاتيح ToggleSwitch بدل checkboxes الصغيرة. Native inputs تبقى تحتيًا
 * من أجل الوصولية (accessibility) لكنها مُقدَّمة عبر النظام الموحد.
 */

/* ——— هيكل الصفحة ——— */

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: ReactNode; back?: boolean }) {
  return (
    <div className="uif-pagehead">
      <div className="uif-pagehead-text">
        {back && <BackButton />}
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="uif-sub">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="uif-pagehead-actions">{actions}</div>}
    </div>
  );
}

/** رجوع آمن: history عند توفره وإلا Dashboard. */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      className="uif-back"
      aria-label="رجوع"
      onClick={() => {
        if (window.history.length > 2) nav(-1);
        else nav(fallback);
      }}
    >
      ←
    </button>
  );
}

export function SectionCard({ title, hint, children, footer }: { title?: string; hint?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="uif-card">
      {(title || hint) && (
        <div className="uif-card-head">
          {title && <h3>{title}</h3>}
          {hint && <div className="uif-hint">{hint}</div>}
        </div>
      )}
      <div className="uif-card-body">{children}</div>
      {footer && <div className="uif-card-foot">{footer}</div>}
    </section>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: Array<[string, string]>; active: string; onChange: (k: string) => void }) {
  return (
    <div className="uif-tabs" role="tablist">
      {tabs.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={active === key} className={active === key ? "active" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ——— الحقول ——— */

export function FormField({ label, children, error, hint, inline }: { label: string; children: ReactNode; error?: string; hint?: string; inline?: boolean }) {
  return (
    <label className={`uif-field${inline ? " inline" : ""}${error ? " has-error" : ""}`}>
      <span className="uif-label">{label}</span>
      {children}
      {hint && !error && <span className="uif-hint">{hint}</span>}
      {error && <span className="uif-error">{error}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`uif-input ${props.className ?? ""}`} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" inputMode="decimal" {...props} className={`uif-input uif-num ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`uif-input uif-textarea ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`uif-input uif-select ${props.className ?? ""}`} />;
}

/** مفتاح حديث بدل checkbox — native input تحتيًا للوصولية. */
export function ToggleSwitch({ checked, onChange, disabled, label, off }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label?: string; off?: boolean }) {
  return (
    <label className={`uif-toggle${disabled ? " disabled" : ""}${off ? " uif-off" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="uif-toggle-track" aria-hidden>
        <span className="uif-toggle-thumb" />
      </span>
      {label && <span className="uif-toggle-label">{label}</span>}
    </label>
  );
}

export function RadioGroup<T extends string>({ options, value, onChange, disabled }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="uif-radio" role="radiogroup">
      {options.map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} disabled={disabled} className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ——— شريط الحفظ الثابت ——— */

export function StickyActionBar({ children, dirty }: { children: ReactNode; dirty?: boolean }) {
  return (
    <div className={`uif-sticky${dirty ? " dirty" : ""}`}>
      {dirty && <span className="uif-dirty-dot">● تغييرات غير محفوظة</span>}
      <div className="uif-sticky-actions">{children}</div>
    </div>
  );
}

export function SaveButton({ busy, disabled, onClick, children }: { busy?: boolean; disabled?: boolean; onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="uif-btn primary" disabled={busy || disabled} onClick={onClick}>
      {busy ? "جارٍ الحفظ…" : children ?? "حفظ"}
    </button>
  );
}

export function CancelButton({ onClick, children }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="uif-btn ghost" onClick={onClick}>
      {children ?? "إلغاء"}
    </button>
  );
}

/* ——— حالات الشاشة ——— */

export function LoadingState({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="uif-state">
      <span className="uif-spinner" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="uif-state error" role="alert">
      <span>⚠ {message}</span>
      {onRetry && <button className="uif-btn ghost" onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="uif-state empty">
      <span>{message}</span>
      {action}
    </div>
  );
}

/* ——— الصلاحيات ——— */

export function PermissionBadge({ permission }: { permission: string }) {
  return <span className="uif-perm" dir="ltr">{permission}</span>;
}

export function ViewOnlyNotice({ permission }: { permission: string }) {
  return (
    <div className="uif-viewonly" role="note">
      <strong>وضع العرض فقط</strong> — التعديل يتطلب صلاحية <PermissionBadge permission={permission} />
    </div>
  );
}

/** تحذير مغادرة عند وجود تغييرات غير محفوظة (إغلاق التبويب/التحديث). */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
