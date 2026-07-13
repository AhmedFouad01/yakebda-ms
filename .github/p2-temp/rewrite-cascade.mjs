import fs from "node:fs";
import postcss from "postcss";

const themePath = "apps/admin/src/theme.css";
const globalPath = "apps/admin/src/global-colors.css";

const logicalPropertyMap = new Map([
  ["left", "inset-inline-end"],
  ["right", "inset-inline-start"],
  ["margin-left", "margin-inline-end"],
  ["margin-right", "margin-inline-start"],
  ["padding-left", "padding-inline-end"],
  ["padding-right", "padding-inline-start"],
]);

function logicalize(root) {
  root.walkDecls((decl) => {
    const logicalProperty = logicalPropertyMap.get(decl.prop);
    if (logicalProperty) decl.prop = logicalProperty;

    if (decl.prop === "text-align") {
      if (decl.value === "right") decl.value = "start";
      if (decl.value === "left") decl.value = "end";
    }

    if (decl.prop === "transform") {
      decl.value = decl.value
        .replaceAll("translateX(-24px)", "translateX(24px)")
        .replaceAll("translateX(-105%)", "translateX(105%)");
    }

    if (decl.prop === "box-shadow" && decl.value.includes("16px 0 44px rgba(0, 0, 0, 0.58)")) {
      decl.value = decl.value.replace("16px 0 44px", "-16px 0 44px");
    }
  });
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

function splitCascade(css, from, useLogicalProperties) {
  const root = postcss.parse(css, { from });
  const imports = [];
  root.walkAtRules("import", (rule) => {
    imports.push(rule.toString());
    rule.remove();
  });

  if (useLogicalProperties) logicalize(root);

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

const theme = splitCascade(fs.readFileSync(themePath, "utf8"), themePath, true);
const global = splitCascade(fs.readFileSync(globalPath, "utf8"), globalPath, true);

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
