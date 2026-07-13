import { CartPanel } from "./CartPanel";
import { OrderHistory } from "./OrderHistory";
import { PosDialogs } from "./PosDialogs";
import { PosShellControls } from "./PosShellControls";
import { ProductGrid } from "./ProductGrid";

export function PosView() {
  return (
    <div className="posx" dir="rtl">
      <PosShellControls />
      <div className="posx-body">
        <ProductGrid />
        <CartPanel />
      </div>
      <OrderHistory />
      <PosDialogs />
    </div>
  );
}
