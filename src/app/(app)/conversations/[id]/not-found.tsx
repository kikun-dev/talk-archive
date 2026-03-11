import Link from "next/link";

export default function ConversationNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-2xl font-bold">会話が見つかりません</h1>
      <p className="mt-2 text-sm text-gray-500">
        指定された会話は存在しないか、削除された可能性があります。
      </p>
      <Link
        href="/"
        className="mt-6 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        会話一覧に戻る
      </Link>
    </div>
  );
}
