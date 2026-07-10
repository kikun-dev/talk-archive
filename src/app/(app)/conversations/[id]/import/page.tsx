import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithParticipants } from "@/usecases/conversationUseCases";
import { ConversationSubpageLayout } from "@/components/ConversationSubpageLayout";
import { TalkImportForm } from "@/components/TalkImportForm";
import { APP_NAME } from "@/lib/brand";

type ConversationImportPageProps = {
  params: Promise<{ id: string }>;
};

const getCachedConversationWithParticipants = cache(async (id: string) => {
  const supabase = await createSupabaseServerClient();
  return getConversationWithParticipants(supabase, id);
});

export async function generateMetadata({
  params,
}: ConversationImportPageProps): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getCachedConversationWithParticipants(id);
  return {
    title: conversation
      ? `インポート - ${conversation.title}`
      : { absolute: APP_NAME },
  };
}

export default async function ConversationImportPage({
  params,
}: ConversationImportPageProps) {
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

  return (
    <ConversationSubpageLayout
      conversationId={conversation.id}
      title="トークJSONインポート"
    >
      <TalkImportForm
        conversationId={conversation.id}
        participants={conversation.participants}
      />
    </ConversationSubpageLayout>
  );
}
