import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const WEB_ORIGIN = process.env.P2_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const API_ORIGIN = process.env.P2_API_ORIGIN ?? "http://127.0.0.1:3001";
const OUTPUT_DIR = path.resolve("docs/engineering/visual-baseline/p2-before");
const EMAIL = process.env.P2_OWNER_EMAIL;
const PASSWORD = process.env.P2_OWNER_PASSWORD;
const THEME_KEY = "yakebda-ms.theme";

if (!EMAIL || !PASSWORD) throw new Error("P2_OWNER_EMAIL and P2_OWNER_PASSWORD are required.");

const viewports = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const themes = ["light", "dark"];

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url} failed (${response.status}): ${body.message ?? JSON.stringify(body)}`);
  return body;
}

async function createFixtureOrder() {
  const login = await requestJson(`${API_ORIGIN}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` };
  const branches = await requestJson(`${API_ORIGIN}/api/v1/branches`, { headers });
  const branch = branches.data?.[0];
  if (!branch) throw new Error("Visual fixture requires a seeded branch.");
  const sources = await requestJson(`${API_ORIGIN}/api/v1/order-sources?active_only=true&order_type=takeaway`, { headers });
  const source = sources.data?.[0];
  if (!source) throw new Error("Visual fixture requires an active takeaway source.");
  const menu = await requestJson(`${API_ORIGIN}/api/v1/branches/${branch.id}/menu?source_id=${encodeURIComponent(source.id)}`, { headers });
  const products = (menu.data?.categories ?? []).flatMap((category) => category.products ?? []);
  const product = products.find((item) => item.is_available !== false && item.pos_visible !== false);
  if (!product) throw new Error("Visual fixture requires an available POS product.");
  const modifierIds = (product.modifier_groups ?? [])
    .filter((group) => group.is_required)
    .map((group) => group.modifiers?.[0]?.id)
    .filter(Boolean);
  const created = await requestJson(`${API_ORIGIN}/api/v1/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      branch_id: branch.id,
      source_id: source.id,
      order_type: "takeaway",
      table_id: null,
      customer_id: null,
      delivery_address: null,
      delivery_phone: null,
      delivery_zone_id: null,
      delivery_fee: 0,
      submit: true,
      payment_method: "unpaid",
      discount: 0,
      discount_reason: null,
      notes: "P2 visual baseline fixture",
      items: [{
        product_id: product.id,
        variant_id: product.variants?.[0]?.id ?? null,
        qty: 2,
        notes: null,
        modifier_ids: modifierIds,
      }],
    }),
  });
  return { branchId: branch.id, sourceId: source.id, orderId: created.data?.id };
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 }),
    page.locator("form.login-card button").click(),
  ]);
  await page.waitForLoadState("networkidle");
}

async function stabilize(page) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(500);
}

async function preparePos(page) {
  await page.goto(`${WEB_ORIGIN}/pos`, { waitUntil: "networkidle" });
  await page.locator(".posx-card2:not(.off)").first().waitFor({ state: "visible", timeout: 20_000 });
  const source = page.locator(".posx-source-field select");
  if (await source.count()) {
    const values = await source.locator("option").evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
    if (values[0]) await source.selectOption(values[0]);
  }
  const cards = page.locator(".posx-card2:not(.off)");
  const count = Math.min(await cards.count(), 4);
  for (let index = 0; index < count; index += 1) await cards.nth(index).click({ position: { x: 24, y: 24 } });
  await page.waitForTimeout(900);
}

async function prepareOrdersDetail(page) {
  await page.goto(`${WEB_ORIGIN}/orders`, { waitUntil: "networkidle" });
  const details = page.locator(".orders-table tbody .table-action.secondary").first();
  await details.waitFor({ state: "visible", timeout: 20_000 });
  await details.click();
  await page.locator(".od-modal").waitFor({ state: "visible", timeout: 20_000 });
}

const screens = [
  { name: "pos", prepare: preparePos },
  { name: "kds", path: "/kitchen", ready: "body" },
  { name: "orders-detail", prepare: prepareOrdersDetail },
  { name: "menu", path: "/menu", ready: "body" },
  { name: "customers", path: "/customers", ready: "body" },
  { name: "users", path: "/users", ready: "body" },
];

await mkdir(OUTPUT_DIR, { recursive: true });
const fixture = await createFixtureOrder();
const browser = await chromium.launch({ headless: true });
const manifest = {
  generated_at: new Date().toISOString(),
  source_branch: process.env.GITHUB_REF_NAME ?? "refactor/p2-maintainability",
  source_sha: process.env.GITHUB_SHA ?? null,
  fixture,
  screenshots: [],
};

try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport, locale: "ar-EG", colorScheme: theme });
      const page = await context.newPage();
      await login(page);
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, theme]);
      await page.reload({ waitUntil: "networkidle" });
      for (const screen of screens) {
        if (screen.prepare) await screen.prepare(page);
        else {
          await page.goto(`${WEB_ORIGIN}${screen.path}`, { waitUntil: "networkidle" });
          await page.locator(screen.ready).first().waitFor({ state: "visible", timeout: 20_000 });
        }
        await stabilize(page);
        const filename = `${screen.name}--${viewport.width}x${viewport.height}--${theme}.png`;
        await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: false, animations: "disabled" });
        manifest.screenshots.push({ screen: screen.name, viewport, theme, file: filename });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Captured ${manifest.screenshots.length} P2 baseline screenshots.`);
