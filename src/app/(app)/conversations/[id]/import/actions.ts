"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseTalkImportJson,
  buildImportPreview,
  executeImport,
  ImportError,
  MAX_IMPORT_FILE_SIZE,
  type ImportPreview,
  type ImportResult,
  type TalkImportParseResult,
  type TalkImportRecord,
} from "@/usecases/importUseCases";
import {
  parseEmlFile,
  toTalkImportRecord,
  EmlImportError,
  MAX_EML_FILE_SIZE,
  MAX_EML_FILE_COUNT,
  MAX_EML_TOTAL_SIZE,
  type ParsedEmlMessage,
} from "@/usecases/emlImportUseCases";
import { attachRecordMedia } from "@/usecases/recordUseCases";

const FILE_SIZE_ERROR_MESSAGE = "ファイルサイズは5MB以内にしてください";

function isImportFileSizeExceeded(jsonText: string): boolean {
  return new TextEncoder().encode(jsonText).byteLength > MAX_IMPORT_FILE_SIZE;
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * speakerAssignmentsJson（`{ [speakerName]: participantId | "new" }`）をパースする
 * 不正な形式（JSON パース失敗・オブジェクトでない・値が非文字列）は null を返す
 */
function parseSpeakerAssignments(
  value: string,
): { [speakerName: string]: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const assignments: { [speakerName: string]: string } = {};
  for (const [name, assignment] of Object.entries(parsed)) {
    if (typeof assignment !== "string") {
      return null;
    }
    assignments[name] = assignment;
  }

  return assignments;
}

export type PreviewTalkImportResult =
  | { preview: ImportPreview & { rowErrors: string[] } }
  | { error: string };

/**
 * トークインポート JSON をパースし、取り込みプレビュー（件数・期間・種別内訳・
 * 未知 speaker・行エラー）を返す
 */
export async function previewTalkImportAction(
  conversationId: string,
  jsonText: string,
): Promise<PreviewTalkImportResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (isImportFileSizeExceeded(jsonText)) {
    return { error: FILE_SIZE_ERROR_MESSAGE };
  }

  try {
    const parseResult = parseTalkImportJson(jsonText);
    const preview = await buildImportPreview(
      supabase,
      conversationId,
      parseResult,
    );

    return { preview: { ...preview, rowErrors: parseResult.rowErrors } };
  } catch (error) {
    if (error instanceof ImportError) {
      return { error: error.message };
    }
    console.error("Failed to preview talk import:", error);
    return {
      error:
        "インポートファイルの解析に失敗しました。時間をおいて再度お試しください。",
    };
  }
}

export type ExecuteTalkImportResult =
  | { result: ImportResult }
  | { error: string };

/**
 * トークインポートを実行する
 * jsonText はクライアントの状態を信用せず再パースする。speakerAssignmentsJson は
 * `{ [speakerName]: 既存participantId | "new" }` の JSON
 */
export async function executeTalkImportAction(
  conversationId: string,
  jsonText: string,
  speakerAssignmentsJson: string,
): Promise<ExecuteTalkImportResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (isImportFileSizeExceeded(jsonText)) {
    return { error: FILE_SIZE_ERROR_MESSAGE };
  }

  try {
    const parseResult = parseTalkImportJson(jsonText);

    const speakerAssignments = parseSpeakerAssignments(speakerAssignmentsJson);
    if (speakerAssignments === null) {
      return { error: "発言者の割り当てのデータが不正です" };
    }

    const result = await executeImport(supabase, conversationId, {
      records: parseResult.records,
      speakerAssignments,
    });

    revalidatePath(`/conversations/${conversationId}`);

    return { result };
  } catch (error) {
    if (error instanceof ImportError) {
      return { error: error.message };
    }
    console.error("Failed to execute talk import:", error);
    return {
      error: "インポートに失敗しました。時間をおいて再度お試しください。",
    };
  }
}

// --- .eml インポート（#115） ---

const NO_EML_FILES_ERROR_MESSAGE = "ファイルを選択してください";
const EML_FILE_COUNT_EXCEEDED_ERROR_MESSAGE = `一度にインポートできるのは${MAX_EML_FILE_COUNT}件までです。ファイルを分割してください`;
const EML_TOTAL_SIZE_EXCEEDED_ERROR_MESSAGE = `ファイルの合計サイズは${MAX_EML_TOTAL_SIZE / (1024 * 1024)}MB以内にしてください。ファイルを分割してください`;

