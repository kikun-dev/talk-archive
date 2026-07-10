"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import {
  previewTalkImportAction,
  executeTalkImportAction,
} from "@/app/(app)/conversations/[id]/import/actions";
import { FormError } from "@/components/FormError";
import { formatDateTimeJst } from "@/lib/dateTime";
import type { ConversationParticipant } from "@/types/domain";
import {
  MAX_IMPORT_FILE_SIZE,
  type ImportPreview,
  type ImportResult,
} from "@/usecases/importUseCases";

type TalkImportFormProps = {
  conversationId: string;
  participants: ConversationParticipant[];
};

type Stage = "select" | "preview" | "result";

const NEW_PARTICIPANT_VALUE = "new";

const typeLabels: { key: keyof ImportPreview["typeCounts"]; label: string }[] = [
  { key: "text", label: "テキスト" },
  { key: "image", label: "画像" },
  { key: "video", label: "動画" },
  { key: "audio", label: "音声" },
];

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatPeriod(period: ImportPreview["period"]): string {
  if (!period) {
    return "-";
  }
  return `${formatDateTimeJst(period.start)} 〜 ${formatDateTimeJst(period.end)}`;
}

export function TalkImportForm({
  conversationId,
  participants,
}: TalkImportFormProps) {
  const fileInputId = useId();
  const [stage, setStage] = useState<Stage>("select");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    (ImportPreview & { rowErrors: string[] }) | null
  >(null);
  const [speakerAssignments, setSpeakerAssignments] = useState<{
    [speakerName: string]: string;
  }>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  function resetToSelect() {
    setStage("select");
    setError(undefined);
    setJsonText(null);
    setPreview(null);
    setSpeakerAssignments({});
    setResult(null);
    setFileInputKey((key) => key + 1);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(undefined);

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setError("ファイルサイズは5MB以内にしてください");
      setFileInputKey((key) => key + 1);
      return;
    }

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setError("ファイルの読み込みに失敗しました");
      return;
    }

    startTransition(async () => {
      const response = await previewTalkImportAction(conversationId, text);
      if ("error" in response) {
        setError(response.error);
        return;
      }

      const defaultAssignments: { [speakerName: string]: string } = {};
      for (const speaker of response.preview.unknownSpeakers) {
        defaultAssignments[speaker] = NEW_PARTICIPANT_VALUE;
      }

      setJsonText(text);
      setPreview(response.preview);
      setSpeakerAssignments(defaultAssignments);
      setStage("preview");
    });
  }

  function handleExecute() {
    if (jsonText === null) {
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const response = await executeTalkImportAction(
        conversationId,
        jsonText,
        JSON.stringify(speakerAssignments),
      );
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setResult(response.result);
      setStage("result");
    });
  }

  if (stage === "result" && result) {
    const createdParticipantNames = Object.keys(result.createdParticipants);

    return (
      <div className="space-y-4">
        <div className="space-y-1 text-sm text-gray-700">
          <p>作成件数: {result.createdCount}件</p>
          <p>スキップ件数: {result.skippedCount}件</p>
          {createdParticipantNames.length > 0 && (
            <p>
              新規追加された参加者: {createdParticipantNames.join("、")}
            </p>
          )}
        </div>
        <Link
          href={`/conversations/${conversationId}`}
          className="inline-block rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          トークに戻る
        </Link>
      </div>
    );
  }

  if (stage === "preview" && preview) {
    const canExecute = preview.importableCount > 0;

    return (
      <div className="space-y-4">
        <div className="space-y-1 text-sm text-gray-700">
          <p>
            総件数: {preview.totalCount}件
            {preview.rowErrors.length > 0 &&
              `（うち行エラー ${preview.rowErrors.length}件）`}
          </p>
          <p>取り込み対象: {preview.importableCount}件</p>
          <p>重複スキップ予定: {preview.duplicateCount}件</p>
          <p>期間: {formatPeriod(preview.period)}</p>
          <p>
            種別内訳:{" "}
            {typeLabels
              .map(({ key, label }) => `${label} ${preview.typeCounts[key]}`)
              .join(" / ")}
          </p>
        </div>

        {!canExecute && (
          <p className="text-sm text-gray-500">
            取り込める新しいトークがありません
          </p>
        )}

        {preview.rowErrors.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-700">
              以下の行は取り込まれません
            </p>
            <ul className="ml-4 list-disc text-xs text-gray-500">
              {preview.rowErrors.map((rowError, index) => (
                <li key={index}>{rowError}</li>
              ))}
            </ul>
          </div>
        )}

        {preview.unknownSpeakers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              未登録の発言者の割り当て
            </p>
            {preview.unknownSpeakers.map((speaker) => (
              <div key={speaker} className="flex items-center gap-2">
                <label
                  htmlFor={`speaker-${speaker}`}
                  className="min-w-0 flex-1 truncate text-sm text-gray-700"
                >
                  {speaker}
                </label>
                <select
                  id={`speaker-${speaker}`}
                  aria-label={`${speaker}の割り当て`}
                  value={speakerAssignments[speaker] ?? NEW_PARTICIPANT_VALUE}
                  onChange={(event) =>
                    setSpeakerAssignments((prev) => ({
                      ...prev,
                      [speaker]: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value={NEW_PARTICIPANT_VALUE}>
                    新規参加者として追加
                  </option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <FormError message={error} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExecute}
            disabled={isPending || !canExecute}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "インポート中..." : "インポート実行"}
          </button>
          <button
            type="button"
            onClick={resetToSelect}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            やり直す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={fileInputId}
          className="block text-sm font-medium text-gray-700"
        >
          インポートするJSONファイル
        </label>
        <input
          key={fileInputKey}
          id={fileInputId}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm"
        />
        {isPending && (
          <p className="mt-1 text-xs text-gray-500">読み込み中...</p>
        )}
      </div>

      <FormError message={error} />
    </div>
  );
}
