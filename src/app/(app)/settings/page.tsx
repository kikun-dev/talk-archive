import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicenseInventory } from "@/lib/licenseInventory";
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
  const inventory = getLicenseInventory();

  return (
    <div className="max-w-2xl">
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

      <div className="mt-8 max-w-xl">
        <h2 className="text-sm font-semibold text-gray-800">アプリ情報</h2>
        <Link
          href="/licenses"
          className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-4 transition hover:border-gray-300 hover:bg-gray-50"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">OSSライセンス</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              本番依存のライセンス情報を確認できます。
            </p>
            <div className="mt-3">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {inventory.packageCount}パッケージ
              </span>
            </div>
          </div>
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="ml-4 h-5 w-5 shrink-0 text-gray-400"
          >
            <path
              fillRule="evenodd"
              d="M7.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.94 10 7.22 5.28a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
