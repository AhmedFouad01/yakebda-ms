import { PosProvider } from "./pos/PosContext";
import { PosView } from "./pos/PosView";

export function Pos() {
  return (
    <PosProvider>
      <PosView />
    </PosProvider>
  );
}
