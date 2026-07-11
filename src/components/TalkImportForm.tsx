"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import {
  previewTalkImportAction,
  executeTalkImportAction,
  previewEmlImportAction,
  executeEmlImportAction,
  type PreviewEmlImportResult,
  type ExecuteEmlImportResult,
} from "@/app/(app)/conversations/[id]/import/actions";
import { FormError } from "@/components/FormError";
import { formatDateTimeJst } from "@/lib/dateTime";
import type { ConversationParticipant } from "@/types/domain";
import {
  MAX_IMPORT_FILE_SIZE,
  type ImportPreview,
  type ImportResult,
} from "@/usecases/importUseCases";
import {
  MAX_EML_FILE_SIZE,
  MAX_EML_FILE_COUNT,
  MAX_EML_TOTAL_SIZE,
} from "@/usecases/emlImportUseCases";

type TalkImportFormProps = {
  conversationId: string;
  participants: ConversationParticipant[];
};

type Mode = "json" | "eml";
type Stage = "select" | "preview" | "result";

const NEW_PARTICIPANT_VALUE = "new";

type EmlPreview = Extract<
  PreviewEmlImportResult,
  { preview: unknown }
>["preview"];
type EmlExecutionResult = Extract<
  ExecuteEmlImportResult,
  { result: unknown }
>["result"];

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

// actions 側（.eml インポート、parseEmlFilesFromFormData）のエラー文言と揃える（#115）
function emlFileCountExceededErrorMessage(): string {
  return `一度にインポートできるのは${MAX_EML_FILE_COUNT}件までです。ファイルを分割してください`;
}

function emlFileSizeExceededErrorMessage(filename: string): string {
  return `${filename}: ファイルサイズは10MB以内にしてください`;
}

function emlTotalSizeExceededErrorMessage(): string {
  return `ファイルの合計サイズは${MAX_EML_TOTAL_SIZE / (1024 * 1024)}MB以内にしてください。ファイルを分割してください`;
}

