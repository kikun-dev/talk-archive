import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";

type ConversationDateSearchPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationDateSearchPage({
  params,
}: ConversationDateSearchPageProps) {
  const { id } = await params;

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

  return (
    <ConversationSubpageLayout
      conversationId={conversation.id}
      title="日付検索"
      description="日付検索ページは #75 で実装予定です。現時点では導線のみ用意しています。"
    />
  );
}
