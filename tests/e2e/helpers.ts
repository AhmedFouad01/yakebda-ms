import { expect, Page } from "@playwright/test";

export const OWNER_EMAIL = "owner@ykms.local";
export const OWNER_PASSWORD = "Owner@12345";

export async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(OWNER_EMAIL);
  await page.getByLabel("كلمة المرور").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

export async function createTakeawayOrder(page: Page) {
  await page.goto("/pos");
  await expect(page.locator(".posx")).toBeVisible();

  const product = page.locator(".posx-card2:not(.off)").first();
  await expect(product).toBeVisible();
  await product.click({ position: { x: 16, y: 16 } });

  const cardPayment = page.getByRole("button", { name: "بطاقة", exact: true });
  await expect(cardPayment).toBeVisible();
  await cardPayment.click();

  const submit = page.getByRole("button", { name: "طلب الآن", exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();

  const receipt = page.locator(".receipt-modal");
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText(/طلب|فاتورة|الإجمالي/);

  const close = receipt.getByRole("button", { name: "إغلاق", exact: true });
  await close.click();
  await expect(receipt).toBeHidden();
}
