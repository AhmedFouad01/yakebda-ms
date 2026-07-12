import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const posPath = path.join(root, "apps", "admin", "src", "pages", "Pos.tsx");
const cssPath = path.join(root, "apps", "admin", "src", "final-closure.css");

let pos = fs.readFileSync(posPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const oldHelper = `  function isControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a"));
  }

`;

const oldArticle = `    <article
      className={product.is_available ? "posx-card2" : "posx-card2 off"}
      role="button"
      tabIndex={product.is_available ? 0 : -1}
      aria-label={\`${"${product.name_ar}"} — كليك شمال للإضافة، كليك يمين للتقليل\`}
      onClick={(event) => { if (!isControl(event.target)) add(); }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!isControl(event.target) && selectedQty > 0) onQuickRemove(variant, selectedModifiers);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isControl(event.target)) {
          event.preventDefault();
          add();
        }
      }}
    >`;

const newArticle = `    <article className={product.is_available ? "posx-card2" : "posx-card2 off"}>`;

const oldMain = `      <div className="posx-card2-media">
        {showImage && imageSrc && !imageBroken
          ? <img className="posx-card2-img" src={imageSrc} alt={product.name_ar} onError={() => setImageBroken(true)} />
          : <span className="posx-card2-img ph" />}
        <span className="posx-card2-price">{money(priceNow)}</span>
        {selectedQty > 0 && <span className="posx-card2-qty-badge">×{selectedQty}</span>}
      </div>

      <div className="posx-card2-info">
        <h3 className="posx-card2-name">{product.name_ar}</h3>
      </div>`;

const newMain = `      <button
        type="button"
        className="posx-card2-main"
        disabled={!product.is_available}
        aria-label={\`إضافة ${"${product.name_ar}"} إلى الطلب — زر الفأرة الأيمن للتقليل\`}
        onClick={add}
        onContextMenu={(event) => {
          event.preventDefault();
          if (selectedQty > 0) onQuickRemove(variant, selectedModifiers);
        }}
      >
        <div className="posx-card2-media">
          {showImage && imageSrc && !imageBroken
            ? <img className="posx-card2-img" src={imageSrc} alt={product.name_ar} onError={() => setImageBroken(true)} />
            : <span className="posx-card2-img ph" />}
          <span className="posx-card2-price">{money(priceNow)}</span>
          {selectedQty > 0 && <span className="posx-card2-qty-badge">×{selectedQty}</span>}
        </div>

        <div className="posx-card2-info">
          <h3 className="posx-card2-name">{product.name_ar}</h3>
        </div>
      </button>`;

const cssMarker = "/* POS card semantic primary interaction — no nested controls. */";
const cssPatch = `

${cssMarker}
.app2-pos .posx-card2-main {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: inherit !important;
  text-align: inherit !important;
  cursor: pointer;
}

.app2-pos .posx-card2-main:hover:not(:disabled),
.app2-pos .posx-card2-main:active:not(:disabled) {
  border-color: transparent !important;
  background: transparent !important;
  color: inherit !important;
  transform: none !important;
}

.app2-pos .posx-card2-main:focus-visible {
  position: relative;
  z-index: 2;
  outline: 3px solid var(--focus-ring) !important;
  outline-offset: -3px;
}
`;

if (!pos.includes("className=\"posx-card2-main\"")) {
  for (const [label, oldText, newText] of [
    ["legacy control helper", oldHelper, ""],
    ["interactive article", oldArticle, newArticle],
    ["card primary content", oldMain, newMain],
  ]) {
    if (!pos.includes(oldText)) throw new Error(`Could not find ${label} block in Pos.tsx`);
    pos = pos.replace(oldText, newText);
  }
  fs.writeFileSync(posPath, pos);
}

if (!css.includes(cssMarker)) {
  css += cssPatch;
  fs.writeFileSync(cssPath, css);
}

console.log("POS card accessibility patch is present.");
