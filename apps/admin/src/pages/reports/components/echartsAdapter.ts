const ECHARTS_ESM_URL = "https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.esm.min.mjs";

export interface EChartsInstance {
  setOption(option: Record<string, unknown>, opts?: Record<string, unknown>): void;
  resize(): void;
  dispose(): void;
}

interface EChartsModule {
  init(
    element: HTMLElement,
    theme?: string | null,
    options?: { renderer?: "svg" | "canvas"; devicePixelRatio?: number }
  ): EChartsInstance;
}

let modulePromise: Promise<EChartsModule> | null = null;

/**
 * Loads a pinned Apache ECharts ESM build behind one adapter boundary.
 * The report table remains the authoritative accessible fallback when the
 * visualization dependency is unavailable. Before production deployment this
 * pinned asset should be vendored or moved into the repository lockfile.
 */
export function loadECharts(): Promise<EChartsModule> {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ ECHARTS_ESM_URL) as Promise<EChartsModule>;
  }
  return modulePromise;
}

export function resetEChartsLoaderForTests(): void {
  modulePromise = null;
}
