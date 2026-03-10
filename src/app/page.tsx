import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-sm text-gray-600">
        ログイン中: {user?.email}
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
