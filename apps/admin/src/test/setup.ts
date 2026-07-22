import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * jsdom ships no canvas implementation, so Chart.js cannot mount without a
 * 2D context. A permissive no-op context lets the reporting charts render in
 * tests — assertions target the accessible description and the data table,
 * which is what users and screen readers actually consume.
 */
function makeContext2d(canvas: HTMLCanvasElement) {
  // Chart.js reads ctx.canvas back, so the context must reference its element.
  const base: Record<string, unknown> = {
    canvas,
    measureText: (text: string) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    save: () => undefined,
    restore: () => undefined,
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      // every other 2D-context member is a no-op drawing call
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
}

if (typeof HTMLCanvasElement !== "undefined") {
  const contexts = new WeakMap<HTMLCanvasElement, unknown>();
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = makeContext2d(this);
      contexts.set(this, ctx);
    }
    return ctx as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement["getContext"];
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});
