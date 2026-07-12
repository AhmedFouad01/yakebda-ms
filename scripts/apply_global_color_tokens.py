from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "apps" / "admin" / "src"


def require_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected target in {label}: {old[:120]!r}")
    return text.replace(old, new)


# 1) Make theme.css the actual final color authority.
main_path = SRC / "main.tsx"
main = main_path.read_text(encoding="utf-8")
theme_import = 'import "./theme.css";\n'
if main.count(theme_import) != 1:
    raise SystemExit("Expected exactly one theme.css import")
main = main.replace(theme_import, "")
anchor = 'import "./pos-fast-rail-final.css";\n'
main = require_replace(main, anchor, anchor + theme_import, "main.tsx")
main_path.write_text(main, encoding="utf-8")


# 2) Retire raw color literals from the modern POS layers.
modern_files = [
    SRC / "pos-fast-rail.css",
    SRC / "pos-fast-rail-final.css",
]

literal_map = {
    "#11181c": "var(--surface-1)",
    "#1b2327": "var(--surface-2)",
    "#151c20": "var(--surface-1)",
    "#202a2f": "var(--surface-2)",
    "#d8e0e3": "var(--text-secondary)",
    "#0d1316": "var(--surface-page)",
    "#1b252a": "var(--surface-2)",
    "#23291d": "var(--surface-2)",
    "#1b2118": "var(--surface-1)",
    "#31b66b": "var(--success)",
    "#8ce6ad": "var(--success)",
    "#83e8a7": "var(--success)",
    "#20292d": "var(--surface-2)",
    "#587169": "var(--border-strong)",
    "#c95149": "var(--danger)",
    "#ff8c83": "var(--danger)",
    "#111": "var(--on-brand)",
    "rgba(246, 192, 38, 0.08)": "color-mix(in srgb, var(--brand) 8%, transparent)",
    "rgba(246, 192, 38, 0.18)": "color-mix(in srgb, var(--brand) 18%, transparent)",
    "rgba(246, 192, 38, 0.22)": "color-mix(in srgb, var(--brand) 22%, transparent)",
    "rgba(246, 192, 38, 0.72)": "var(--brand)",
    "rgba(17, 23, 26, 0.96)": "var(--surface-1)",
    "rgba(201, 81, 73, 0.12)": "var(--theme-danger-soft)",
    "rgba(201, 81, 73, 0.22)": "color-mix(in srgb, var(--danger) 22%, transparent)",
    "rgba(49, 182, 107, 0.12)": "var(--theme-success-soft)",
}