export function TalkImportForm({
  conversationId,
  participants,
}: TalkImportFormProps) {
  const fileInputId = useId();
  const emlFileInputId = useId();
  const emlParticipantSelectId = useId();
  const [mode, setMode] = useState<Mode>("json");
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
  const [emlFiles, setEmlFiles] = useState<File[] | null>(null);
  const [emlPreview, setEmlPreview] = useState<EmlPreview | null>(null);
  // .eml インポートの割り当て先参加者（#128）。メールのトークは常に1対1で、
  // インポート画面は取り込み先トークが確定しているため、選択されたバッチ全体を
  // 単一の参加者に割り当てる。既定値は先頭の参加者
  const [emlParticipantId, setEmlParticipantId] = useState<string>(
    participants[0]?.id ?? "",
  );
  const [emlResult, setEmlResult] = useState<EmlExecutionResult | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  function resetToSelect() {
    setStage("select");
    setError(undefined);
    setJsonText(null);
    setFileName(null);
    setPreview(null);
    setSpeakerAssignments({});
    setResult(null);
    setEmlFiles(null);
    setEmlPreview(null);
    setEmlParticipantId(participants[0]?.id ?? "");
    setEmlResult(null);
    setFileInputKey((key) => key + 1);
  }

  function handleModeChange(newMode: Mode) {
    if (newMode === mode) {
      return;
    }
    resetToSelect();
    setMode(newMode);
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

  async function handleEmlFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }
    if (participants.length === 0) {
      return;
    }
    const files = Array.from(fileList);

    setError(undefined);

    if (files.length > MAX_EML_FILE_COUNT) {
      setError(emlFileCountExceededErrorMessage());
      setFileInputKey((key) => key + 1);
      return;
    }

    const oversizedFile = files.find((file) => file.size > MAX_EML_FILE_SIZE);
    if (oversizedFile) {
      setError(emlFileSizeExceededErrorMessage(oversizedFile.name));
      setFileInputKey((key) => key + 1);
      return;
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_EML_TOTAL_SIZE) {
      setError(emlTotalSizeExceededErrorMessage());
      setFileInputKey((key) => key + 1);
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await previewEmlImportAction(
        conversationId,
        formData,
        emlParticipantId,
      );
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setEmlFiles(files);
      setEmlPreview(response.preview);
      setStage("preview");
    });
  }

  function handleEmlExecute() {
    if (emlFiles === null) {
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      for (const file of emlFiles) {
        formData.append("files", file);
      }

      const response = await executeEmlImportAction(
        conversationId,
        formData,
        emlParticipantId,
      );
      if ("error" in response) {
        setError(response.error);
        return;
      }

      setEmlResult(response.result);
      setStage("result");
    });
  }

  if (stage === "result" && mode === "json" && result) {
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

  if (stage === "result" && mode === "eml" && emlResult) {
    const createdParticipantNames = Object.keys(emlResult.createdParticipants);

    return (
      <div className="space-y-6">
        <section className="border-l-4 border-green-600 bg-green-50 px-4 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">
            インポートが完了しました
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-gray-700">
            <p
              role="group"
              aria-label={`作成件数: ${emlResult.createdCount}件`}
            >
              作成件数
              <strong className="mt-1 block text-xl text-gray-900">
                {emlResult.createdCount}件
              </strong>
            </p>
            <p
              role="group"
              aria-label={`スキップ件数: ${emlResult.skippedCount}件`}
            >
              スキップ件数
              <strong className="mt-1 block text-xl text-gray-900">
                {emlResult.skippedCount}件
              </strong>
            </p>
          </div>
          {createdParticipantNames.length > 0 && (
            <p className="mt-4 border-t border-green-200 pt-4 text-sm text-gray-700">
              新規追加された参加者: {createdParticipantNames.join("、")}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-green-200 pt-4 text-sm text-gray-700">
            <p
              role="group"
              aria-label={`画像添付成功: ${emlResult.attachedCount}件`}
            >
              画像添付成功
              <strong className="mt-1 block text-xl text-gray-900">
                {emlResult.attachedCount}件
              </strong>
            </p>
            <p
              role="group"
              aria-label={`画像添付失敗: ${emlResult.attachFailedCount}件`}
            >
              画像添付失敗
              <strong className="mt-1 block text-xl text-gray-900">
                {emlResult.attachFailedCount}件
              </strong>
            </p>
          </div>
          {emlResult.attachFailedCount > 0 && (
            <p className="mt-4 border-t border-green-200 pt-4 text-sm text-amber-700">
              未添付のまま取り込まれたため、タイムラインの未添付バッジから添付できます
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

  if (stage === "preview" && mode === "json" && preview) {
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

  if (stage === "preview" && mode === "eml" && emlPreview) {
    const canExecute = emlPreview.importableCount > 0;

    return (
      <div className="space-y-6">
        <section
          aria-labelledby="eml-import-summary-heading"
          className="space-y-4"
        >
          <div>
            <h2
              id="eml-import-summary-heading"
              className="text-base font-semibold text-gray-900"
            >
              取り込み内容を確認
            </h2>
            {emlFiles && (
              <p className="mt-1 text-xs text-gray-500">
                対象ファイル: {emlFiles.length}件
              </p>
            )}
          </div>

          <div className="grid gap-px overflow-hidden border border-gray-200 bg-gray-200 sm:grid-cols-2">
            <div
              role="group"
              aria-label={`総件数: ${emlPreview.totalCount}件${
                emlPreview.rowErrors.length > 0
                  ? `（うち行エラー ${emlPreview.rowErrors.length}件）`
                  : ""
              }`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">総件数</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {emlPreview.totalCount}件
                {emlPreview.rowErrors.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    うち行エラー {emlPreview.rowErrors.length}件
                  </span>
                )}
              </p>
            </div>
            <div
              role="group"
              aria-label={`取り込み対象: ${emlPreview.importableCount}件`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">取り込み対象</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {emlPreview.importableCount}件
              </p>
            </div>
            <div
              role="group"
              aria-label={`重複スキップ予定: ${emlPreview.duplicateCount}件`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">
                重複スキップ予定
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {emlPreview.duplicateCount}件
              </p>
            </div>
            <div
              role="group"
              aria-label={`期間: ${formatPeriod(emlPreview.period)}`}
              className="bg-white p-4 text-sm text-gray-700"
            >
              <p className="text-xs font-medium text-gray-500">期間</p>
              <p className="mt-1 font-medium text-gray-900">
                {formatPeriod(emlPreview.period)}
              </p>
            </div>
          </div>

          <p className="border-y border-gray-200 py-3 text-sm text-gray-700">
            <span className="font-medium text-gray-900">種別内訳:</span>{" "}
            {typeLabels
              .map(({ key, label }) => `${label} ${emlPreview.typeCounts[key]}`)
              .join(" / ")}
          </p>

          <p
            role="group"
            aria-label={`画像付きメール数: ${emlPreview.imageCount}件`}
            className="border-b border-gray-200 pb-3 text-sm text-gray-700"
          >
            <span className="font-medium text-gray-900">画像付きメール数:</span>{" "}
            {emlPreview.imageCount}件
          </p>
        </section>

        <div className="space-y-4">
          {!canExecute && (
            <p className="border-l-4 border-gray-400 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              取り込める新しいトークがありません
            </p>
          )}

          {emlPreview.rowErrors.length > 0 && (
            <section className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                以下のメールは取り込まれません
              </h3>
              <ul className="mt-2 ml-4 list-disc text-xs text-gray-700">
                {emlPreview.rowErrors.map((rowError, index) => (
                  <li key={index}>{rowError}</li>
                ))}
              </ul>
            </section>
          )}

          {emlPreview.extraImageWarnings.length > 0 && (
            <section className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                2枚目以降の画像は取り込まれません
              </h3>
              <ul className="mt-2 ml-4 list-disc text-xs text-gray-700">
                {emlPreview.extraImageWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          {emlPreview.senders.length >= 2 && (
            <section className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
              <p className="text-sm text-gray-900">
                複数の差出人アドレスが含まれています:{" "}
                {emlPreview.senders
                  .map(
                    (sender) => `${sender.address}（${sender.messageCount}件）`,
                  )
                  .join("、")}
                。別の人のメールが混ざっていないか確認してください
              </p>
            </section>
          )}

          <section className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">割り当て先:</span>{" "}
              {participants.find((participant) => participant.id === emlParticipantId)
                ?.name ?? ""}
            </p>
          </section>

          <FormError message={error} />

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleEmlExecute}
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
      <div
        data-testid="import-mode-tabs"
        className="flex border-b border-gray-200"
      >
        <button
          type="button"
          aria-pressed={mode === "json"}
          onClick={() => handleModeChange("json")}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            mode === "json"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          JSON
        </button>
        <button
          type="button"
          aria-pressed={mode === "eml"}
          onClick={() => handleModeChange("eml")}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            mode === "eml"
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          メール（.eml）
        </button>
      </div>

      {mode === "json" ? (
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
      ) : participants.length === 0 ? (
        <div className="border border-gray-300 bg-gray-50 px-4 py-8 text-center shadow-sm sm:px-8 sm:py-10">
          <p className="text-sm font-semibold text-gray-900">
            インポートする.emlファイル
          </p>
          <div className="mt-4">
            <FormError message="このトークにはまだ参加者がいません。先に参加者を追加してください" />
          </div>
        </div>
      ) : (
        <div className="border border-gray-300 bg-gray-50 px-4 py-8 text-center shadow-sm sm:px-8 sm:py-10">
          <input
            key={fileInputKey}
            id={emlFileInputId}
            type="file"
            aria-label="インポートする.emlファイル"
            accept=".eml,message/rfc822"
            multiple
            disabled={isPending}
            onChange={handleEmlFileChange}
            className="peer sr-only"
          />
          <p className="text-sm font-semibold text-gray-900">
            インポートする.emlファイル
          </p>
          <p className="mt-1 text-xs text-gray-500">
            eml形式・複数選択可・1通10MBまで・最大200通まで・合計50MBまで
          </p>

          <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            {participants.length === 1 ? (
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">割り当て先:</span>{" "}
                {participants[0].name}
              </p>
            ) : (
              <>
                <label
                  htmlFor={emlParticipantSelectId}
                  className="text-sm font-medium text-gray-700"
                >
                  割り当て先
                </label>
                <select
                  id={emlParticipantSelectId}
                  aria-label="割り当て先"
                  value={emlParticipantId}
                  onChange={(event) => setEmlParticipantId(event.target.value)}
                  disabled={isPending}
                  className="min-h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:w-auto sm:max-w-xs"
                >
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <label
            htmlFor={emlFileInputId}
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
      )}

      <FormError message={error} />
    </div>
  );
}
