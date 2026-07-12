import { expect, test } from "@playwright/test";
import { createTakeawayOrder, loginAsOwner } from "./helpers";

test("cashier can create a card-paid takeaway order", async ({ page }) => {
  await loginAsOwner(page);
  await createTakeawayOrder(page);

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "الطلبات" })).toBeVisible();

  const rows = page.locator(".orders-table tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText("تيك أواي");

  const details = rows.first().getByRole("button", { name: "تفاصيل الطلب" });
  await details.click();

  const dialog = page.getByRole("dialog", { name: /تفاصيل الطلب/ });
  await expect(dialog).toBeVisible();

  const reviewTab = dialog.getByRole("tab", { name: "المراجعة" });
  const receiptTab = dialog.getByRole("tab", { name: "الفاتورة" });
  await expect(reviewTab).toHaveAttribute("aria-selected", "true");
  await receiptTab.click();
  await expect(receiptTab).toHaveAttribute("aria-selected", "true");
  await expect(reviewTab).toHaveAttribute("aria-selected", "false");
});
