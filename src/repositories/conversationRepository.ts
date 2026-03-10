import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Conversation, IdolGroup } from "@/types/domain";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    sourceId: row.source_id,
    idolGroup: row.idol_group as IdolGroup,
    coverImagePath: row.cover_image_path,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConversations(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Conversation[]> {
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map(toConversation);
}

export async function getConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<Conversation | null> {
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toConversation(data) : null;
}

export async function createConversation(
  client: SupabaseClient<Database>,
  params: {
    userId: string;
    title: string;
    idolGroup: IdolGroup;
    sourceId?: string | null;
    coverImagePath?: string | null;
  },
): Promise<Conversation> {
  const { data, error } = await client
    .from("conversations")
    .insert({
      user_id: params.userId,
      title: params.title,
      idol_group: params.idolGroup,
      source_id: params.sourceId ?? null,
      cover_image_path: params.coverImagePath ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toConversation(data);
}

export async function createConversationWithMetadata(
  client: SupabaseClient<Database>,
  params: {
    userId: string;
    title: string;
    idolGroup: IdolGroup;
    sourceId?: string | null;
    coverImagePath?: string | null;
    activePeriods: Array<{
      startDate: string;
      endDate?: string | null;
    }>;
  },
): Promise<Conversation> {
  const { data, error } = await client
    .rpc("create_conversation_with_metadata", {
      p_user_id: params.userId,
      p_title: params.title,
      p_idol_group: params.idolGroup,
      p_source_id: params.sourceId ?? null,
      p_cover_image_path: params.coverImagePath ?? null,
      p_active_periods: params.activePeriods.map((period) => ({
        start_date: period.startDate,
        end_date: period.endDate ?? null,
      })),
    })
    .single();

  if (error) {
    throw error;
  }

  return toConversation(data);
}

export async function updateConversation(
  client: SupabaseClient<Database>,
  id: string,
  params: {
    title?: string;
    idolGroup?: IdolGroup;
    sourceId?: string | null;
    coverImagePath?: string | null;
  },
): Promise<Conversation> {
  const updateData: Database["public"]["Tables"]["conversations"]["Update"] =
    {};
  if (params.title !== undefined) {
    updateData.title = params.title;
  }
  if (params.idolGroup !== undefined) {
    updateData.idol_group = params.idolGroup;
  }
  if (params.sourceId !== undefined) {
    updateData.source_id = params.sourceId;
  }
  if (params.coverImagePath !== undefined) {
    updateData.cover_image_path = params.coverImagePath;
  }

  const { data, error } = await client
    .from("conversations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toConversation(data);
}

export async function updateConversationWithMetadata(
  client: SupabaseClient<Database>,
  id: string,
  params: {
    title?: string;
    idolGroup?: IdolGroup;
    sourceId?: string | null;
    coverImagePath?: string | null;
    activePeriods: Array<{
      startDate: string;
      endDate?: string | null;
    }>;
  },
): Promise<Conversation> {
  const { data, error } = await client
    .rpc("update_conversation_with_metadata", {
      p_conversation_id: id,
      p_title: params.title ?? null,
      p_has_title: params.title !== undefined,
      p_idol_group: params.idolGroup ?? null,
      p_has_idol_group: params.idolGroup !== undefined,
      p_source_id: params.sourceId ?? null,
      p_has_source_id: params.sourceId !== undefined,
      p_cover_image_path: params.coverImagePath ?? null,
      p_has_cover_image_path: params.coverImagePath !== undefined,
      p_active_periods: params.activePeriods.map((period) => ({
        start_date: period.startDate,
        end_date: period.endDate ?? null,
      })),
    })
    .single();

  if (error) {
    throw error;
  }

  return toConversation(data);
}

export async function deleteConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("conversations")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
