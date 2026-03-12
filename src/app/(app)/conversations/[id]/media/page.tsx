import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";

type ConversationMediaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationMediaPage({
  params,
}: ConversationMediaPageProps) {
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
      title="会話内メディア一覧"
      description="会話内メディア一覧ページは #76 で実装予定です。現時点では導線のみ用意しています。"
    />
  );
}
