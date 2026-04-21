"use client";

import { useActionState } from "react";
import {
  updateDisplayNameAction,
  type SettingsActionState,
} from "@/app/(app)/settings/actions";
import { FormError } from "@/components/FormError";

type SettingsFormProps = {
  currentDisplayName: string;
};

export function SettingsForm({ currentDisplayName }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateDisplayNameAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
          名前
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          maxLength={50}
          defaultValue={currentDisplayName}
          placeholder="名前を入力"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <FormError message={state?.error} />
      {state?.success && (
        <p className="text-sm text-green-600">表示名を更新しました。</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
