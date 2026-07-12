import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/lib/validationConstraints";
import { getConversationParticipants } from "@/repositories/conversationParticipantRepository";
import {
  getImportDedupCandidates,
  importRecordsAtomic,
  type ImportDedupCandidate,
} from "@/repositories/importRepository";

// --- パース ---

export type TalkImportRecordType = "text" | "image" | "video" | "audio";

export type TalkImportRecord = {
  speaker: string;
  postedAt: string;
  type: TalkImportRecordType;
  title: string | null;
  content: string | null;
  hasAudio: boolean;
  /**
   * .eml インポート由来レコードの安定な重複排除キー（"<元ファイル名>#<連番>"）。
   * JSON インポート由来のレコードは常に null（従来どおり本文プレフィックスベースで
   * 重複判定する、#133）
   */
  importKey: string | null;
};

export type TalkImportParseResult = {
  records: TalkImportRecord[];
  defaultYear: number | null;
  rowErrors: string[];
  /** 入力全体の件数（行エラーで除外されたレコードも含む、#124） */
  totalCount: number;
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

/** インポートファイルの最大サイズ（5MB、#124） */
export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

/** 一度にインポートできる最大レコード件数（#124） */
export const MAX_IMPORT_RECORD_COUNT = 5000;

function isTalkImportRecordType(value: unknown): value is TalkImportRecordType {
  return typeof value === "string" && TALK_IMPORT_RECORD_TYPES.has(value);
}

function isJsonObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * PostgreSQL の jsonb/text カラムは U+0000（NUL）を保存できず、
 * import_records_atomic RPC でバッチ全体が失敗するため、DB へ渡る文字列は
 * 入力境界でこの検証を通す（#128）
 */
function containsNulCharacter(value: string): boolean {
  return value.includes("\0");
}

/**
 * ISO 8601 の厳格な形式（YYYY-MM-DDTHH:MM[:SS[.SSS]](Z|±HH:MM)）にのみ一致する。
 * スペース区切りや英語月名などは拒否する（#124）
 */
// tsconfig の target（ES2017）では名前付きキャプチャグループ（ES2018〜）が使えないため、
// 位置ベースのキャプチャグループを使う
// 1:year 2:month 3:day 4:hour 5:minute 6:second 7:offsetHour 8:offsetMinute
const POSTED_AT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH: readonly number[] = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

/** ISO 8601 の厳格な形式かつ成分（月日・時分秒・offset）が実在する値かを検証する */
function isValidPostedAtInput(value: string): boolean {
  const trimmed = value.trim();

  const match = POSTED_AT_PATTERN.exec(trimmed);
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    match;

  const yearNum = Number(year);
  const monthNum = Number(month);
  const dayNum = Number(day);
  const hourNum = Number(hour);
  const minuteNum = Number(minute);
  const secondNum = second === undefined ? 0 : Number(second);

  if (monthNum < 1 || monthNum > 12) {
    return false;
  }
  if (dayNum < 1 || dayNum > daysInMonth(yearNum, monthNum)) {
    return false;
  }
  if (hourNum > 23) {
    return false;
  }
  if (minuteNum > 59 || secondNum > 59) {
    return false;
  }

  if (offsetHour !== undefined) {
    if (Number(offsetHour) > 14 || Number(offsetMinute) > 59) {
      return false;
    }
  }

  return true;
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

  if (parsed.records.length > MAX_IMPORT_RECORD_COUNT) {
    throw new ImportError(
      "一度に取り込めるのは5000件までです。ファイルを分割してください",
    );
  }

  const totalCount = parsed.records.length;

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
    if (typeof speaker !== "string") {
      rowErrors.push(`${rowLabel}: 発言者を入力してください`);
      return;
    }
    const trimmedSpeaker = speaker.trim();
    if (trimmedSpeaker.length === 0) {
      rowErrors.push(`${rowLabel}: 発言者を入力してください`);
      return;
    }
    // 未知 speaker は UI 既定値 "new" で p_new_participants[].name / participant_name に
    // 入るため、content / title と同様に NUL 混入を行エラーとして検知する
    // （#128 第4ラウンドレビュー対応 P1）
    if (containsNulCharacter(trimmedSpeaker)) {
      rowErrors.push(
        `${rowLabel}: 発言者名に使用できない文字（U+0000）が含まれています`,
      );
      return;
    }
    if (trimmedSpeaker.length > MAX_PARTICIPANT_NAME_LENGTH) {
      rowErrors.push(`${rowLabel}: 発言者は100文字以内で入力してください`);
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

    // JSON は talk-extract スキルの機械生成であり、混入は入力側の異常のため、
    // 黙って除去せず行エラーとして表面化させる（#128 第3ラウンドレビュー対応 P1）
    if (content !== null && containsNulCharacter(content)) {
      rowErrors.push(
        `${rowLabel}: 本文に使用できない文字（U+0000）が含まれています`,
      );
      return;
    }

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
    if (title !== null && containsNulCharacter(title)) {
      rowErrors.push(
        `${rowLabel}: タイトルに使用できない文字（U+0000）が含まれています`,
      );
      return;
    }
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
      speaker: trimmedSpeaker,
      postedAt: new Date(postedAt).toISOString(),
      type,
      title,
      content,
      hasAudio,
      importKey: null,
    });
  });

  return { records, defaultYear, rowErrors, totalCount };
}

