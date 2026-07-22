import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

/**
 * Chart.js is bundled from the lockfile — no runtime CDN. Only the controllers
 * the reporting screen actually uses are registered, so the tree-shaken bundle
 * stays small.
 */
let registered = false;

export function ensureChartsRegistered(): void {
  if (registered) return;
  Chart.register(
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Filler,
    Tooltip
  );
  registered = true;
}

export { Chart };