function eachFileSizeErrorMessage(filename: string): string {
  return `${filename}: ファイルサイズは10MB以内にしてください`;
}

type ParsedEmlFile = { filename: string; message: ParsedEmlMessage };

type ParseEmlFilesOutcome =
  | { parsed: ParsedEmlFile[]; rowErrors: string[]; totalCount: number }
  | { error: string };

/**
 * formData の `files`（複数）を取得し、件数・ファイルサイズ上限を検証したうえで
 * 各ファイルを parseEmlFile でパースする。
 * ファイル件数が 0 件、または MAX_EML_FILE_COUNT を超える場合は全体エラーを返す。
 * 個々のファイルのサイズ超過・EmlImportError（パース不能等）は rowErrors に積み、
 * そのファイルだけを除外して他のファイルの処理を続ける
 */
async function parseEmlFilesFromFormData(
  formData: FormData,
): Promise<ParseEmlFilesOutcome> {
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return { error: NO_EML_FILES_ERROR_MESSAGE };
  }
  if (files.length > MAX_EML_FILE_COUNT) {
    return { error: EML_FILE_COUNT_EXCEEDED_ERROR_MESSAGE };
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_EML_TOTAL_SIZE) {
    return { error: EML_TOTAL_SIZE_EXCEEDED_ERROR_MESSAGE };
  }

  const parsed: ParsedEmlFile[] = [];
  const rowErrors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_EML_FILE_SIZE) {
      rowErrors.push(eachFileSizeErrorMessage(file.name));
      continue;
    }

    const buffer = await file.arrayBuffer();
    try {
      const message = await parseEmlFile(buffer, file.name);
      parsed.push({ filename: file.name, message });
    } catch (error) {
      if (error instanceof EmlImportError) {
        rowErrors.push(error.message);
        continue;
      }
      throw error;
    }
  }

  return { parsed, rowErrors, totalCount: files.length };
}

type EmlSenderSummary = {
  address: string;
  nameSuggestion: string;
  messageCount: number;
};

function buildSenderSummaries(parsed: ParsedEmlFile[]): EmlSenderSummary[] {
  const summaries = new Map<string, EmlSenderSummary>();
  for (const { message } of parsed) {
    const existing = summaries.get(message.senderAddress);
    if (existing) {
      existing.messageCount += 1;
      continue;
    }
    summaries.set(message.senderAddress, {
      address: message.senderAddress,
      nameSuggestion: message.senderNameSuggestion,
      messageCount: 1,
    });
  }
  return [...summaries.values()];
}

function buildExtraImageWarnings(parsed: ParsedEmlFile[]): string[] {
  return parsed
    .filter(({ message }) => message.extraImageCount > 0)
    .map(
      ({ filename, message }) =>
        `${filename}: 2枚目以降の画像 ${message.extraImageCount}枚は取り込まれません`,
    );
}

export type PreviewEmlImportResult =
  | {
      preview: ImportPreview & {
        rowErrors: string[];
        senders: EmlSenderSummary[];
        imageCount: number;
        extraImageWarnings: string[];
      };
    }
  | { error: string };

/**
 * .eml ファイル（複数）をパースし、取り込みプレビューを返す
 * JSON インポートと同じ buildImportPreview を再利用し、.eml 固有の情報
 * （差出人サマリ・画像付きメール数・2枚目以降の画像警告）を追加で返す
 */
