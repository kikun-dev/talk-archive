import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record as DomainRecord } from "@/types/domain";
import { getConversationParticipants } from "@/repositories/conversationParticipantRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";
import { importRecordsAtomic } from "@/repositories/importRepository";

// --- パース ---

export type TalkImportRecordType = "text" | "image" | "video" | "audio";

export type TalkImportRecord = {
  speaker: string;
  postedAt: string;
  type: TalkImportRecordType;
  title: string | null;
  content: string | null;
  hasAudio: boolean;
};

export type TalkImportParseResult = {
  records: TalkImportRecord[];
  defaultYear: number | null;
  rowErrors: string[];
};

/**
 * インポート処理のユーザー向けエラー
 * action 層はこのエラーの message をそのまま画面に返してよい
 */
export class ImportError extends Error {}

const TALK_IMPORT_RECORD_TYPES: ReadonlySet<string> = new Set([
  "text",
  "image",
  "video",
  "audio",
]);

const MAX_TITLE_LENGTH = 200;

function isTalkImportRecordType(value: unknown): value is TalkImportRecordType {
  return typeof value === "string" && TALK_IMPORT_RECORD_TYPES.has(value);
}

function isJsonObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ISO 8601 としてパース可能かつタイムゾーン指定（Z または ±HH:MM）を持つか */
function isValidPostedAtInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || Number.isNaN(Date.parse(trimmed))) {
    return false;
  }
  return /(Z|[+-]\d{2}:\d{2})$/.test(trimmed);
}

/**
 * トークインポート JSON をパースする
 * - JSON パース失敗・version 不一致・records 欠落は全体エラーとして throw ImportError する
 * - record 単位の不正は rowErrors に積み、正常な record だけ records に残す
 */
export function parseTalkImportJson(text: string): TalkImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("JSONの形式が不正です");
  }

  if (!isJsonObject(parsed)) {
    throw new ImportError("JSONの形式が不正です");
  }

  if (parsed.version !== 1) {
    throw new ImportError("対応していないバージョンです");
  }

  if (!Array.isArray(parsed.records)) {
    throw new ImportError("recordsが見つかりません");
  }

  const defaultYear =
    typeof parsed.defaultYear === "number" && Number.isInteger(parsed.defaultYear)
      ? parsed.defaultYear
      : null;

  const records: TalkImportRecord[] = [];
  const rowErrors: string[] = [];

  parsed.records.forEach((rawRecord: unknown, index: number) => {
    const rowLabel = `${index + 1}件目`;

    if (!isJsonObject(rawRecord)) {
      rowErrors.push(`${rowLabel}: レコードの形式が不正です`);
      return;
    }

    const speaker = rawRecord.speaker;
    if (typeof speaker !== "string" || speaker.trim().length === 0) {
      rowErrors.push(`${rowLabel}: 発言者を入力してください`);
      return;
    }

    const postedAt = rawRecord.postedAt;
    if (typeof postedAt !== "string" || !isValidPostedAtInput(postedAt)) {
      rowErrors.push(`${rowLabel}: 投稿日時が不正です`);
      return;
    }

    const type = rawRecord.type;
    if (!isTalkImportRecordType(type)) {
      rowErrors.push(`${rowLabel}: 種別が不正です`);
      return;
    }

    const rawContent = rawRecord.content;
    if (
      rawContent !== undefined &&
      rawContent !== null &&
      typeof rawContent !== "string"
    ) {
      rowErrors.push(`${rowLabel}: 本文の形式が不正です`);
      return;
    }
    const content =
      rawContent === undefined || rawContent === null
        ? null
        : rawContent.trim();

    if (type === "text" && (content === null || content.length === 0)) {
      rowErrors.push(`${rowLabel}: テキストを入力してください`);
      return;
    }

    const rawTitle = rawRecord.title;
    if (
      rawTitle !== undefined &&
      rawTitle !== null &&
      typeof rawTitle !== "string"
    ) {
      rowErrors.push(`${rowLabel}: タイトルの形式が不正です`);
      return;
    }
    const title =
      rawTitle === undefined || rawTitle === null ? null : rawTitle.trim();
    if (title !== null && title.length > MAX_TITLE_LENGTH) {
      rowErrors.push(`${rowLabel}: タイトルは200文字以内で入力してください`);
      return;
    }

    const rawHasAudio = rawRecord.hasAudio;
    if (rawHasAudio !== undefined && typeof rawHasAudio !== "boolean") {
      rowErrors.push(`${rowLabel}: hasAudioの形式が不正です`);
      return;
    }
    const hasAudio = rawHasAudio === undefined ? false : rawHasAudio;

    records.push({
      speaker: speaker.trim(),
      postedAt: new Date(postedAt).toISOString(),
      type,
      title,
      content,
      hasAudio,
    });
  });

  return { records, defaultYear, rowErrors };
}

