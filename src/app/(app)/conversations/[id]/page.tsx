import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getConversationWithRecords,
  getParticipantThumbnailUrls,
} from "@/usecases/conversationUseCases";
import { getMediaUrlsForRecords } from "@/usecases/recordUseCases";
import { getDisplayName } from "@/usecases/userSettingsUseCases";
import { ChatView } from "@/components/ChatView";
import type { MediaUrl } from "@/usecases/recordUseCases";

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
};

const getCachedConversationWithRecords = cache(async (id: string) => {
  const supabase = await createSupabaseServerClient();
  return getConversationWithRecords(supabase, id);
});

export async function generateMetadata({
  params,
}: ConversationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getCachedConversationWithRecords(id);
  return {
    title: conversation
      ? `${conversation.title} | トークアーカイブ`
      : "トークアーカイブ",
  };
}

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

  const conversation = await getCachedConversationWithRecords(id);

  if (!conversation) {
    notFound();
  }

  const [mediaUrlMap, participantThumbnailUrlMap, displayName] = await Promise.all([
    getMediaUrlsForRecords(supabase, conversation.records),
    getParticipantThumbnailUrls(supabase, conversation.participants),
    getDisplayName(supabase, user.id),
  ]);

  const mediaUrls: { [recordId: string]: MediaUrl } = {};
  if (mediaUrlMap) {
    for (const [key, value] of mediaUrlMap) {
      mediaUrls[key] = value;
    }
  }

  const participantThumbnailUrls: { [participantId: string]: string } = {};
  for (const participant of conversation.participants) {
    const thumbnailUrl = participantThumbnailUrlMap.get(participant.id);
    if (thumbnailUrl) {
      participantThumbnailUrls[participant.id] = thumbnailUrl;
    }
  }

  return (
    <ChatView
      conversation={conversation}
      mediaUrls={mediaUrls}
      participantThumbnailUrls={participantThumbnailUrls}
      displayName={displayName}
    />
  );
}
