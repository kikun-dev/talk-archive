import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicenseInventory } from "@/lib/licenseInventory";

export default async function LicensesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const inventory = getLicenseInventory();

  return (
    <div className="mx-auto max-w-4xl">
      <div>
        <h1 className="text-lg font-bold">OSSライセンス</h1>
        <p className="mt-2 text-sm text-gray-600">
          本番で利用する依存パッケージのライセンス情報です。
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">パッケージ数</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {inventory.packageCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">ライセンス種別</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {inventory.licenses.length}
          </p>
        </div>
        <div className="col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium text-gray-500">主要ライセンス</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {inventory.licenses.map((summary) => (
              <span
                key={summary.license}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
              >
                {summary.license} {summary.count}件
              </span>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {inventory.packages.map((pkg) => (
          <li key={pkg.id}>
            <Link
              href={`/licenses/${encodeURIComponent(pkg.id)}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {pkg.name}
                  </p>
                  <p className="mt-1 break-all text-xs text-gray-500">
                    {pkg.versions.join(", ")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {pkg.license}
                </span>
              </div>

              {pkg.description ? (
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {pkg.description}
                </p>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  {pkg.homepage ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                      参照先あり
                    </span>
                  ) : null}
                </div>
                <span className="font-medium text-gray-500">詳細を見る</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