// --- 重複排除キー ---

/**
 * レコードの重複排除キーを構築する
 * importKey が非null文字列の場合は、それを名前空間化したキー（`key:${importKey}`）を返す
 * （participant/postedAt/type/content には依存しない）。1メールから複数レコード
 * （メイン+追加画像）を作る .eml インポートでは、これらの組み合わせだけでは
 * 区別できないケースがあるため（#133）。
 * importKey が null または未指定の場合は、従来どおり
 * participantId + postedAt（ISO正規化） + recordType + content先頭20文字（trim後）を使う
 */
export function buildRecordDedupKey(
  participantId: string,
  postedAt: string,
  recordType: string,
  content: string | null,
  importKey?: string | null,
): string {
  if (typeof importKey === "string") {
    return `key:${importKey}`;
  }
  const normalizedPostedAt = new Date(postedAt).toISOString();
  const normalizedContent = (content ?? "").trim().slice(0, 20);
  return `${participantId}|${normalizedPostedAt}|${recordType}|${normalizedContent}`;
}

/**
 * 既存レコードの重複判定キー集合を構築する
 * record.importKey を buildRecordDedupKey の5番目の引数として渡すことで、import_key を
 * 持つ既存レコード（.eml インポート由来）は `key:${importKey}` 形式のキーになる。これは
 * import_records_atomic RPC が import_key の一致のみで重複判定するのと同じ契約であり、
 * プレビューの重複件数と RPC の実際のスキップ件数を一致させる（#133 / P1-1）
 */
