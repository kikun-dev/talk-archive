import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listConversationsWithMetadata } from "@/usecases/conversationUseCases";
import { GroupedConversationList } from "@/components/GroupedConversationList";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conversations = await listConversationsWithMetadata(supabase, user!.id);

  return (
    <GroupedConversationList conversations={conversations} />
  );
}
