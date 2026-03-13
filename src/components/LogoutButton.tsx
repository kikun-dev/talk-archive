"use client";

import { useActionState } from "react";
import { logout } from "@/app/login/actions";
import { FormError } from "@/components/FormError";

type LogoutState =
  | {
      error: string;
    }
  | undefined;

export function LogoutButton() {
  const [state, formAction, isPending] = useActionState<LogoutState, FormData>(
    async () => logout(),
    undefined,
  );

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        {isPending ? "ログアウト中..." : "ログアウト"}
      </button>
      <FormError message={state?.error} />
    </form>
  );
}
