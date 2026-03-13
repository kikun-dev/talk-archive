import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import {
  filterMediaRecords,
  getMediaUrlsForRecords,
} from "@/usecases/recordUseCases";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";
import { MediaGallery } from "@/components/MediaGallery";

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

  const mediaRecords = filterMediaRecords(conversation.records);
  const mediaUrlMap = await getMediaUrlsForRecords(supabase, mediaRecords);
  const mediaUrls: { [recordId: string]: { url: string; mimeType: string } } =
    {};
  for (const [recordId, mediaUrl] of mediaUrlMap) {
    mediaUrls[recordId] = mediaUrl;
  }

  return (
    <ConversationSubpageLayout
      conversationId={conversation.id}
      title="会話内メディア一覧"
    >
      <MediaGallery
        conversationId={conversation.id}
        records={mediaRecords}
        participants={conversation.participants}
        mediaUrls={mediaUrls}
      />
    </ConversationSubpageLayout>
  );
}
