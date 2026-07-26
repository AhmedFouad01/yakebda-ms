import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { brand } from "../config/brand";
import { Login } from "./Login";

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  setToken: vi.fn(),
}));

describe("Login branding", () => {
  it("shows the default logo without restaurant or system brand text", () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole("img", { name: brand.nameAr }).getAttribute("src")).toBe(brand.logoPath);
    expect(container.querySelector(".brand-mark")).toBeNull();
    expect(container.querySelector(".brand-sub")).toBeNull();
  });
});
