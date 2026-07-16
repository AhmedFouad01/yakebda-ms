import { useEffect, useState } from "react";
import { brand } from "../config/brand";
import { api, resolveAssetUrl } from "./api";

export const BRAND_LOGO_CHANGED_EVENT = "ykms:brand-logo-changed";

interface BrandLogoChangedDetail {
  accountId: string;
  logoUrl: string;
}

export function resolveBrandLogoUrl(value: string | null | undefined, accountId: string | null | undefined): string {
  if (!value || value === brand.logoPath) return brand.logoPath;
  if (!accountId) return brand.logoPath;
  const match = value.match(
    /^\/uploads\/logos-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9]+-[a-f0-9]{16}\.(?:jpg|png|webp)$/i
  );
  if (!match || match[1].toLowerCase() !== accountId.toLowerCase()) return brand.logoPath;
  return resolveAssetUrl(value);
}

export function emitBrandLogoChanged(accountId: string, logoUrl: string): void {
  window.dispatchEvent(
    new CustomEvent<BrandLogoChangedDetail>(BRAND_LOGO_CHANGED_EVENT, {
      detail: { accountId, logoUrl },
    })
  );
}

export function useBrandLogoUrl(accountId: string | null | undefined): string {
  const [logoUrl, setLogoUrl] = useState<string>(brand.logoPath);

  useEffect(() => {
    let active = true;
    if (!accountId) {
      setLogoUrl(brand.logoPath);
      return undefined;
    }

    api<{ data: { logo_url: string } }>("/settings/brand")
      .then((response) => {
        if (active) setLogoUrl(resolveBrandLogoUrl(response.data.logo_url, accountId));
      })
      .catch(() => {
        if (active) setLogoUrl(brand.logoPath);
      });

    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<BrandLogoChangedDetail>).detail;
      if (detail?.accountId === accountId) {
        setLogoUrl(resolveBrandLogoUrl(detail.logoUrl, accountId));
      }
    };
    window.addEventListener(BRAND_LOGO_CHANGED_EVENT, handleChange);
    return () => {
      active = false;
      window.removeEventListener(BRAND_LOGO_CHANGED_EVENT, handleChange);
    };
  }, [accountId]);

  return logoUrl;
}
