"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";

type SidebarProps = {
  userEmail: string;
};

type SidebarContentProps = {
  userEmail: string;
  onNavigate?: () => void;
  showTitle?: boolean;
};

function SidebarContent({
  userEmail,
  onNavigate,
  showTitle = true,
}: SidebarContentProps) {
  const linkClassName =
    "block rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200";

  return (
    <>
      {showTitle && (
        <div className="border-b border-gray-200 p-4">
          <Link
            href="/"
            className="text-lg font-bold"
            onClick={onNavigate}
          >
            トークアーカイブ
          </Link>
        </div>
      )}

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          <li>
            <Link
              href="/"
              className={linkClassName}
              onClick={onNavigate}
            >
              会話一覧
            </Link>
          </li>
          <li>
            <Link
              href="/search"
              className={linkClassName}
              onClick={onNavigate}
            >
              検索
            </Link>
          </li>
          <li>
            <Link
              href="/conversations/new"
              className={linkClassName}
              onClick={onNavigate}
            >
              新規作成
            </Link>
          </li>
          <li>
            <Link
              href="/settings"
              className={linkClassName}
              onClick={onNavigate}
            >
              設定
            </Link>
          </li>
        </ul>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <p className="truncate text-xs text-gray-500">{userEmail}</p>
        <LogoutButton />
      </div>
    </>
  );
}

export function Sidebar({ userEmail }: SidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 lg:hidden">
        <Link href="/" className="text-lg font-bold">
          トークアーカイブ
        </Link>
        <button
          type="button"
          aria-label="ナビゲーションを開く"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((prev) => !prev)}
          className="rounded border border-gray-300 p-2 text-gray-600 hover:bg-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M3 5.75A.75.75 0 013.75 5h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 5.75zm0 4.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10zm.75 3.5a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H3.75z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="ナビゲーション"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-gray-50 shadow-lg lg:hidden"
          >
            <div className="border-b border-gray-200 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">メニュー</span>
            </div>
            <SidebarContent
              userEmail={userEmail}
              onNavigate={() => setIsMobileOpen(false)}
              showTitle={false}
            />
          </aside>
        </>
      )}

      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 lg:flex">
        <SidebarContent userEmail={userEmail} />
      </aside>
    </>
  );
}
