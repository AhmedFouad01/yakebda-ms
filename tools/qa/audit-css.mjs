import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const src = path.join(root, "apps", "admin", "src");
const mainPath = path.join(src, "main.tsx");
const entryPath = path.join(src, "app.css");
const temporaryPatchPath = path.join(root, "tools", "apply_pos_visual_qa_stage3.py");

const expectedImports = [
  "styles.css",
  "ykms-02d.css",
  "ykms-02f.css",
  "pos-operational.css",
  "pos-final.css",
  "pos-card-layout-fix.css",
  "ui-cleanup.css",
  "theme.css",
  "theme-interactions.css",
  "ui-polish.css",
  "ui-polish-final.css",
  "final-closure.css",
];

const failures = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

const main = read(mainPath);
const cssImportsInMain = [...main.matchAll(/import\s+["']\.\/(.+?\.css)["'];?/g)].map((match) => match[1]);
if (cssImportsInMain.length !== 1 || cssImportsInMain[0] !== "app.css") {
  failures.push(`main.tsx must import only app.css; found: ${cssImportsInMain.join(", ") || "none"}`);
}

const entry = read(entryPath);
const importedFiles = [...entry.matchAll(/@import\s+url\(["']\.\/(.+?\.css)["']\)\s+layer\(([^)]+)\);/g)]
  .map((match) => ({ file: match[1], layer: match[2] }));

const importedNames = importedFiles.map(({ file }) => file);
if (JSON.stringify(importedNames) !== JSON.stringify(expectedImports)) {
  failures.push(`app.css import order changed. Expected ${expectedImports.join(" -> ")}; found ${importedNames.join(" -> ")}`);
}

const expectedLayers = ["foundation", "legacy", "legacy", "operational", "operational", "operational", "semantic", "semantic", "semantic", "polish", "polish", "closure"];
const importedLayers = importedFiles.map(({ layer }) => layer);
if (JSON.stringify(importedLayers) !== JSON.stringify(expectedLayers)) {
  failures.push(`app.css layer allocation changed. Found: ${importedLayers.join(", ")}`);
}

for (const file of expectedImports) {
  const absolute = path.join(src, file);
  if (!fs.existsSync(absolute)) failures.push(`Missing stylesheet imported by app.css: ${file}`);
}

if (fs.existsSync(temporaryPatchPath)) {
  failures.push("Temporary POS patch script still exists: tools/apply_pos_visual_qa_stage3.py");
}

const broadSelectorPattern = /(^|})\s*(button|input|select|textarea|table)(?=\s|,|\{|:)/gm;
const importantPattern = /!important\b/g;
let broadSelectors = 0;
let importantDeclarations = 0;

for (const file of expectedImports) {
  const css = read(path.join(src, file));
  broadSelectors += [...css.matchAll(broadSelectorPattern)].length;
  importantDeclarations += [...css.matchAll(importantPattern)].length;

  if (/picker-icon[\s\S]{0,140}rotate:\s*180deg/i.test(css)) {
    warnings.push(`${file}: contains an old rotating select picker rule; closure layer must neutralize it until removal.`);
  }
}

console.log("CSS QA summary");
console.log(`- single entry: app.css`);
console.log(`- imported stylesheets: ${expectedImports.length}`);
console.log(`- broad legacy selectors remaining: ${broadSelectors}`);
console.log(`- !important declarations remaining: ${importantDeclarations}`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("CSS cascade contract passed.");
