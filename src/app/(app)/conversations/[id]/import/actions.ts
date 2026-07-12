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
  MAX_IMPORT_RECORD_COUNT,
  type ImportPreview,
  type ImportResult,
  type TalkImportParseResult,
  type TalkImportRecord,
} from "@/usecases/importUseCases";
import {
  parseEmlFile,
  expandEmlMessageToRecords,
  fetchRemoteImagesForImport,
  EmlImportError,
  MAX_EML_FILE_SIZE,
  MAX_EML_FILE_COUNT,
  MAX_EML_TOTAL_SIZE,
  type ParsedEmlMessage,
  type EmlImportUnit,
  type EmlMediaSource,
  type RemoteImageFetchTask,
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

/**
 * 各パース済みメッセージを expandEmlMessageToRecords で展開し、1つの平坦な配列にまとめる
 * （#133: 1メールから複数レコード（メイン+追加画像）を作るため）
 */
function expandParsedFilesToUnits(parsed: ParsedEmlFile[]): EmlImportUnit[] {
  return parsed.flatMap(({ message }) => expandEmlMessageToRecords(message));
}

const RECORD_COUNT_EXCEEDED_ERROR_MESSAGE =
  "一度に取り込めるのは5000件までです。メール数または画像数を減らしてください";

export type PreviewEmlImportResult =
  | {
      preview: ImportPreview & {
        rowErrors: string[];
        senders: EmlSenderSummary[];
        imageCount: number;
      };
    }
  | { error: string };

/**
 * .eml ファイル（複数）をパースし、取り込みプレビューを返す
 * JSON インポートと同じ buildImportPreview を再利用し、.eml 固有の情報
 * （差出人サマリ・画像レコード数）を追加で返す。
 * expandEmlMessageToRecords で展開した records を使うため、複数画像を持つメールは
 * その枚数分のレコードとしてカウント・プレビューされ、実行時（executeEmlImportAction）と
 * 件数・重複判定が一致する（#133）
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
    const { parsed, rowErrors } = outcome;
    const units = expandParsedFilesToUnits(parsed);

    // P1-3: 展開後のレコード件数が上限を超える場合、RPC ペイロード肥大化・Server
    // Action タイムアウトを防ぐため、プレビュー生成（buildImportPreview の呼び出し）
    // を行わずにエラーを返す
    if (units.length > MAX_IMPORT_RECORD_COUNT) {
      return { error: RECORD_COUNT_EXCEEDED_ERROR_MESSAGE };
    }

    const records: TalkImportRecord[] = units.map((unit) => unit.record);
    const parseResult: TalkImportParseResult = {
      records,
      defaultYear: null,
      rowErrors,
      // P2-1: totalCount は展開後のレコード件数（units.length）を使う。以前はファイル数
      // （outcome.totalCount）を使っていたため、複数画像を持つメールがあると
      // 「総件数」と「取り込み対象」の基準（ファイル基準 / レコード基準）が食い違い、
      // 画面表示が不整合になっていた
      totalCount: units.length,
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
        imageCount: records.filter((record) => record.type === "image").length,
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
 * formData の files を再パースし、expandEmlMessageToRecords で展開した units（#133:
 * 1メールから複数レコード（メイン+追加画像）を作りうる）を、既存の executeImport で
 * atomic に record を作成する。作成後、createdRecords（元の TalkImportRecord ↔ 作成された
 * record id の対応、#115 で追加）を使って各 record に対応するメディア（添付 or リモート
 * 画像）を attachRecordMedia で添付する。添付失敗はレコードごとに握りつぶさず
 * attachFailedCount に集計する（未添付のまま残る＝#113 の添付導線で個別に復旧可能）
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
    const units = expandParsedFilesToUnits(parsed);

    // P1-3: 展開後のレコード件数が上限を超える場合、RPC ペイロード肥大化・Server
    // Action タイムアウトを防ぐため、record 作成（executeImport）もリモート画像取得
    // （fetchRemoteImagesForImport）も行わずにエラーを返す
    if (units.length > MAX_IMPORT_RECORD_COUNT) {
      return { error: RECORD_COUNT_EXCEEDED_ERROR_MESSAGE };
    }

    const records: TalkImportRecord[] = units.map((unit) => unit.record);
    // expandEmlMessageToRecords は毎回新しい record オブジェクトを作るため、record
    // （オブジェクト参照そのもの）をキーに元のメディア添付元を引けるようにしておく。
    // executeImport は records 配列の要素をそのまま（複製せず）扱うため、
    // 戻り値の createdRecords の record も同一参照のまま返ってくる
    const mediaByRecord = new Map<TalkImportRecord, EmlMediaSource | null>();
    units.forEach((unit) => {
      mediaByRecord.set(unit.record, unit.media);
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

    // リモート画像を添付元に持つメッセージ（#129: 実メールは添付0件で画像は HTML 内の
    // リモート参照）は、UseCase 側でまとめて取得する（許可リスト検証・サイズ上限・
    // 同時実行数制限・合計サイズ上限は fetchRemoteImagesForImport の責務）。
    // 取得は record 作成後の record id をキーに引けるようにしておく
    const remoteImageTasks: RemoteImageFetchTask[] = [];
    for (const { record, id } of result.createdRecords) {
      const media = mediaByRecord.get(record);
      if (media?.kind === "remote") {
        remoteImageTasks.push({ key: id, url: media.url });
      }
    }
    const fetchedRemoteImages =
      await fetchRemoteImagesForImport(remoteImageTasks);

    for (const { record, id } of result.createdRecords) {
      const media = mediaByRecord.get(record);
      if (!media) {
        continue;
      }

      // 添付画像がある場合は従来どおり添付データをそのまま使う（#115）
      if (media.kind === "attachment") {
        try {
          await attachRecordMedia(supabase, {
            userId: user.id,
            recordId: id,
            // Uint8Array<ArrayBufferLike> は BlobPart（ArrayBufferView<ArrayBuffer>）と
            // 型が合わないため、確実に ArrayBuffer 裏付けの Uint8Array にコピーし直す
            file: new Blob([new Uint8Array(media.data)], {
              type: media.mimeType,
            }),
            filename: media.filename,
            contentType: media.mimeType,
          });
          attachedCount += 1;
        } catch (attachError) {
          console.error("Failed to attach eml image:", attachError);
          attachFailedCount += 1;
        }
        continue;
      }

      // リモート画像の場合は、事前に一括取得した結果を使う。
      // 取得失敗（許可外・サイズ超過・非画像・ネットワーク等）は添付失敗として集計し、
      // メディア未添付レコードとして残す（#113 の導線で個別に復旧可能）。
      // ログには reason（個人情報を含まない失敗理由コード）のみを出し、
      // media.url（image_name にメールを識別する情報を含む）は出力しない
      // （#132 レビュー対応 P1-3: ログへの PII 混入防止）
      const fetchResult = fetchedRemoteImages.get(id);
      if (!fetchResult || !fetchResult.ok) {
        console.error("Failed to attach eml remote image", {
          recordId: id,
          reason: fetchResult ? fetchResult.reason : "missing",
        });
        attachFailedCount += 1;
        continue;
      }
      const fetched = fetchResult.image;
      try {
        await attachRecordMedia(supabase, {
          userId: user.id,
          recordId: id,
          file: new Blob([new Uint8Array(fetched.data)], {
            type: fetched.contentType,
          }),
          filename: fetched.filename,
          contentType: fetched.contentType,
        });
        attachedCount += 1;
      } catch (attachError) {
        console.error("Failed to attach eml remote image:", attachError);
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
