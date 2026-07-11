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
  guessImageFilename,
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
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

/**
 * .eml バッチ内の差出人サマリ（#128 簡素化）
 * 参加者への割り当てには使わない（トークは常に1対1で、割り当てはトーク参加者から行う）。
 * 複数種の From アドレスが混在する場合の取り違え防止警告表示にのみ使う
 */
type EmlSenderSummary = {
  address: string;
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
 *
 * participantId: このバッチ全体を割り当てる予定の参加者 ID（#128 レビュー対応 P1）。
 * executeEmlImportAction と同じ検証（trim・空・不正 UUID → 「参加者の割り当てが不正です」）
 * を行ったうえで、選択された .eml 群に登場する全 From アドレスをこの participantId に
 * 割り当てる speakerAssignments を組み立て、buildImportPreview に渡す。
 * これにより、プレビュー時点の重複判定が実行時（executeImport の speaker 解決）と一致する
 */
export async function previewEmlImportAction(
  conversationId: string,
  formData: FormData,
  participantId: string,
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

  const trimmedParticipantId = participantId.trim();
  if (trimmedParticipantId.length === 0 || !isValidUuid(trimmedParticipantId)) {
    return { error: "参加者の割り当てが不正です" };
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

    const speakerAssignments: { [speakerName: string]: string } = {};
    for (const { message } of parsed) {
      speakerAssignments[message.senderAddress] = trimmedParticipantId;
    }

    const preview = await buildImportPreview(
      supabase,
      conversationId,
      parseResult,
      { speakerAssignments },
    );

    return {
      preview: {
        ...preview,
        rowErrors,
        senders: buildSenderSummaries(parsed),
        // #129: 実メールは添付ファイルを持たず、画像は HTML 内のリモート参照
        // （remoteImageUrl）のみを持つため、どちらか一方でもあれば画像付きとして数える
        imageCount: parsed.filter(
          ({ message }) =>
            message.image !== null || message.remoteImageUrl !== null,
        ).length,
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

/** リモート画像取得の許容タイムアウト（#129） */
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 15_000;

type FetchedRemoteImage = { blob: Blob; contentType: string };

/**
 * .eml に添付ファイルが無く、HTML 本文内のリモート画像参照（remoteImageUrl）しか
 * 持たないメッセージのために、URL から画像を取得する（#129）。
 * 以下のいずれかに該当する場合は null を返し、呼び出し元で添付失敗（attachFailedCount）
 * として扱う: fetch 自体の失敗（ネットワークエラー・タイムアウト）・レスポンスが
 * ok でない・Content-Type が image/ で始まらない・本体サイズが MAX_EML_FILE_SIZE
 * （10MB）を超える
 */
async function fetchRemoteImage(
  url: string,
): Promise<FetchedRemoteImage | null> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REMOTE_IMAGE_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return null;
  }

  const blob = await response.blob();
  if (blob.size > MAX_EML_FILE_SIZE) {
    return null;
  }

  return { blob, contentType };
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
 *
 * participantId: このバッチ全体を割り当てる参加者の ID（#128 簡素化）。
 * メールのトークは常に1対1で、インポート画面は取り込み先トークが確定しているため、
 * From アドレスごとの差出人割り当ては行わず、選択された全メッセージを1人の
 * 参加者に割り当てる。空文字・不正な UUID はエラーとする
 */
export async function executeEmlImportAction(
  conversationId: string,
  formData: FormData,
  participantId: string,
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

  const trimmedParticipantId = participantId.trim();
  if (trimmedParticipantId.length === 0 || !isValidUuid(trimmedParticipantId)) {
    return { error: "参加者の割り当てが不正です" };
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

    // 選択された .eml 群に登場する全 From アドレスを、指定された単一の
    // participantId に割り当てる（#128）
    const speakerAssignments: { [speakerName: string]: string } = {};
    for (const { message } of parsed) {
      speakerAssignments[message.senderAddress] = trimmedParticipantId;
    }

    const result = await executeImport(supabase, conversationId, {
      records,
      speakerAssignments,
    });

    let attachedCount = 0;
    let attachFailedCount = 0;

    for (const { record, id } of result.createdRecords) {
      const message = messageByRecord.get(record);
      if (!message) {
        continue;
      }

      // 添付画像がある場合は従来どおり添付データをそのまま使う（#115）。
      // 添付が無く remoteImageUrl のみを持つ場合は、実メールの構造（#129: 添付0件・
      // 画像は HTML 内のリモート参照のみ）に合わせて取得してから添付する
      if (message.image) {
        const image = message.image;
        try {
          await attachRecordMedia(supabase, {
            userId: user.id,
            recordId: id,
            // Uint8Array<ArrayBufferLike> は BlobPart（ArrayBufferView<ArrayBuffer>）と
            // 型が合わないため、確実に ArrayBuffer 裏付けの Uint8Array にコピーし直す
            file: new Blob([new Uint8Array(image.data)], {
              type: image.mimeType,
            }),
            filename: image.filename,
            contentType: image.mimeType,
          });
          attachedCount += 1;
        } catch (attachError) {
          console.error("Failed to attach eml image:", attachError);
          attachFailedCount += 1;
        }
        continue;
      }

      if (message.remoteImageUrl) {
        const remoteImageUrl = message.remoteImageUrl;
        try {
          const fetched = await fetchRemoteImage(remoteImageUrl);
          if (!fetched) {
            throw new Error(
              `Remote image fetch failed or was rejected: ${remoteImageUrl}`,
            );
          }
          await attachRecordMedia(supabase, {
            userId: user.id,
            recordId: id,
            file: fetched.blob,
            filename: guessImageFilename(fetched.contentType, 0),
            contentType: fetched.contentType,
          });
          attachedCount += 1;
        } catch (attachError) {
          console.error("Failed to attach eml remote image:", attachError);
          attachFailedCount += 1;
        }
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
