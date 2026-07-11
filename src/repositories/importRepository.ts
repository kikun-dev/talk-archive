import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ImportDedupCandidate = {
  participantId: string;
  postedAt: string;
  recordType: string;
  contentPrefix: string;
};

export async function getImportDedupCandidates(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<ImportDedupCandidate[]> {
  const { data, error } = await client.rpc("get_import_dedup_candidates", {
    p_conversation_id: conversationId,
  });

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    participantId: row.participant_id,
    postedAt: row.posted_at,
    recordType: row.record_type,
    contentPrefix: row.content_prefix,
  }));
}

export type ImportRecordsAtomicRecordInput = {
  participantId: string | null;
  participantName: string | null;
  recordType: string;
  title: string | null;
  content: string | null;
  hasAudio: boolean;
  postedAt: string;
};

export type ImportRecordsAtomicParams = {
  conversationId: string;
  newParticipants: { name: string }[];
  records: ImportRecordsAtomicRecordInput[];
};

export type ImportRecordsAtomicResult = {
  createdRecordCount: number;
  skippedRecordCount: number;
  createdParticipants: { [name: string]: string };
  /** p_records 内の index（0始まり）→ 作成された record id。スキップされた index は含まない */
  createdRecordIds?: { index: number; id: string }[];
};

/**
 * import_records_atomic RPC を呼び出し、新規 participant 追加と records 一括挿入を
 * 1 トランザクションで行う（#114）
 */
export async function importRecordsAtomic(
  client: SupabaseClient<Database>,
  params: ImportRecordsAtomicParams,
): Promise<ImportRecordsAtomicResult> {
  const { data, error } = await client.rpc("import_records_atomic", {
    p_conversation_id: params.conversationId,
    p_new_participants: params.newParticipants,
    p_records: params.records.map((record) => ({
      participant_id: record.participantId,
      participant_name: record.participantName,
      record_type: record.recordType,
      title: record.title,
      content: record.content,
      has_audio: record.hasAudio,
      posted_at: record.postedAt,
    })),
  });

  if (error) {
    throw error;
  }

  const result = data as {
    created_record_count: number;
    skipped_record_count: number;
    created_participants: { [name: string]: string };
    created_record_ids?: { index: number; id: string }[];
  };

  return {
    createdRecordCount: result.created_record_count,
    skippedRecordCount: result.skipped_record_count,
    createdParticipants: result.created_participants,
    createdRecordIds: result.created_record_ids ?? [],
  };
}
