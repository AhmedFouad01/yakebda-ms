import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target.map(String)).slice(0, 8),
  }));
}

async function expectNoBlockingAxeViolations(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = result.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious"
  );

  expect(formatViolations(blocking), `${label} has blocking accessibility violations`).toEqual([]);
}

async function expectNoContrastViolations(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();

  expect(formatViolations(result.violations), `${label} has color contrast violations`).toEqual([]);
}

test("login is keyboard-readable and passes Axe", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expectNoBlockingAxeViolations(page, "login");
  await expectNoContrastViolations(page, "login");
});

test("core back-office and operational pages pass Axe and contrast", async ({ page }) => {
  await loginAsOwner(page);

  const pages = [
    { path: "/orders", ready: page.getByRole("heading", { name: "الطلبات" }), label: "orders" },
    { path: "/settings", ready: page.getByRole("heading", { name: "الإعدادات" }), label: "settings" },
    { path: "/kitchen", ready: page.getByRole("heading", { name: "شاشة المطبخ" }), label: "kitchen" },
    { path: "/pos", ready: page.locator(".posx"), label: "pos" },
  ];

  for (const target of pages) {
    await page.goto(target.path);
    await expect(target.ready).toBeVisible();
    await expectNoBlockingAxeViolations(page, target.label);
    await expectNoContrastViolations(page, target.label);
  }
});
