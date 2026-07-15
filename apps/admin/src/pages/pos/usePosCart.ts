import { useState, type Dispatch, type SetStateAction } from "react";
import type { CartLine, MenuModifier, MenuProduct, MenuVariant } from "./types";
import { cartLineKey, unitPrice } from "./utils";

export interface UsePosCartResult {
  cart: CartLine[];
  setCart: Dispatch<SetStateAction<CartLine[]>>;
  addProduct: (product: MenuProduct, variant?: MenuVariant | null, modifiers?: MenuModifier[]) => void;
  quickRemove: (product: MenuProduct, variant?: MenuVariant | null, modifiers?: MenuModifier[]) => void;
  refreshProducts: (products: ReadonlyMap<string, MenuProduct>) => void;
  resetCart: () => void;
  itemCount: number;
  localSubtotal: number;
}

export function usePosCart(): UsePosCartResult {
  const [cart, setCart] = useState<CartLine[]>([]);

  function addProduct(product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = cartLineKey(product, variant, modifiers);
    setCart((current) => {
      const found = current.find((line) => line.key === key && !line.notes);
      if (found) {
        return current.map((line) => (line === found ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { key, product, variant, modifiers, qty: 1, notes: "" }];
    });
  }

  function quickRemove(product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = cartLineKey(product, variant, modifiers);
    setCart((rows) => {
      const exactIndex = rows.findIndex((line) => line.key === key && !line.notes);
      const fallbackIndex = exactIndex === -1 ? rows.findIndex((line) => line.key === key) : exactIndex;
      if (fallbackIndex === -1) return rows;
      return rows.flatMap((line, index) => {
        if (index !== fallbackIndex) return [line];
        return line.qty > 1 ? [{ ...line, qty: line.qty - 1 }] : [];
      });
    });
  }

  function refreshProducts(products: ReadonlyMap<string, MenuProduct>) {
    setCart((rows) => rows.map((line) => ({
      ...line,
      product: products.get(line.product.id) ?? line.product,
    })));
  }

  function resetCart() {
    setCart([]);
  }

  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const localSubtotal = cart.reduce((sum, line) => sum + unitPrice(line) * line.qty, 0);

  return {
    cart,
    setCart,
    addProduct,
    quickRemove,
    refreshProducts,
    resetCart,
    itemCount,
    localSubtotal,
  };
}
