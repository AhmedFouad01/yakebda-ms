import { ChangeEvent, useEffect, useRef, useState } from "react";
import { api, fileToBase64 } from "../../lib/api";
import { emitBrandLogoChanged, resolveBrandLogoUrl } from "../../lib/brandLogo";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { Button } from "../../components/ui/primitives";
import { toast } from "../../components/ui/overlays";

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const LOGO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

interface LogoUploadFieldProps {
  accountId: string;
  logoUrl: string;
  editable: boolean;
  onChanged: () => Promise<void>;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "تعذّر تحديث اللوجو";
}

export function LogoUploadField({ accountId, logoUrl, editable, onChanged }: LogoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!LOGO_MIME.has(selected.type)) {
      setFile(null);
      setError("اختر صورة PNG أو JPG أو WebP فقط");
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_LOGO_BYTES) {
      setFile(null);
      setError("حجم اللوجو يجب ألا يتجاوز 3 ميجابايت");
      event.target.value = "";
      return;
    }
    setFile(selected);
  }

  async function uploadLogo() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await api<{ data: { logo_url: string } }>("/settings/logo", {
        method: "POST",
        body: { mime: file.type, data_base64: dataBase64 },
      });
      emitBrandLogoChanged(accountId, response.data.logo_url);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onChanged();
      toast("تم تحديث لوجو المطعم");
    } catch (uploadError) {
      const message = messageFrom(uploadError);
      setError(message);
      toast(message, "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removeLogo() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api<{ data: { logo_url: string } }>("/settings/logo", { method: "DELETE" });
      emitBrandLogoChanged(accountId, response.data.logo_url);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onChanged();
      toast("تمت العودة إلى اللوجو الافتراضي");
    } catch (removeError) {
      const message = messageFrom(removeError);
      setError(message);
      toast(message, "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const currentLogo = previewUrl || resolveBrandLogoUrl(logoUrl, accountId);

  return (
    <div className="settings-logo-field">
      <div className="settings-logo-preview" aria-label="معاينة لوجو المطعم">
        <BrandLogo src={currentLogo} alt="لوجو المطعم" />
      </div>
      <div className="settings-logo-controls">
        <span className="uif-label">لوجو المطعم</span>
        <div className="settings-logo-picker-row">
          <input
            ref={inputRef}
            id="restaurant-logo-file"
            className="settings-logo-native-input"
            type="file"
            aria-label="اختيار لوجو المطعم"
            tabIndex={-1}
            accept="image/png,image/jpeg,image/webp"
            disabled={!editable || busy}
            onChange={selectFile}
          />
          <Button
            id="restaurant-logo-picker"
            variant="secondary"
            className="settings-logo-picker"
            disabled={!editable || busy}
            aria-controls="restaurant-logo-file"
            onClick={() => inputRef.current?.click()}
          >
            اختيار صورة
          </Button>
          <span className="uif-hint settings-logo-file-name">
            {file?.name ?? "لم يتم اختيار صورة"}
          </span>
        </div>
        <span className="uif-hint">PNG أو JPG أو WebP، بحد أقصى 3 ميجابايت</span>
        {error && <span className="uif-error" role="alert">{error}</span>}
        <div className="settings-logo-actions">
          <Button variant="primary" disabled={!editable || !file || busy} onClick={uploadLogo}>
            {busy ? "جارٍ التحديث…" : "حفظ اللوجو"}
          </Button>
          <Button variant="ghost" disabled={!editable || busy} onClick={removeLogo}>
            العودة للافتراضي
          </Button>
        </div>
      </div>
    </div>
  );
}
