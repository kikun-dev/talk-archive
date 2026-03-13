import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { getMediaUrlsForRecords } from "@/usecases/recordUseCases";
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

  const mediaUrlMap = await getMediaUrlsForRecords(
    supabase,
    conversation.records,
  );

  const mediaUrls: { [recordId: string]: MediaUrl } = {};
  if (mediaUrlMap) {
    for (const [key, value] of mediaUrlMap) {
      mediaUrls[key] = value;
    }
  }

  return (
    <ChatView conversation={conversation} mediaUrls={mediaUrls} />
  );
}
