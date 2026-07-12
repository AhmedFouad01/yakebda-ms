import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mainPath = path.join(root, "apps/admin/src/main.tsx");
const main = fs.readFileSync(mainPath, "utf8");
const imports = [...main.matchAll(/import\s+["'](.+?\.css)["'];/g)].map((match) => match[1]);
const finalImport = imports.at(-1);

if (finalImport !== "./global-colors.css") {
  throw new Error(`global-colors.css must be the final CSS import. Current final import: ${finalImport}`);
}

const globalPath = path.join(root, "apps/admin/src/global-colors.css");
const globalCss = fs.readFileSync(globalPath, "utf8");
const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;
const rawMatches = globalCss.match(rawColor);

if (rawMatches?.length) {
  throw new Error(`global-colors.css must use semantic variables only. Raw colors: ${[...new Set(rawMatches)].join(", ")}`);
}

const requiredTokens = [
  "--surface-page",
  "--surface-1",
  "--surface-2",
  "--text-primary",
  "--text-secondary",
  "--brand",
  "--success",
  "--warning",
  "--danger",
];
const theme = fs.readFileSync(path.join(root, "apps/admin/src/theme.css"), "utf8");
const missing = requiredTokens.filter((token) => !theme.includes(token));

if (missing.length) {
  throw new Error(`theme.css is missing required semantic tokens: ${missing.join(", ")}`);
}

console.log("Theme contract OK: semantic tokens exist and global-colors.css loads last without raw colors.");
