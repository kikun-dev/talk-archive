import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { ConversationActions } from "@/components/ConversationActions";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";

type ConversationEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationEditPage({
  params,
}: ConversationEditPageProps) {
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
      title="会話編集"
    >
      <ConversationActions conversation={conversation} defaultEditing />
    </ConversationSubpageLayout>
  );
}
