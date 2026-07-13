import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../lib/api";
import type { MenuCategory, MenuProduct } from "./types";
import { catRank } from "./utils";

export interface UsePosCatalogOptions {
  branchId: string;
  sourceId: string;
  refreshCartProducts: (products: ReadonlyMap<string, MenuProduct>) => void;
  onError: (message: string) => void;
}

export interface UsePosCatalogResult {
  categories: MenuCategory[];
  activeCat: string;
  setActiveCat: Dispatch<SetStateAction<string>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  visibleProducts: MenuProduct[];
  refreshCatalog: (currentBranchId?: string, currentSourceId?: string) => Promise<void>;
}

export function usePosCatalog({
  branchId,
  sourceId,
  refreshCartProducts,
  onError,
}: UsePosCatalogOptions): UsePosCatalogResult {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState("الكل");
  const [search, setSearch] = useState("");

  async function refreshCatalog(currentBranchId = branchId, currentSourceId = sourceId) {
    if (!currentBranchId) return;
    const query = currentSourceId ? "?source_id=" + encodeURIComponent(currentSourceId) : "";
    const response = await api<{ data: { categories: MenuCategory[] } }>("/branches/" + currentBranchId + "/menu" + query);
    const sorted = [...response.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));
    const refreshed = new Map(sorted.flatMap((category) => category.products).map((product) => [product.id, product]));
    setCategories(sorted);
    refreshCartProducts(refreshed);
    setActiveCat("الكل");
  }


  useEffect(() => {
    if (!branchId) return;
    refreshCatalog(branchId, sourceId).catch((e: Error) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, sourceId]);

  // YKMS-02E: إخفاء الأصناف غير المرئية في POS (pos_visible === false)
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products).filter((p) => p.pos_visible !== false),
    [categories]
  );
  const visibleProducts = useMemo(() => {
    if (search) {
      return allProducts.filter(
        (product) =>
          product.name_ar.includes(search) ||
          product.ingredients_ar?.includes(search) ||
          product.portion_note_ar?.includes(search)
      );
    }
    if (activeCat === "الكل") return allProducts;
    return (categories.find((category) => category.name_ar === activeCat)?.products ?? []).filter((p) => p.pos_visible !== false);
  }, [categories, allProducts, activeCat, search]);


  return {
    categories,
    activeCat,
    setActiveCat,
    search,
    setSearch,
    visibleProducts,
    refreshCatalog,
  };
}