raw_color_re = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(")

for path in modern_files:
    text = path.read_text(encoding="utf-8")
    for old in sorted(literal_map, key=len, reverse=True):
        text = text.replace(old, literal_map[old])
    remaining = raw_color_re.findall(text)
    if remaining:
        raise SystemExit(f"Raw color literals remain in {path.name}: {remaining}")
    path.write_text(text, encoding="utf-8")


# 3) Add a semantic contract for the modern POS components to the global theme.
theme_path = SRC / "theme.css"
theme = theme_path.read_text(encoding="utf-8")
marker = "/* === YAKEBDA GLOBAL SEMANTIC COLOR CONTRACT v1 === */"
if marker in theme:
    raise SystemExit("Global semantic color contract already exists")

theme_contract = r'''

/* === YAKEBDA GLOBAL SEMANTIC COLOR CONTRACT v1 === */
/*
 * Colors are owned here. Feature CSS may own geometry only.
 * Both light and dark themes resolve the same semantic component tokens.
 */
:root,
.app2-pos {
  --control-surface: var(--surface-2);
  --control-surface-hover: var(--surface-raised);
  --control-border: var(--border-strong);
  --selection-surface: var(--brand);
  --selection-text: var(--on-brand);
  --success-surface: var(--theme-success-soft);
  --warning-surface: var(--theme-warning-soft);
  --danger-surface: var(--theme-danger-soft);
  --info-surface: var(--theme-info-soft);
}

/* AppShell operational controls */
.app2-pos .posx-shell-icon,
.app2-pos .posx-history-btn,
.app2-pos .posx-shift-action {
  border-color: var(--control-border) !important;
  background: var(--control-surface) !important;
  color: var(--text-primary) !important;
}

.app2-pos .posx-shell-icon:hover,
.app2-pos .posx-shell-icon:focus-within,
.app2-pos .posx-history-btn:hover,
.app2-pos .posx-history-btn:focus-visible {
  border-color: var(--brand) !important;
  color: var(--brand) !important;
}

.app2-pos .app2-account-cluster {
  border-color: var(--success) !important;
  background: var(--success-surface) !important;
}

.app2-pos .app2-account-cluster .app2-user {
  color: var(--success) !important;
}

.app2-pos .posx-shift-action.is-open {
  border-color: var(--border-strong) !important;
  background: var(--surface-2) !important;
  color: var(--text-primary) !important;
}

/* Cart workflow and Fast Rail lines */
.app2-pos .posx-order-rail,
.app2-pos .posx-fast-line,
.app2-pos .posx-fast-qty,
.app2-pos .posx-fast-line-note-input,
.app2-pos .posx-source-field select {
  border-color: var(--border-strong) !important;
  background: var(--surface-1) !important;
  color: var(--text-primary) !important;
}

.app2-pos .posx-order-rail {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand) 8%, var(--surface-1)),
    var(--surface-1)
  ) !important;
}

.app2-pos .posx-fast-line-thumb {
  border-color: var(--border-subtle) !important;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--brand) 18%, transparent), transparent 55%),
    repeating-linear-gradient(45deg, var(--surface-2) 0 8px, var(--surface-1) 8px 16px) !important;
  color: var(--brand) !important;
}

.app2-pos .posx-fast-line-head strong,
.app2-pos .posx-fast-line-head b {
  color: var(--text-primary) !important;
}

.app2-pos .posx-fast-line-choices span {
  border-color: var(--border-subtle) !important;
  background: var(--surface-2) !important;
  color: var(--text-secondary) !important;
}

.app2-pos .posx-fast-line-note-button {
  color: var(--text-secondary) !important;
}

.app2-pos .posx-fast-qty button {
  background: var(--control-surface) !important;
  color: var(--text-primary) !important;
}

.app2-pos .posx-fast-qty output {
  background: var(--selection-surface) !important;
  color: var(--selection-text) !important;
}

.app2-pos .posx-fast-remove {
  border-color: var(--danger) !important;
  background: var(--danger-surface) !important;
  color: var(--danger) !important;
}

.app2-pos .posx-fast-remove:hover,
.app2-pos .posx-fast-remove:focus-visible {
  border-color: var(--danger) !important;
  background: color-mix(in srgb, var(--danger) 18%, var(--danger-surface)) !important;
  color: var(--danger) !important;
}

/* Product placeholders use the same palette in every theme. */
.app2-pos .posx-card2-img.ph {
  background:
    radial-gradient(circle at 72% 20%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 28%),
    repeating-linear-gradient(135deg, var(--surface-2) 0 12px, var(--surface-1) 12px 24px) !important;
}

.app2-pos .posx-card2-img.ph::after {
  color: var(--brand) !important;
}
'''

theme_path.write_text(theme.rstrip() + theme_contract + "\n", encoding="utf-8")


# 4) Permanent regression check: theme must be last and modern layers cannot own raw colors.
check_path = ROOT / "scripts" / "check-theme-contract.mjs"
check_path.write_text(r'''import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mainPath = path.join(root, "apps/admin/src/main.tsx");
const main = fs.readFileSync(mainPath, "utf8");
const imports = [...main.matchAll(/import\s+["'](.+?\.css)["'];/g)].map((match) => match[1]);

if (imports.at(-1) !== "./theme.css") {
  throw new Error(`theme.css must be the final CSS import. Current final import: ${imports.at(-1)}`);
}

const guardedFiles = [
  "apps/admin/src/pos-fast-rail.css",
  "apps/admin/src/pos-fast-rail-final.css",
];
const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;
const failures = [];

for (const relative of guardedFiles) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const matches = source.match(rawColor);
  if (matches?.length) failures.push(`${relative}: ${[...new Set(matches)].join(", ")}`);
}

const theme = fs.readFileSync(path.join(root, "apps/admin/src/theme.css"), "utf8");
if (!theme.includes("YAKEBDA GLOBAL SEMANTIC COLOR CONTRACT v1")) {
  failures.push("apps/admin/src/theme.css: semantic color contract marker is missing");
}

if (failures.length) {
  throw new Error(`Theme contract failed:\n${failures.join("\n")}`);
}

console.log("Theme contract OK: global theme is last and modern POS CSS contains no raw colors.");
''', encoding="utf-8")


# 5) Wire the contract into the standard project validation command.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
scripts = package.setdefault("scripts", {})
scripts["ui:colors:check"] = "node scripts/check-theme-contract.mjs"
scripts["check"] = "npm run ui:colors:check && npm run api:test && npm run admin:build"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Applied YAKEBDA global semantic color contract.")
