"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function Home() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      console.log("session", data);
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      Supabase connection test
    </div>
  );
}