export async function previewEmlImportAction(
  conversationId: string,
  formData: FormData,
): Promise<PreviewEmlImportResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await parseEmlFilesFromFormData(formData);
  if ("error" in outcome) {
    return outcome;
  }

  try {
    const { parsed, rowErrors, totalCount } = outcome;
    const records: TalkImportRecord[] = parsed.map(({ message }) =>
      toTalkImportRecord(message),
    );
    const parseResult: TalkImportParseResult = {
      records,
      defaultYear: null,
      rowErrors,
      totalCount,
    };

    const preview = await buildImportPreview(
      supabase,
      conversationId,
      parseResult,
    );

    return {
      preview: {
        ...preview,
        rowErrors,
        senders: buildSenderSummaries(parsed),
        imageCount: parsed.filter(({ message }) => message.image !== null)
          .length,
        extraImageWarnings: buildExtraImageWarnings(parsed),
      },
    };
  } catch (error) {
    if (error instanceof ImportError || error instanceof EmlImportError) {
      return { error: error.message };
    }
    console.error("Failed to preview eml import:", error);
    return {
      error:
        "メールファイルの解析に失敗しました。時間をおいて再度お試しください。",
    };
  }
}

export type ExecuteEmlImportResult =
  | {
      result: ImportResult & {
        attachedCount: number;
        attachFailedCount: number;
      };
    }
  | { error: string };

/**
 * .eml インポートを実行する
 * formData の files を再パースし、既存の executeImport で atomic に record を作成した後、
 * createdRecords（元の TalkImportRecord ↔ 作成された record id の対応、#115 で追加）を使って
 * 画像を持つ元メッセージに対応する record へ attachRecordMedia で画像を添付する。
 * 添付失敗はメールごとに握りつぶさず attachFailedCount に集計する
 * （未添付のまま残る＝#113 の添付導線で個別に復旧可能）
 */
export async function executeEmlImportAction(
  conversationId: string,
  formData: FormData,
  speakerAssignmentsJson: string,
): Promise<ExecuteEmlImportResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await parseEmlFilesFromFormData(formData);
  if ("error" in outcome) {
    return outcome;
  }

  const speakerAssignments = parseSpeakerAssignments(speakerAssignmentsJson);
  if (speakerAssignments === null) {
    return { error: "発言者の割り当てのデータが不正です" };
  }

  try {
    const { parsed } = outcome;
    const records: TalkImportRecord[] = parsed.map(({ message }) =>
      toTalkImportRecord(message),
    );
    // toTalkImportRecord は毎回新しいオブジェクトを作るため、record（オブジェクト
    // 参照そのもの）をキーに元の ParsedEmlMessage を引けるようにしておく。
    // executeImport は records 配列の要素をそのまま（複製せず）扱うため、
    // 戻り値の createdRecords の record も同一参照のまま返ってくる
    const messageByRecord = new Map<TalkImportRecord, ParsedEmlMessage>();
    records.forEach((record, index) => {
      messageByRecord.set(record, parsed[index].message);
    });

    // 新規参加者作成時、speaker（From アドレス）の代わりに local part 由来の
    // 表示名候補（senderNameSuggestion）を使う（#128）
    const newParticipantNameBySpeaker: { [speakerName: string]: string } = {};
    for (const { message } of parsed) {
      newParticipantNameBySpeaker[message.senderAddress] =
        message.senderNameSuggestion;
    }

    const result = await executeImport(supabase, conversationId, {
      records,
      speakerAssignments,
      newParticipantNameBySpeaker,
    });

    let attachedCount = 0;
    let attachFailedCount = 0;

    for (const { record, id } of result.createdRecords) {
      const message = messageByRecord.get(record);
      const image = message?.image;
      if (!image) {
        continue;
      }

      try {
        await attachRecordMedia(supabase, {
          userId: user.id,
          recordId: id,
          // Uint8Array<ArrayBufferLike> は BlobPart（ArrayBufferView<ArrayBuffer>）と
          // 型が合わないため、確実に ArrayBuffer 裏付けの Uint8Array にコピーし直す
          file: new Blob([new Uint8Array(image.data)], { type: image.mimeType }),
          filename: image.filename,
          contentType: image.mimeType,
        });
        attachedCount += 1;
      } catch (attachError) {
        console.error("Failed to attach eml image:", attachError);
        attachFailedCount += 1;
      }
    }

    revalidatePath(`/conversations/${conversationId}`);

    return {
      result: { ...result, attachedCount, attachFailedCount },
    };
  } catch (error) {
    if (error instanceof ImportError || error instanceof EmlImportError) {
      return { error: error.message };
    }
    console.error("Failed to execute eml import:", error);
    return {
      error: "インポートに失敗しました。時間をおいて再度お試しください。",
    };
  }
}
