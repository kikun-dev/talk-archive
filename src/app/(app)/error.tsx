"use client";

import Link from "next/link";
import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-2xl font-bold">エラーが発生しました</h1>
      <p className="mt-2 text-sm text-gray-500">
        予期せぬエラーが発生しました。時間をおいて再度お試しください。
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          再試行
        </button>
        <Link
          href="/"
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          会話一覧に戻る
        </Link>
      </div>
    </div>
  );
}
