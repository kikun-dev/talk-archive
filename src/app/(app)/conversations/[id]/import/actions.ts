"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseTalkImportJson,
  buildImportPreview,
  executeImport,
  ImportError,
  type ImportPreview,
  type ImportResult,
} from "@/usecases/importUseCases";

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

  try {
    const parseResult = parseTalkImportJson(jsonText);
    const preview = await buildImportPreview(
      supabase,
      conversationId,
      parseResult.records,
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
