import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { getMediaUrlsForRecords } from "@/usecases/recordUseCases";
import { getDisplayName } from "@/usecases/userSettingsUseCases";
import { ChatView } from "@/components/ChatView";
import type { MediaUrl } from "@/usecases/recordUseCases";

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

  const [mediaUrlMap, displayName] = await Promise.all([
    getMediaUrlsForRecords(supabase, conversation.records),
    getDisplayName(supabase, user.id),
  ]);

  const mediaUrls: { [recordId: string]: MediaUrl } = {};
  if (mediaUrlMap) {
    for (const [key, value] of mediaUrlMap) {
      mediaUrls[key] = value;
    }
  }

  return (
    <ChatView
      conversation={conversation}
      mediaUrls={mediaUrls}
      displayName={displayName}
    />
  );
}
