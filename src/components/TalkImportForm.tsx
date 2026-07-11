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
  const [fileName, setFileName] = useState<string | null>(null);
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
    setFileName(null);
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
      setFileName(file.name);
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
      <div className="space-y-6">
        <section className="border-l-4 border-green-600 bg-green-50 px-4 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">
            インポートが完了しました
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-gray-700">
            <p
              role="group"
              aria-label={`作成件数: ${result.createdCount}件`}
            >
              作成件数
              <strong className="mt-1 block text-xl text-gray-900">
                {result.createdCount}件
              </strong>
            </p>
            <p
              role="group"
              aria-label={`スキップ件数: ${result.skippedCount}件`}
            >
              スキップ件数
              <strong className="mt-1 block text-xl text-gray-900">
                {result.skippedCount}件
              </strong>
            </p>
          </div>
          {createdParticipantNames.length > 0 && (
            <p className="mt-4 border-t border-green-200 pt-4 text-sm text-gray-700">
              新規追加された参加者: {createdParticipantNames.join("、")}
            </p>
          )}
        </section>
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
      <div className="space-y-6">
        <section aria-labelledby="import-summary-heading" className="space-y-4">
          <div>
            <h2
              id="import-summary-heading"
              className="text-base font-semibold text-gray-900"
            >
              取り込み内容を確認
            </h2>
            {fileName && (
              <p className="mt-1 break-all text-xs text-gray-500">
                対象ファイル: {fileName}
              </p>
            )}
          </div>

          <div className="grid gap-px overflow-hidden border border-gray-200 bg-gray-200 sm:grid-cols-2">
            <div
              role="group"
              aria-label={`総件数: ${preview.totalCount}件${
                preview.rowErrors.length > 0
                  ? `（うち行エラー ${preview.rowErrors.length}件）`
                  : ""
              }`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">総件数</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {preview.totalCount}件
                {preview.rowErrors.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    うち行エラー {preview.rowErrors.length}件
                  </span>
                )}
              </p>
            </div>
            <div
              role="group"
              aria-label={`取り込み対象: ${preview.importableCount}件`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">取り込み対象</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {preview.importableCount}件
              </p>
            </div>
            <div
              role="group"
              aria-label={`重複スキップ予定: ${preview.duplicateCount}件`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">
                重複スキップ予定
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {preview.duplicateCount}件
              </p>
            </div>
            <div
              role="group"
              aria-label={`期間: ${formatPeriod(preview.period)}`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">期間</p>
              <p className="mt-1 font-medium text-gray-900">
                {formatPeriod(preview.period)}
              </p>
            </div>
          </div>

          <p className="border-y border-gray-200 py-3 text-sm text-gray-700">
            <span className="font-medium text-gray-900">種別内訳:</span>{" "}
            {typeLabels
              .map(({ key, label }) => `${label} ${preview.typeCounts[key]}`)
              .join(" / ")}
          </p>
        </section>

        <div className="space-y-4">
          {!canExecute && (
            <p className="border-l-4 border-gray-400 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              取り込める新しいトークがありません
            </p>
          )}

          {preview.rowErrors.length > 0 && (
            <section className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                以下の行は取り込まれません
              </h3>
              <ul className="mt-2 ml-4 list-disc text-xs text-gray-700">
                {preview.rowErrors.map((rowError, index) => (
                  <li key={index}>{rowError}</li>
                ))}
              </ul>
            </section>
          )}

          {preview.unknownSpeakers.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">
                未登録の発言者の割り当て
              </h3>
              <div className="divide-y divide-gray-200 border-y border-gray-200">
                {preview.unknownSpeakers.map((speaker) => (
                  <div
                    key={speaker}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <label
                      htmlFor={`speaker-${speaker}`}
                      className="min-w-0 flex-1 break-all text-sm font-medium text-gray-700"
                    >
                      {speaker}
                    </label>
                    <select
                      id={`speaker-${speaker}`}
                      aria-label={`${speaker}の割り当て`}
                      value={
                        speakerAssignments[speaker] ?? NEW_PARTICIPANT_VALUE
                      }
                      onChange={(event) =>
                        setSpeakerAssignments((prev) => ({
                          ...prev,
                          [speaker]: event.target.value,
                        }))
                      }
                      className="min-h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:w-auto sm:max-w-xs"
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
            </section>
          )}

          <FormError message={error} />

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPending || !canExecute}
              className="min-h-10 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "インポート中..." : "インポート実行"}
            </button>
            <button
              type="button"
              onClick={resetToSelect}
              className="min-h-10 rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              やり直す
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-gray-300 bg-gray-50 px-4 py-8 text-center shadow-sm sm:px-8 sm:py-10">
        <input
          key={fileInputKey}
          id={fileInputId}
          type="file"
          aria-label="インポートするJSONファイル"
          accept="application/json,.json"
          disabled={isPending}
          onChange={handleFileChange}
          className="peer sr-only"
        />
        <p className="text-sm font-semibold text-gray-900">
          インポートするJSONファイル
        </p>
        <p className="mt-1 text-xs text-gray-500">
          JSON形式・最大5MB・5,000件まで
        </p>
        <label
          htmlFor={fileInputId}
          className={`mt-5 inline-flex min-h-10 cursor-pointer items-center rounded bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gray-900 ${
            isPending ? "pointer-events-none opacity-50" : ""
          }`}
        >
          ファイルを選択
        </label>
        {isPending && (
          <p role="status" className="mt-3 text-xs font-medium text-gray-600">
            内容を確認しています...
          </p>
        )}
      </div>

      <FormError message={error} />
    </div>
  );
}
