import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "検索 | トークアーカイブ",
};
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchRecords } from "@/usecases/searchUseCases";
import { getDisplayName } from "@/usecases/userSettingsUseCases";
import { SearchResults } from "@/components/SearchResults";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const query = q?.trim() ?? "";
  const [results, displayName] = await Promise.all([
    query.length > 0
      ? searchRecords(supabase, { userId: user.id, query })
      : Promise.resolve(null),
    getDisplayName(supabase, user.id),
  ]);

  return (
    <div>
      <h1 className="text-lg font-bold">検索</h1>

      <form className="mt-4 flex items-center gap-3">
        <input
          name="q"
          type="text"
          defaultValue={query}
          placeholder="レコードを検索..."
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          検索
        </button>
      </form>

      {query.length > 0 && results && (
        <SearchResults results={results} query={query} displayName={displayName} />
      )}
    </div>
  );
}
