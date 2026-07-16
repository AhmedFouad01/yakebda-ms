import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, fileToBase64 } from "../../lib/api";
import { LogoUploadField } from "./LogoUploadField";

vi.mock("../../lib/api", () => ({
  api: vi.fn(),
  fileToBase64: vi.fn(),
  resolveAssetUrl: (value: string) => value,
}));

vi.mock("../../components/ui/overlays", () => ({ toast: vi.fn() }));

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const SAVED_LOGO = `/uploads/logos-${ACCOUNT_ID}/2-0000000000000002.png`;
const PNG = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });

function renderField(onChanged = vi.fn().mockResolvedValue(undefined)) {
  return {
    onChanged,
    ...render(
      <LogoUploadField
        accountId={ACCOUNT_ID}
        logoUrl={SAVED_LOGO}
        editable
        onChanged={onChanged}
      />
    ),
  };
}

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(fileToBase64).mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:logo-preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("restaurant logo upload field", () => {
  it("يعرض اللوجو المحفوظ ثم preview محلي قبل الحفظ", async () => {
    renderField();
    const image = screen.getByRole("img", { name: "لوجو المطعم" });
    expect(image.getAttribute("src")).toBe(SAVED_LOGO);

    fireEvent.change(screen.getByLabelText("اختيار لوجو المطعم"), { target: { files: [PNG] } });
    await waitFor(() => expect(image.getAttribute("src")).toBe("blob:logo-preview"));
  });

  it("يرفع مرة واحدة، يحفظ المرجع، ثم يعيد تحميل settings", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fileToBase64).mockResolvedValue("base64-png");
    let release: ((value: { data: { logo_url: string } }) => void) | undefined;
    vi.mocked(api).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    renderField(onChanged);
    fireEvent.change(screen.getByLabelText("اختيار لوجو المطعم"), { target: { files: [PNG] } });

    const save = screen.getByRole("button", { name: "حفظ اللوجو" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith("/settings/logo", {
      method: "POST",
      body: { mime: "image/png", data_base64: "base64-png" },
    });

    release?.({ data: { logo_url: SAVED_LOGO } });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("يبقي المعاينة ويعرض الخطأ عند فشل الرفع", async () => {
    vi.mocked(fileToBase64).mockResolvedValue("base64-png");
    vi.mocked(api).mockRejectedValue(new Error("فشل الرفع"));
    renderField();
    fireEvent.change(screen.getByLabelText("اختيار لوجو المطعم"), { target: { files: [PNG] } });
    const save = screen.getByRole("button", { name: "حفظ اللوجو" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    expect((await screen.findByRole("alert")).textContent).toContain("فشل الرفع");
    expect(screen.getByRole("img", { name: "لوجو المطعم" }).getAttribute("src")).toBe("blob:logo-preview");
  });

  it("يرفض SVG والحجم الكبير محليًا ويتيح إزالة اللوجو", async () => {
    renderField();
    const input = screen.getByLabelText("اختيار لوجو المطعم");
    const svg = new File(["<svg />"], "logo.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [svg] } });
    expect(screen.getByRole("alert").textContent).toContain("PNG أو JPG أو WebP");

    const oversized = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole("alert").textContent).toContain("3 ميجابايت");

    vi.mocked(api).mockResolvedValue({ data: { logo_url: "/brand/yakebda-logo-placeholder.svg" } });
    fireEvent.click(screen.getByRole("button", { name: "العودة للافتراضي" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/settings/logo", { method: "DELETE" }));
  });
});
