import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getConversationCoverUrls,
  getConversationWithRecords,
  getParticipantThumbnailUrls,
} from "@/usecases/conversationUseCases";
import { ConversationActions } from "@/components/ConversationActions";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";

type ConversationOverviewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationOverviewPage({
  params,
}: ConversationOverviewPageProps) {
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

  const [participantThumbnailUrlMap, coverImageUrlMap] = await Promise.all([
    getParticipantThumbnailUrls(supabase, conversation.participants),
    getConversationCoverUrls(supabase, [conversation]),
  ]);

  const participantThumbnailUrls: { [participantId: string]: string } = {};
  for (const participant of conversation.participants) {
    const thumbnailUrl = participantThumbnailUrlMap.get(participant.id);
    if (thumbnailUrl) {
      participantThumbnailUrls[participant.id] = thumbnailUrl;
    }
  }

  return (
    <ConversationSubpageLayout
      conversationId={conversation.id}
      title="概要"
    >
      <ConversationActions
        conversation={conversation}
        participantThumbnailUrls={participantThumbnailUrls}
        coverImageUrl={coverImageUrlMap.get(conversation.id)}
      />
    </ConversationSubpageLayout>
  );
}
