import fs from "node:fs";
import postcss from "postcss";

const themePath = "apps/admin/src/theme.css";
const globalPath = "apps/admin/src/global-colors.css";

function replaceExact(source, oldValue, newValue, count = 1) {
  let output = source;
  for (let index = 0; index < count; index += 1) {
    if (!output.includes(oldValue)) throw new Error(`Missing expected CSS fragment: ${oldValue}`);
    output = output.replace(oldValue, newValue);
  }
  return output;
}

function logicalize(source) {
  let output = source;
  output = replaceExact(output, "    left: 9px;", "    inset-inline-end: 9px;");
  output = replaceExact(output, "    right: 9px;", "    inset-inline-start: 9px;");
  output = replaceExact(output, "  right: auto;\n  bottom: auto;\n  left: auto;", "  inset-inline: auto;\n  bottom: auto;");
  output = replaceExact(output, "  left: 12px;", "  inset-inline-end: 12px;");
  output = replaceExact(output, "  right: 12px;\n  left: auto;", "  inset-inline-start: 12px;\n  inset-inline-end: auto;");
  output = replaceExact(output, "    left: 0;\n    right: auto;", "    inset-inline-start: 0;\n    inset-inline-end: auto;");
  output = replaceExact(output, "    right: 0;\n    bottom: 0;\n    left: 0;", "    inset-inline: 0;\n    bottom: 0;");
  output = output.replaceAll("text-align: right;", "text-align: start;");
  output = output.replaceAll("text-align: left;", "text-align: end;");
  output = replaceExact(
    output,
    "@keyframes uif-drawer-in { from { transform: translateX(-24px); opacity: 0.4; }",
    "@keyframes uif-drawer-in { from { transform: translateX(24px); opacity: 0.4; }",
  );
  output = replaceExact(
    output,
    "    box-shadow: 16px 0 44px rgba(0, 0, 0, 0.58);\n    transform: translateX(-105%);",
    "    box-shadow: -16px 0 44px rgba(0, 0, 0, 0.58);\n    transform: translateX(105%);",
  );
  return output;
}

function prune(container) {
  if (!container.nodes) return;
  for (const node of [...container.nodes]) {
    if (node.nodes) {
      prune(node);
      if (node.nodes.length === 0) node.remove();
    } else if (node.type !== "decl") {
      node.remove();
    }
  }
}

function splitCascade(css, from) {
  const root = postcss.parse(css, { from });
  const imports = [];
  root.walkAtRules("import", (rule) => {
    imports.push(rule.toString());
    rule.remove();
  });

  const normal = root.clone();
  normal.walkDecls((decl) => {
    decl.important = false;
  });

  const priority = root.clone();
  priority.walkDecls((decl) => {
    if (!decl.important) decl.remove();
    else decl.important = false;
  });
  priority.walkComments((comment) => comment.remove());
  prune(priority);

  return {
    imports,
    normal: normal.toString(),
    priority: priority.toString(),
  };
}

const theme = splitCascade(logicalize(fs.readFileSync(themePath, "utf8")), themePath);
const global = splitCascade(fs.readFileSync(globalPath, "utf8"), globalPath);

const layerOrder = "@layer p2_normal, p2_priority;";
const themeOutput = [
  ...theme.imports,
  layerOrder,
  `@layer p2_normal {\n${theme.normal}\n}`,
  `@layer p2_priority {\n${theme.priority}\n}`,
  "",
].join("\n");
const globalOutput = [
  `@layer p2_normal {\n${global.normal}\n}`,
  `@layer p2_priority {\n${global.priority}\n}`,
  "",
].join("\n");

fs.writeFileSync(themePath, themeOutput);
fs.writeFileSync(globalPath, globalOutput);

console.log(JSON.stringify({
  themePriorityDeclarations: (theme.priority.match(/;/g) ?? []).length,
  globalPriorityDeclarations: (global.priority.match(/;/g) ?? []).length,
}, null, 2));
