"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createSupabaseServerClient();

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Failed to sign out:", error);
      return {
        error: "ログアウトに失敗しました。時間をおいて再度お試しください。",
      };
    }
  } catch (error) {
    console.error("Failed to sign out:", error);
    return {
      error: "ログアウトに失敗しました。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
