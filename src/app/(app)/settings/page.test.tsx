import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LicenseInventory } from "@/types/licenseInventory";

const createSupabaseServerClientMock = vi.fn();
const getDisplayNameMock = vi.fn();
const getLicenseInventoryMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/userSettingsUseCases", () => ({
  getDisplayName: getDisplayNameMock,
}));

vi.mock("@/lib/licenseInventory", () => ({
  getLicenseInventory: getLicenseInventoryMock,
}));

vi.mock("@/components/SettingsForm", () => ({
  SettingsForm: ({ currentDisplayName }: { currentDisplayName: string }) => (
    <div data-testid="settings-form">{currentDisplayName}</div>
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

function mockSupabaseUser(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDisplayNameMock.mockResolvedValue("太郎");
    const inventory: LicenseInventory = {
      generatedAt: "2026-04-24T00:00:00.000Z",
      packageCount: 42,
      manualReviewRequiredCount: 3,
      licenses: [],
      packages: [],
    };
    getLicenseInventoryMock.mockReturnValue(inventory);
  });

  it("redirects to /login when user is not authenticated", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: SettingsPage } = await import("./page");

    await expect(SettingsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders a navigation cell to the license page", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: SettingsPage } = await import("./page");
    render(await SettingsPage());

    expect(screen.getByTestId("settings-form")).toHaveTextContent("太郎");
    expect(screen.getByRole("link", { name: /OSSライセンス/ })).toHaveAttribute(
      "href",
      "/licenses",
    );
    expect(screen.getByText("42パッケージ")).toBeInTheDocument();
    expect(screen.getByText("要確認 3件")).toBeInTheDocument();
  });
});
