import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Source } from "@/types/domain";
import { listSources } from "./sourceUseCases";

vi.mock("@/repositories/sourceRepository");

import { getSources } from "@/repositories/sourceRepository";

const mockGetSources = vi.mocked(getSources);
const client = {} as SupabaseClient<Database>;

const sources: Source[] = [
  {
    id: "src-1",
    userId: "user-1",
    name: "LINE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("sourceUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns sources from repository", async () => {
    mockGetSources.mockResolvedValue(sources);

    const result = await listSources(client, "user-1");

    expect(result).toEqual(sources);
    expect(mockGetSources).toHaveBeenCalledWith(client, "user-1");
  });
});
