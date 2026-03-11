import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listConversationsWithMetadata } from "@/usecases/conversationUseCases";
import { GroupedConversationList } from "@/components/GroupedConversationList";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversations = await listConversationsWithMetadata(supabase, user!.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">会話一覧</h1>
        <Link
          href="/conversations/new"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          新規作成
        </Link>
      </div>
      <div className="mt-4">
        <GroupedConversationList conversations={conversations} />
      </div>
    </div>
  );
}