function buildExistingDedupKeys(
  existingRecords: ImportDedupCandidate[],
): Set<string> {
  const keys = new Set<string>();
  for (const record of existingRecords) {
    keys.add(
      buildRecordDedupKey(
        record.participantId,
        record.postedAt,
        record.recordType,
        record.contentPrefix,
        record.importKey,
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

export type BuildImportPreviewOptions = {
  /**
   * speaker 名（.eml では From アドレス） → participantId の明示割り当て。
   * 指定された speaker は「新規参加者として追加」ではなく既存 participant への
   * 割り当てとして重複判定キーを組み立てる（実行時 executeImport の解決と一致させるため、#128）
   */
  speakerAssignments?: { [speakerName: string]: string };
};

/**
 * インポート内容のプレビューを構築する
 * 既存 participants / records を取得し、重複件数・期間・種別内訳・未知 speaker を集計する
 * totalCount は parseResult.totalCount（行エラーで除外されたレコードを含む入力全体の件数）を使う。
 * importableCount / duplicateCount は正常にパースできた records のみを対象に算出する（#124）
 *
 * options.speakerAssignments が指定された場合、重複判定キーの participant 部分は
 * 「assignments の participantId → 名前完全一致 → speaker そのまま」の順で解決する。
 * これは実行時（executeImport の resolveSpeakers）と同じ解決順であり、.eml インポートの
 * ように speaker に From アドレスが入る場合でもプレビューと実行の重複判定を一致させる（#128）
 */
export async function buildImportPreview(
  client: SupabaseClient<Database>,
  conversationId: string,
  parseResult: TalkImportParseResult,
  options?: BuildImportPreviewOptions,
): Promise<ImportPreview> {
  const { records, totalCount } = parseResult;
  const speakerAssignments = options?.speakerAssignments ?? {};

  const [participants, existingRecords] = await Promise.all([
    getConversationParticipants(client, conversationId),
    getImportDedupCandidates(client, conversationId),
  ]);

  const participantIdByName = new Map(
    participants.map((participant) => [participant.name, participant.id]),
  );
  const validParticipantIds = new Set(
    participants.map((participant) => participant.id),
  );
  const existingKeys = buildExistingDedupKeys(existingRecords);

  const resolveParticipantKey = (speaker: string): string => {
    const assignment = speakerAssignments[speaker];

    if (assignment === "new") {
      return speaker;
    }

    if (typeof assignment === "string" && assignment.length > 0) {
      if (!isValidUuid(assignment) || !validParticipantIds.has(assignment)) {
        throw new ImportError(`発言者「${speaker}」の割り当てが不正です`);
      }
      return assignment;
    }

    return participantIdByName.get(speaker) ?? speaker;
  };

  const unknownSpeakers = new Set<string>();
  const typeCounts = { text: 0, image: 0, video: 0, audio: 0 };
  const participantKeyBySpeaker = new Map<string, string>();
  for (const record of records) {
    if (!participantKeyBySpeaker.has(record.speaker)) {
      participantKeyBySpeaker.set(
        record.speaker,
        resolveParticipantKey(record.speaker),
      );
    }

    const hasAssignment = Object.prototype.hasOwnProperty.call(
      speakerAssignments,
      record.speaker,
    );
    if (!hasAssignment && !participantIdByName.has(record.speaker)) {
      unknownSpeakers.add(record.speaker);
    }
    typeCounts[record.type]++;
  }

  const { duplicateCount } = partitionByDuplicate(
    records,
    (record) =>
      buildRecordDedupKey(
        participantKeyBySpeaker.get(record.speaker) ?? record.speaker,
        record.postedAt,
        record.type,
        record.content,
        record.importKey,
      ),
    existingKeys,
  );

  return {
    totalCount,
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
  /**
   * 実際に作成された record と、その元になった入力 TalkImportRecord の対応。
   * RPC の created_record_ids（p_records内index → id）を、RPC呼び出し時に渡した
   * sorted 配列（= p_records と同じ順序）へ引き当てて構築する（#115: eml インポートの画像添付で使用）
   */
  createdRecords: { record: TalkImportRecord; id: string }[];
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
 *
 * 明示割り当てが UUID 形式であっても、validParticipantIds（このトークの参加者集合）に
 * 含まれなければ不正として弾く。別トークの participantId・存在しない participantId を
 * 誤って（あるいは悪意を持って）渡された場合に、RPC 呼び出し前の入力境界で検証する（#128）
 */
function resolveSpeakers(
  records: TalkImportRecord[],
  speakerAssignments: { [speakerName: string]: string },
  participantIdByName: Map<string, string>,
  validParticipantIds: Set<string>,
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
      if (!isValidUuid(assignment) || !validParticipantIds.has(assignment)) {
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
 * 1. speaker 名をすべて解決（未解決があれば ImportError。既存 participants の
 *    取得はこの検証のためだけに必要）
 * 2. JSON 内部の重複のみをここで除外する（ペイロード削減・決定的なため）。
 *    既存 records との重複判定・participant 解決の権威は RPC 側（会話行ロック内）に
 *    ある（並行実行時の重複作成を避けるため、#124）
 * 3. postedAt 昇順ソートのうえ、Repository 経由で import_records_atomic RPC を呼ぶ
 * 取り込み対象が 0 件（JSON 内部重複除外後）なら RPC を呼ばない
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
  const validParticipantIds = new Set(
    participants.map((participant) => participant.id),
  );

  const resolvedSpeakers = resolveSpeakers(
    input.records,
    input.speakerAssignments,
    participantIdByName,
    validParticipantIds,
  );

  const participantKeyFor = (record: TalkImportRecord): string => {
    const resolved = resolvedSpeakers.get(record.speaker);
    return resolved?.kind === "existing" ? resolved.participantId : record.speaker;
  };

  const { unique, duplicateCount: jsonDuplicateCount } = partitionByDuplicate(
    input.records,
    (record) =>
      buildRecordDedupKey(
        participantKeyFor(record),
        record.postedAt,
        record.type,
        record.content,
        record.importKey,
      ),
    new Set<string>(),
  );

  if (unique.length === 0) {
    return {
      createdCount: 0,
      skippedCount: jsonDuplicateCount,
      createdParticipants: {},
      createdRecords: [],
    };
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
        importKey: record.importKey,
      };
    }),
  });

  const createdRecords = (result.createdRecordIds ?? []).map(({ index, id }) => ({
    record: sorted[index],
    id,
  }));

  return {
    createdCount: result.createdRecordCount,
    skippedCount: jsonDuplicateCount + result.skippedRecordCount,
    createdParticipants: result.createdParticipants,
    createdRecords,
  };
}
