import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/usecases/userSettingsUseCases";
import { MY_NAME_PLACEHOLDER } from "@/types/domain";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = await getDisplayName(supabase, user.id);

  return (
    <div>
      <h1 className="text-lg font-bold">設定</h1>

      <div className="mt-6 max-w-md">
        <h2 className="text-sm font-semibold text-gray-800">表示名</h2>
        <p className="mt-1 text-xs text-gray-500">
          トーク内の <code className="rounded bg-gray-100 px-1">{MY_NAME_PLACEHOLDER}</code> がこの名前に置き換えて表示されます。
        </p>
        <div className="mt-3">
          <SettingsForm currentDisplayName={displayName} />
        </div>
      </div>
    </div>
  );
}
