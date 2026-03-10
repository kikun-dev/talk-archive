import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={user?.email ?? ""} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
