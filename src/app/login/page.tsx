"use client";

import { useActionState } from "react";
import { FormError } from "@/components/FormError";
import { login } from "./actions";

type LoginState = { error: string } | undefined;

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    async (_prevState, formData) => {
      return await login(formData);
    },
    undefined,
  );

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-bold">
          トークアーカイブ
        </h1>
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium"
            >
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <FormError message={state?.error} />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
