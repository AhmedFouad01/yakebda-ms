import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mainPath = path.join(root, "apps/admin/src/main.tsx");
const posPath = path.join(root, "apps/admin/src/pages/Pos.tsx");
const overlaysPath = path.join(root, "apps/admin/src/components/ui/overlays.tsx");
const outputPath = path.join(root, "docs/engineering/CSS_CONSOLIDATION_PLAN.md");

const normalizeLines = (text) => text.replace(/\r\n/g, "\n").split("\n").length;
const countMatches = (text, regex) => [...text.matchAll(regex)].length;
const read = (file) => fs.readFileSync(file, "utf8");

const main = read(mainPath);
const cssImports = [...main.matchAll(/import\s+["'](.+?\.css)["'];?/g)].map((match) => match[1]);
const cssFiles = cssImports.map((relativeImport) => {
  const absolute = path.resolve(path.dirname(mainPath), relativeImport);
  const content = read(absolute);
  return {
    importPath: relativeImport,
    repoPath: path.relative(root, absolute).replaceAll(path.sep, "/"),
    lines: normalizeLines(content),
    important: countMatches(content, /!important\b/g),
    posxHead: countMatches(content, /\.posx-head(?=[\s,{:#.>+~\[])/g),
    posxGrid: countMatches(content, /\.posx-grid(?=[\s,{:#.>+~\[])/g),
    posxCard: countMatches(content, /\.posx-card(?=[\s,{:#.>+~\[])/g),
    physical: countMatches(content, /(^|[;{]\s*)(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/gm),
  };
});

const totals = cssFiles.reduce(
  (acc, file) => ({
    lines: acc.lines + file.lines,
    important: acc.important + file.important,
    posxHead: acc.posxHead + file.posxHead,
    posxGrid: acc.posxGrid + file.posxGrid,
    posxCard: acc.posxCard + file.posxCard,
    physical: acc.physical + file.physical,
  }),
  { lines: 0, important: 0, posxHead: 0, posxGrid: 0, posxCard: 0, physical: 0 }
);

const pos = read(posPath);
const overlays = read(overlaysPath);
const drawerKeyframe = overlays.match(/@keyframes\s+uif-drawer-in[\s\S]*?}/)?.[0] ?? "defined in CSS, not overlays.tsx";
const hasFocusTrap = /useFocusTrap/.test(overlays);

const rows = cssFiles
  .map((file, index) => `| ${index + 1} | \`${file.repoPath}\` | ${file.lines} | ${file.important} | ${file.posxHead} | ${file.posxGrid} | ${file.posxCard} | ${file.physical} |`)
  .join("\n");

const markdown = `# CSS Consolidation Plan — P2 Baseline\n\n` +
`**Generated:** ${new Date().toISOString()}  \n` +
`**Branch:** refactor/p2-maintainability  \n` +
`**Source:** apps/admin/src/main.tsx import order  \n\n` +
`## Frozen baseline metrics\n\n` +
`- Imported CSS files: **${cssFiles.length}**\n` +
`- CSS lines: **${totals.lines}**\n` +
`- \`!important\` occurrences: **${totals.important}**\n` +
`- \`.posx-head\` selector occurrences: **${totals.posxHead}**\n` +
`- \`.posx-grid\` selector occurrences: **${totals.posxGrid}**\n` +
`- \`.posx-card\` selector occurrences: **${totals.posxCard}**\n` +
`- Physical directional declarations: **${totals.physical}**\n` +
`- \`apps/admin/src/pages/Pos.tsx\`: **${normalizeLines(pos)} lines**\n` +
`- Shared overlay focus trap present: **${hasFocusTrap ? "yes" : "no"}**\n\n` +
`## Imported CSS inventory\n\n` +
`| # | File | Lines | !important | posx-head | posx-grid | posx-card | physical RTL props |\n` +
`|---:|---|---:|---:|---:|---:|---:|---:|\n${rows}\n\n` +
`## Import order contract\n\n` + cssFiles.map((file, index) => `${index + 1}. \`${file.repoPath}\``).join("\n") + `\n\n` +
`## Visual freeze matrix\n\n` +
`Reference images must be captured before geometry-changing consolidation. Required screens: POS, KDS, Orders detail, Menu, Customers, Users. Required viewports: 1366×768 and 1920×1080. Capture both Light and Dark where the screen supports both themes.\n\n` +
`Expected location: \`docs/engineering/visual-baseline/p2-before/\`. Naming: \`<screen>--<theme>--<width>x<height>.png\`.\n\n` +
`**Status:** inventory generated; reference screenshots are a hard gate before the first CSS duplicate is removed.\n\n` +
`## Execution order\n\n` +
`1. Capture and approve the visual baseline pack.\n` +
`2. Add R10 frontend tests before R9 extraction.\n` +
`3. Consolidate \`.posx-head\`, then \`.posx-grid\`, then \`.posx-card\`, with build and screenshot parity after each checkpoint.\n` +
`4. Collapse imported CSS to at most three authoritative layers without redesign.\n` +
`5. Remove cascade-only \`!important\` declarations in verified waves.\n` +
`6. Fix RTL drawer entry direction, add shared focus trapping, and convert physical directional properties to logical properties.\n` +
`7. Extract POS children after tests are green.\n\n` +
`## Risk controls\n\n` +
`- No API or migration changes.\n` +
`- No visual redesign.\n` +
`- Unknown rules stay in place and are documented rather than deleted.\n` +
`- \`global-colors.css\` remains the final color authority until the controlled layer collapse checkpoint.\n` +
`- Product Grid and KDS geometry are frozen unless a parity defect requires restoration.\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown);
console.log(markdown);
