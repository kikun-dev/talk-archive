import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

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
  };

  return {
    createdRecordCount: result.created_record_count,
    skippedRecordCount: result.skipped_record_count,
    createdParticipants: result.created_participants,
  };
}
