import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { brand } from "../../config/brand";
import { AppShell } from "./AppShell";

vi.mock("../../lib/api", () => ({ setToken: vi.fn() }));
vi.mock("../../lib/me", () => ({
  clearMe: vi.fn(),
  useMe: () => ({ me: null, ready: true, can: () => false }),
}));
vi.mock("../../lib/brandLogo", () => ({ useBrandLogoUrl: () => "/brand/yakebda-logo-default.png" }));

describe("AppShell branding", () => {
  it("renders a logo-only navigation drawer header", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell><div>content</div></AppShell>
      </MemoryRouter>
    );

    const menu = document.querySelector<HTMLButtonElement>(".app2-menu");
    expect(menu).toBeTruthy();
    fireEvent.click(menu!);

    const drawer = screen.getByRole("dialog");
    expect(drawer.querySelector("img.app2-navdrawer-logo")).toBeTruthy();
    expect(drawer.textContent).not.toContain(brand.nameAr);
  });
});
