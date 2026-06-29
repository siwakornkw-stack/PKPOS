// Requires: npx playwright install chromium, and the server running on :3000 (npm start).
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill("owner");
  await page.getByLabel("รหัส PIN / รหัสผ่าน").fill("1234");
  await page.getByRole("button", { name: "เข้าสู่ระบบ / เปิดกะ" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("login and see dashboard", async ({ page }) => {
  await login(page);
  await expect(page.getByText("แดชบอร์ด")).toBeVisible();
});

test("menu loads on POS", async ({ page }) => {
  await login(page);
  await page.goto("/pos");
  await expect(page.getByText("฿").first()).toBeVisible();
});
