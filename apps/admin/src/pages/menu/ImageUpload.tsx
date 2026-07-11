import { useRef, useState } from "react";
import { api, fileToBase64, resolveAssetUrl } from "../../lib/api";

/**
 * YKMS-02G — رفع صورة الصنف.
 * منتقي ملفات + سحب وإفلات + معاينة + تحقق نوع/حجم + شريط تقدّم + إزالة/استبدال.
 * يرسل base64 إلى /products/upload-image ويعيد الرابط العام.
 */

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;

export function ImageUpload({
  value,
  productId,
  onChange,
}: {
  value: string | null;
  productId?: string;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);

  async function handleFile(file: File) {
    setErr("");
    if (!ALLOWED.includes(file.type)) { setErr("نوع الصورة غير مسموح (JPG/PNG/WebP)"); return; }
    if (file.size > MAX_BYTES) { setErr("حجم الصورة يتجاوز 3 ميجابايت"); return; }
    setBusy(true);
    try {
      const data_base64 = await fileToBase64(file);
      const res = await api<{ data: { url: string } }>("/products/upload-image", {
        method: "POST",
        body: { product_id: productId, mime: file.type, data_base64 },
      });
      onChange(res.data.url);
    } catch (e: any) {
      setErr(e.message || "تعذّر الرفع");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="imgup">
      <div
        className={`imgup-box${drag ? " drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        role="button"
      >
        {value ? (
          <img className="imgup-preview" src={resolveAssetUrl(value)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")} />
        ) : (
          <div className="imgup-empty">
            <span className="imgup-icon">🖼️</span>
            <span>اسحب صورة هنا أو اضغط للاختيار</span>
            <span className="imgup-hint">JPG / PNG / WebP — حتى 3MB</span>
          </div>
        )}
        {busy && <div className="imgup-progress"><span /></div>}
      </div>
      <input ref={inputRef} type="file" accept={ALLOWED.join(",")} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleFile(f); }} />
      <div className="imgup-actions">
        <button type="button" className="sm" onClick={() => inputRef.current?.click()} disabled={busy}>{value ? "استبدال" : "اختيار صورة"}</button>
        {value && <button type="button" className="sm danger" onClick={() => onChange(null)} disabled={busy}>إزالة</button>}
      </div>
      {err && <div className="imgup-err">{err}</div>}
    </div>
  );
}
