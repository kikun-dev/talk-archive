import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewConversationForm } from "@/components/NewConversationForm";
import { listSources } from "@/usecases/sourceUseCases";

export default async function NewConversationPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sources = await listSources(supabase, user.id);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">新しい会話</h1>
      <div className="mt-6">
        <NewConversationForm sources={sources} />
      </div>
    </div>
  );
}
