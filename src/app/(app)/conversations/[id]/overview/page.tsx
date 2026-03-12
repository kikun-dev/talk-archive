import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConversationWithRecords } from "@/usecases/conversationUseCases";
import { ConversationActions } from "@/components/ConversationActions";

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

  return (
    <div className="mx-auto max-w-3xl">
      <ConversationActions conversation={conversation} />
    </div>
  );
}
