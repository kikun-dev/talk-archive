import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LicenseInventory } from "@/types/licenseInventory";

const createSupabaseServerClientMock = vi.fn();
const getLicensePackageByIdMock = vi.fn();
const redirectMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/licenseInventory", () => ({
  getLicensePackageById: getLicensePackageByIdMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

const packageRecord: LicenseInventory["packages"][number] = {
  id: "pkg-a@1.0.0",
  name: "pkg-a",
  versions: ["1.0.0"],
  license: "MIT",
  homepage: "https://example.com/pkg-a",
  description: "Package A",
  licenseText: "MIT License text",
  noticeText: "Notice text",
  licenseSource: "LICENSE",
  manualReviewRequired: false,
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

describe("LicenseDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLicensePackageByIdMock.mockReturnValue(packageRecord);
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: LicenseDetailPage } = await import("./page");

    await expect(
      LicenseDetailPage({
        params: Promise.resolve({ packageId: "pkg-a%401.0.0" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getLicensePackageByIdMock).not.toHaveBeenCalled();
  });

  it("renders package detail with license and notice text", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: LicenseDetailPage } = await import("./page");
    render(
      await LicenseDetailPage({
        params: Promise.resolve({ packageId: "pkg-a%401.0.0" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "pkg-a" }),
    ).toBeInTheDocument();
    expect(screen.getByText("MIT License text")).toBeInTheDocument();
    expect(screen.getByText("Notice text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.com/pkg-a" })).toHaveAttribute(
      "href",
      "https://example.com/pkg-a",
    );
    expect(screen.getByRole("link", { name: "ライセンス一覧に戻る" })).toHaveAttribute(
      "href",
      "/licenses",
    );
  });

  it("renders a neutral fallback message when license text is not available", async () => {
    mockSupabaseUser({ id: "user-1" });
    getLicensePackageByIdMock.mockReturnValue({
      ...packageRecord,
      licenseText: null,
      manualReviewRequired: true,
    });

    const { default: LicenseDetailPage } = await import("./page");
    render(
      await LicenseDetailPage({
        params: Promise.resolve({ packageId: "pkg-a%401.0.0" }),
      }),
    );

    expect(
      screen.getByText("ライセンス本文は提供元の配布内容をご確認ください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("手動確認")).toBeNull();
  });

  it("calls notFound when the package cannot be found", async () => {
    mockSupabaseUser({ id: "user-1" });
    getLicensePackageByIdMock.mockReturnValue(null);
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    const { default: LicenseDetailPage } = await import("./page");

    await expect(
      LicenseDetailPage({
        params: Promise.resolve({ packageId: "missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalled();
  });
});
