import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();
const createServerClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

describe("updateSession", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getUserMock.mockReset();
    createServerClientMock.mockReset();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

    createServerClientMock.mockReturnValue({
      auth: { getUser: getUserMock },
    });
  });

  it("redirects unauthenticated user to /login", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { updateSession } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("allows unauthenticated user to access /login", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { updateSession } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/login");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("redirects authenticated user away from /login to /", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });

    const { updateSession } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/login");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("allows authenticated user to access protected routes", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });

    const { updateSession } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/conversations");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });
});
