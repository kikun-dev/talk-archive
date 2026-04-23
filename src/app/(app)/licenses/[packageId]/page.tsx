import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLicensePackageById } from "@/lib/licenseInventory";

type LicenseDetailPageProps = {
  params: Promise<{ packageId: string }>;
};

export default async function LicenseDetailPage({
  params,
}: LicenseDetailPageProps) {
  const { packageId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const pkg = getLicensePackageById(decodeURIComponent(packageId));

  if (!pkg) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/licenses"
        className="text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        ライセンス一覧に戻る
      </Link>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-all text-lg font-bold text-gray-900">
              {pkg.name}
            </h1>
            <p className="mt-2 break-all text-sm text-gray-500">
              {pkg.versions.join(", ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {pkg.license}
            </span>
            {pkg.manualReviewRequired ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                手動確認
              </span>
            ) : null}
          </div>
        </div>

        {pkg.description ? (
          <p className="mt-4 text-sm leading-6 text-gray-600">{pkg.description}</p>
        ) : null}

        {pkg.homepage ? (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500">参照先</p>
            <a
              href={pkg.homepage}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block break-all text-sm text-blue-600 hover:text-blue-800"
            >
              {pkg.homepage}
            </a>
          </div>
        ) : null}

        {pkg.licenseSource ? (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500">取得元</p>
            <p className="mt-1 text-sm text-gray-700">{pkg.licenseSource}</p>
          </div>
        ) : null}
      </div>

      {pkg.noticeText ? (
        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">NOTICE</h2>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-amber-950">
            {pkg.noticeText}
          </pre>
        </section>
      ) : null}

      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">ライセンス本文</h2>
        {pkg.licenseText ? (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-gray-700">
            {pkg.licenseText}
          </pre>
        ) : (
          <p className="mt-3 text-sm leading-6 text-amber-800">
            ライセンス本文を自動取得できなかったため、手動確認が必要です。
          </p>
        )}
      </section>
    </div>
  );
}
