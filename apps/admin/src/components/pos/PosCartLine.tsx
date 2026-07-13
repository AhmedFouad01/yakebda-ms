import { useEffect, useState } from "react";
import { resolveAssetUrl } from "../../lib/api";

type CartProduct = {
  name_ar: string;
  image_url?: string | null;
};

type CartChoice = {
  id: string;
  name_ar: string;
};

export type PosCartLineModel = {
  product: CartProduct;
  variant?: CartChoice | null;
  modifiers: CartChoice[];
  qty: number;
  notes: string;
};

type Props = {
  line: PosCartLineModel;
  totalLabel: string;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
  onNotesChange: (value: string) => void;
};

export function PosCartLine({
  line,
  totalLabel,
  onIncrease,
  onDecrease,
  onRemove,
  onNotesChange,
}: Props) {
  const src = resolveAssetUrl(line.product.image_url);
  const [imageBroken, setImageBroken] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(line.notes));

  useEffect(() => setImageBroken(false), [src]);

  const choices = [line.variant?.name_ar, ...line.modifiers.map((modifier) => modifier.name_ar)].filter(Boolean) as string[];

  return (
    <article className="posx-fast-line">
      <span className="posx-fast-line-thumb" aria-hidden>
        {src && !imageBroken ? (
          <img src={src} alt="" onError={() => setImageBroken(true)} />
        ) : (
          <span>{line.product.name_ar.trim().charAt(0)}</span>
        )}
      </span>

      <div className="posx-fast-line-main">
        <header className="posx-fast-line-head">
          <strong>{line.product.name_ar}</strong>
          <b>{totalLabel}</b>
        </header>

        <div className="posx-fast-line-choices" aria-label="اختيارات الصنف">
          {choices.length ? choices.map((choice, index) => <span key={`${choice}-${index}`}>{choice}</span>) : <span className="muted">بدون اختيارات</span>}
        </div>

        {notesOpen ? (
          <input
            className="posx-fast-line-note-input"
            autoFocus
            placeholder="ملاحظات الصنف"
            value={line.notes}
            onChange={(event) => onNotesChange(event.target.value)}
            onBlur={() => {
              if (!line.notes.trim()) setNotesOpen(false);
            }}
          />
        ) : (
          <button type="button" className="posx-fast-line-note-button" onClick={() => setNotesOpen(true)}>
            {line.notes ? line.notes : "+ ملاحظة"}
          </button>
        )}
      </div>

      <div className="posx-fast-line-actions">
        <div className="posx-fast-qty" aria-label={`الكمية ${line.qty}`}>
          <button type="button" aria-label="تقليل الكمية" onClick={onDecrease}>−</button>
          <output aria-live="polite">{line.qty}</output>
          <button type="button" aria-label="زيادة الكمية" onClick={onIncrease}>+</button>
        </div>
        <button type="button" className="posx-fast-remove" onClick={onRemove} aria-label={`حذف ${line.product.name_ar}`} title="حذف الصنف">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" />
          </svg>
        </button>
      </div>
    </article>
  );
}
