import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithParticipants } from "@/usecases/conversationUseCases";
import {
  getMediaUrlsForRecords,
  listMediaRecordsByConversation,
} from "@/usecases/recordUseCases";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";
import { MediaGallery } from "@/components/MediaGallery";

type ConversationMediaPageProps = {
  params: Promise<{ id: string }>;
};

const getCachedConversationWithParticipants = cache(async (id: string) => {
  const supabase = await createSupabaseServerClient();
  return getConversationWithParticipants(supabase, id);
});

export async function generateMetadata({
  params,
}: ConversationMediaPageProps): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getCachedConversationWithParticipants(id);
  return {
    title: conversation
      ? `メディア一覧 - ${conversation.title} | トークアーカイブ`
      : "トークアーカイブ",
  };
}

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

  const conversation = await getCachedConversationWithParticipants(id);

  if (!conversation) {
    notFound();
  }

  const mediaRecords = await listMediaRecordsByConversation(supabase, id);
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
