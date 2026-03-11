import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { ConversationActions } from "@/components/ConversationActions";
import { RecordTimeline } from "@/components/RecordTimeline";
import { AddTextRecordForm } from "@/components/AddTextRecordForm";
import { AddImageRecordForm } from "@/components/AddImageRecordForm";
import { AddVideoRecordForm } from "@/components/AddVideoRecordForm";

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
      <ConversationActions conversation={conversation} />
      <div className="mt-6">
        <RecordTimeline
          records={conversation.records}
          conversationId={conversation.id}
        />
      </div>
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="mb-3 text-lg font-semibold">テキストを追加</h2>
        <AddTextRecordForm conversationId={conversation.id} />
      </div>
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="mb-3 text-lg font-semibold">画像を追加</h2>
        <AddImageRecordForm conversationId={conversation.id} />
      </div>
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="mb-3 text-lg font-semibold">動画を追加</h2>
        <AddVideoRecordForm conversationId={conversation.id} />
      </div>
    </div>
  );
}
