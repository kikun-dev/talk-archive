import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Source } from "@/types/domain";

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSources(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Source[]> {
  const { data, error } = await client
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(toSource);
}

export async function getSource(
  client: SupabaseClient<Database>,
  id: string,
): Promise<Source | null> {
  const { data, error } = await client
    .from("sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toSource(data) : null;
}

export async function createSource(
  client: SupabaseClient<Database>,
  params: { userId: string; name: string },
): Promise<Source> {
  const { data, error } = await client
    .from("sources")
    .insert({
      user_id: params.userId,
      name: params.name,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toSource(data);
}

export async function updateSource(
  client: SupabaseClient<Database>,
  id: string,
  params: { name: string },
): Promise<Source> {
  const { data, error } = await client
    .from("sources")
    .update({ name: params.name })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toSource(data);
}

export async function deleteSource(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("sources")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
