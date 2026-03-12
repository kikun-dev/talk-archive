import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { getRecordsByDate } from "@/usecases/recordUseCases";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";
import { DateSearchResults } from "@/components/DateSearchResults";

type ConversationDateSearchPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

export default async function ConversationDateSearchPage({
  params,
  searchParams,
}: ConversationDateSearchPageProps) {
  const { id } = await params;
  const { date } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversation = await getConversationWithRecords(supabase, id);

  if (!conversation) {
    notFound();
  }

  const records =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? await getRecordsByDate(supabase, id, date)
      : null;

  return (
    <ConversationSubpageLayout
      conversationId={conversation.id}
      title="日付検索"
    >
      <form className="flex items-end gap-3">
        <div>
          <label
            htmlFor="date-search-input"
            className="block text-sm font-medium text-gray-700"
          >
            日付を選択
          </label>
          <input
            id="date-search-input"
            name="date"
            type="date"
            defaultValue={date ?? ""}
            required
            className="mt-1 block rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          検索
        </button>
      </form>

      {date && records && (
        <DateSearchResults
          conversationId={conversation.id}
          records={records}
          participants={conversation.participants}
          selectedDate={date}
        />
      )}
    </ConversationSubpageLayout>
  );
}
