import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { ConversationHeader } from "@/components/ConversationHeader";
import { RecordTimeline } from "@/components/RecordTimeline";

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationDetailPage({
  params,
}: ConversationDetailPageProps) {
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
    <div className="mx-auto max-w-3xl">
      <ConversationHeader conversation={conversation} />
      <div className="mt-6">
        <RecordTimeline records={conversation.records} />
      </div>
    </div>
  );
}