// --- 重複排除キー ---

/**
 * レコードの重複排除キーを構築する
 * participantId + postedAt（ISO正規化） + recordType + content先頭20文字（trim後）
 */
export function buildRecordDedupKey(
  participantId: string,
  postedAt: string,
  recordType: string,
  content: string | null,
): string {
  const normalizedPostedAt = new Date(postedAt).toISOString();
  const normalizedContent = (content ?? "").trim().slice(0, 20);
  return `${participantId}|${normalizedPostedAt}|${recordType}|${normalizedContent}`;
}

function buildExistingDedupKeys(existingRecords: DomainRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const record of existingRecords) {
    keys.add(
      buildRecordDedupKey(
        record.speakerParticipantId,
        record.postedAt,
        record.recordType,
        record.content,
      ),
    );
  }
  return keys;
}

/**
 * items を dedup キーで分類する
 * 既存キー集合 or ここまでに出現したキーと衝突するものは重複として除外する
 * （最初に出現したものは importable として残す）
 */
function partitionByDuplicate<T>(
  items: T[],
  buildKey: (item: T) => string,
  existingKeys: Set<string>,
): { unique: T[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicateCount = 0;

  for (const item of items) {
    const key = buildKey(item);
    if (existingKeys.has(key) || seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return { unique, duplicateCount };
}

// --- プレビュー ---

export type ImportPreview = {
  totalCount: number;
  importableCount: number;
  duplicateCount: number;
  period: { start: string; end: string } | null;
  typeCounts: {
    text: number;
    image: number;
    video: number;
    audio: number;
  };
  unknownSpeakers: string[];
};

function buildPeriod(
  records: TalkImportRecord[],
): { start: string; end: string } | null {
  if (records.length === 0) {
    return null;
  }

  let start = records[0].postedAt;
  let end = records[0].postedAt;
  for (const record of records) {
    if (record.postedAt < start) {
      start = record.postedAt;
    }
    if (record.postedAt > end) {
      end = record.postedAt;
    }
  }

  return { start, end };
}

/**
 * インポート内容のプレビューを構築する
 * 既存 participants / records を取得し、重複件数・期間・種別内訳・未知 speaker を集計する
 */
export async function buildImportPreview(
  client: SupabaseClient<Database>,
  conversationId: string,
  records: TalkImportRecord[],
): Promise<ImportPreview> {
  const [participants, existingRecords] = await Promise.all([
    getConversationParticipants(client, conversationId),
    getRecordsByConversation(client, conversationId),
  ]);

  const participantIdByName = new Map(
    participants.map((participant) => [participant.name, participant.id]),
  );
  const existingKeys = buildExistingDedupKeys(existingRecords);

  const unknownSpeakers = new Set<string>();
  const typeCounts = { text: 0, image: 0, video: 0, audio: 0 };
  for (const record of records) {
    if (!participantIdByName.has(record.speaker)) {
      unknownSpeakers.add(record.speaker);
    }
    typeCounts[record.type]++;
  }

  const { duplicateCount } = partitionByDuplicate(
    records,
    (record) =>
      buildRecordDedupKey(
        participantIdByName.get(record.speaker) ?? record.speaker,
        record.postedAt,
        record.type,
        record.content,
      ),
    existingKeys,
  );

  return {
    totalCount: records.length,
    importableCount: records.length - duplicateCount,
    duplicateCount,
    period: buildPeriod(records),
    typeCounts,
    unknownSpeakers: [...unknownSpeakers],
  };
}

// --- 実行 ---

export type ExecuteImportInput = {
  records: TalkImportRecord[];
  speakerAssignments: { [speakerName: string]: string };
};

export type ImportResult = {
  createdCount: number;
  skippedCount: number;
  createdParticipants: { [name: string]: string };
};

type ResolvedSpeaker =
  | { kind: "existing"; participantId: string }
  | { kind: "new" };

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * records に登場する speaker 名をすべて解決する
 * assignments で明示された割り当て（"new" または既存 participantId）を優先し、
 * 割り当てがなければ既存 participant の完全一致名で解決する。
 * どちらでも解決できない speaker があれば ImportError を投げる
 */
function resolveSpeakers(
  records: TalkImportRecord[],
  speakerAssignments: { [speakerName: string]: string },
  participantIdByName: Map<string, string>,
): Map<string, ResolvedSpeaker> {
  const speakerNames = [...new Set(records.map((record) => record.speaker))];
  const resolved = new Map<string, ResolvedSpeaker>();

  for (const name of speakerNames) {
    const assignment = speakerAssignments[name];

    if (assignment === "new") {
      resolved.set(name, { kind: "new" });
      continue;
    }

    if (typeof assignment === "string" && assignment.length > 0) {
      if (!isValidUuid(assignment)) {
        throw new ImportError(`発言者「${name}」の割り当てが不正です`);
      }
      resolved.set(name, { kind: "existing", participantId: assignment });
      continue;
    }

    const existingId = participantIdByName.get(name);
    if (existingId) {
      resolved.set(name, { kind: "existing", participantId: existingId });
      continue;
    }

    throw new ImportError(`発言者「${name}」の割り当てを指定してください`);
  }

  return resolved;
}

/**
 * インポートを実行する
 * 1. speaker 名をすべて解決（未解決があれば ImportError）
 * 2. 実行時点の既存 records を取り直して重複（既存 + JSON 内部）を除外
 * 3. postedAt 昇順ソートのうえ、Repository 経由で import_records_atomic RPC を呼ぶ
 * 取り込み対象が 0 件なら RPC を呼ばない
 */
export async function executeImport(
  client: SupabaseClient<Database>,
  conversationId: string,
  input: ExecuteImportInput,
): Promise<ImportResult> {
  const participants = await getConversationParticipants(client, conversationId);
  const participantIdByName = new Map(
    participants.map((participant) => [participant.name, participant.id]),
  );

  const resolvedSpeakers = resolveSpeakers(
    input.records,
    input.speakerAssignments,
    participantIdByName,
  );

  const participantKeyFor = (record: TalkImportRecord): string => {
    const resolved = resolvedSpeakers.get(record.speaker);
    return resolved?.kind === "existing" ? resolved.participantId : record.speaker;
  };

  const existingRecords = await getRecordsByConversation(client, conversationId);
  const existingKeys = buildExistingDedupKeys(existingRecords);

  const { unique, duplicateCount } = partitionByDuplicate(
    input.records,
    (record) =>
      buildRecordDedupKey(
        participantKeyFor(record),
        record.postedAt,
        record.type,
        record.content,
      ),
    existingKeys,
  );

  if (unique.length === 0) {
    return { createdCount: 0, skippedCount: duplicateCount, createdParticipants: {} };
  }

  const sorted = [...unique].sort((a, b) => a.postedAt.localeCompare(b.postedAt));

  const newParticipantNames = [
    ...new Set(
      sorted
        .filter((record) => resolvedSpeakers.get(record.speaker)?.kind === "new")
        .map((record) => record.speaker),
    ),
  ];

  const result = await importRecordsAtomic(client, {
    conversationId,
    newParticipants: newParticipantNames.map((name) => ({ name })),
    records: sorted.map((record) => {
      const resolved = resolvedSpeakers.get(record.speaker);
      const isExisting = resolved?.kind === "existing";
      return {
        participantId: isExisting ? resolved.participantId : null,
        participantName: isExisting ? null : record.speaker,
        recordType: record.type,
        title: record.title,
        content: record.content,
        hasAudio: record.hasAudio,
        postedAt: record.postedAt,
      };
    }),
  });

  return {
    createdCount: result.createdRecordCount,
    skippedCount: duplicateCount,
    createdParticipants: result.createdParticipants,
  };
}
