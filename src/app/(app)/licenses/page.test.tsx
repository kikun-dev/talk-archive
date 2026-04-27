import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LicenseInventory } from "@/types/licenseInventory";

const createSupabaseServerClientMock = vi.fn();
const getLicenseInventoryMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/licenseInventory", () => ({
  getLicenseInventory: getLicenseInventoryMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const inventory: LicenseInventory = {
  packageCount: 2,
  manualReviewRequiredCount: 1,
  licenses: [
    { license: "MIT", count: 1 },
    { license: "Apache-2.0", count: 1 },
  ],
  packages: [
    {
      id: "pkg-a@1.0.0",
      name: "pkg-a",
      versions: ["1.0.0"],
      license: "MIT",
      homepage: "https://example.com/pkg-a",
      description: "Package A",
      licenseText: "MIT License text",
      noticeText: null,
      licenseSource: "LICENSE",
      manualReviewRequired: false,
    },
    {
      id: "pkg-b@2.0.0",
      name: "pkg-b",
      versions: ["2.0.0"],
      license: "Apache-2.0",
      homepage: "https://example.com/pkg-b",
      description: "Package B",
      licenseText: null,
      noticeText: null,
      licenseSource: null,
      manualReviewRequired: true,
    },
  ],
};

function mockSupabaseUser(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  });
}

describe("LicensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLicenseInventoryMock.mockReturnValue(inventory);
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: LicensesPage } = await import("./page");

    await expect(LicensesPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getLicenseInventoryMock).not.toHaveBeenCalled();
  });

  it("renders summary and package links", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: LicensesPage } = await import("./page");
    render(await LicensesPage());

    expect(
      screen.getByRole("heading", { name: "OSSライセンス" }),
    ).toBeInTheDocument();
    expect(screen.getByText("パッケージ数")).toBeInTheDocument();
    expect(screen.getByText("ライセンス種別")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pkg-a/ })).toHaveAttribute(
      "href",
      "/licenses/pkg-a%401.0.0",
    );
    expect(screen.getByRole("link", { name: /pkg-b/ })).toHaveAttribute(
      "href",
      "/licenses/pkg-b%402.0.0",
    );
    expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
    expect(screen.queryByText("要確認")).toBeNull();
    expect(screen.queryByText("手動確認")).toBeNull();
  });
});
