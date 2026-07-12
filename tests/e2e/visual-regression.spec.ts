import { expect, test } from "@playwright/test";
import { createTakeawayOrder, loginAsOwner } from "./helpers";

test("POS and KDS retain the approved operational hierarchy", async ({ page }) => {
  await loginAsOwner(page);

  await page.goto("/pos");
  await expect(page.locator(".posx-card2").first()).toBeVisible();
  await expect(page.locator(".posx")).toHaveScreenshot("pos-desktop-dark.png", {
    animations: "disabled",
    mask: [page.locator(".posx-shift")],
  });

  await createTakeawayOrder(page);
  await page.goto("/kitchen");
  await expect(page.getByRole("heading", { name: "شاشة المطبخ" })).toBeVisible();
  await expect(page.locator(".kds-card").first()).toBeVisible();

  await expect(page.locator(".kitchen-page")).toHaveScreenshot("kds-desktop-dark.png", {
    animations: "disabled",
    mask: [
      page.locator(".kds-timer"),
      page.locator(".kds-received time"),
      page.locator(".kds-received small"),
    ],
  });
});
