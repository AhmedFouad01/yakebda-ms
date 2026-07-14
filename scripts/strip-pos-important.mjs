// R8 wave 1: remove !important from POS-scoped rules in theme.css.
// Order in the collapsed file preserves the original layer order, so
// once every competing POS declaration is non-important the cascade
// resolves exactly as the old file stack did.
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";

const FILE = new URL("../apps/admin/src/theme.css", import.meta.url);
const POS = /(^|[\s,>~+(])\.(posx|pos-)[\w-]*|\.app2-pos\b/;

const css = readFileSync(FILE, "utf8");
const root = postcss.parse(css);
let removed = 0;
root.walkDecls((decl) => {
  if (!decl.important) return;
  const sel = decl.parent?.selector ?? "";
  if (POS.test(sel)) {
    decl.important = false;
    removed += 1;
  }
});
writeFileSync(FILE, root.toString());
console.log("removed:", removed);
