import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandLogo } from "../components/ui/BrandLogo";
import { brand } from "../config/brand";
import { api } from "./api";
import { emitBrandLogoChanged, resolveBrandLogoUrl, useBrandLogoUrl } from "./brandLogo";

vi.mock("./api", () => ({
  api: vi.fn(),
  resolveAssetUrl: (value: string) => value,
}));

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const UPLOADED_LOGO = `/uploads/logos-${ACCOUNT_ID}/1-0000000000000001.png`;

function BrandHarness({ accountId = ACCOUNT_ID }: { accountId?: string }) {
  const src = useBrandLogoUrl(accountId);
  return <BrandLogo src={src} alt="هوية المطعم" />;
}

beforeEach(() => {
  vi.mocked(api).mockReset();
});

describe("brand logo loading and fallback", () => {
  it("يقبل fallback أو مسار الحساب فقط ويرفض الروابط الخارجية وحسابًا آخر", () => {
    expect(resolveBrandLogoUrl(brand.logoPath, ACCOUNT_ID)).toBe(brand.logoPath);
    expect(resolveBrandLogoUrl(UPLOADED_LOGO, ACCOUNT_ID)).toBe(UPLOADED_LOGO);
    expect(resolveBrandLogoUrl(`https://example.com/logo.png`, ACCOUNT_ID)).toBe(brand.logoPath);
    expect(resolveBrandLogoUrl(`/uploads/logos-${OTHER_ACCOUNT_ID}/1-0000000000000001.png`, ACCOUNT_ID)).toBe(
      brand.logoPath
    );
  });

  it("يرطّب AppShell من إعداد اللوجو ثم يستجيب لتغييره", async () => {
    vi.mocked(api).mockResolvedValue({ data: { logo_url: UPLOADED_LOGO } });
    render(<BrandHarness />);
    await waitFor(() => expect(screen.getByRole("img", { name: "هوية المطعم" }).getAttribute("src")).toBe(UPLOADED_LOGO));

    emitBrandLogoChanged(ACCOUNT_ID, brand.logoPath);
    await waitFor(() => expect(screen.getByRole("img", { name: "هوية المطعم" }).getAttribute("src")).toBe(brand.logoPath));
  });

  it("يعود إلى اللوجو الحالي عند فشل تحميل الصورة", () => {
    render(<BrandLogo src={UPLOADED_LOGO} alt="هوية المطعم" />);
    const image = screen.getByRole("img", { name: "هوية المطعم" });
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe(brand.logoPath);
  });
});
