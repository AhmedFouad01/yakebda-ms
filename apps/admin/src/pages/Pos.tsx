import { PosWorkspace } from "./pos/PosWorkspace";
import { usePosController } from "./pos/usePosController";

export function Pos() {
  const controller = usePosController();
  return <PosWorkspace controller={controller} />;
}
