import Link from "next/link";
import { logout } from "@/app/login/actions";

type SidebarProps = {
  userEmail: string;
};

export function Sidebar({ userEmail }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 p-4">
        <Link href="/" className="text-lg font-bold">
          トークアーカイブ
        </Link>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          <li>
            <Link
              href="/"
              className="block rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              会話一覧
            </Link>
          </li>
          <li>
            <Link
              href="/search"
              className="block rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              検索
            </Link>
          </li>
        </ul>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <p className="truncate text-xs text-gray-500">{userEmail}</p>
        <form action={logout} className="mt-2">
          <button
            type="submit"
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
          >
            ログアウト
          </button>
        </form>
      </div>
    </aside>
  );
}
