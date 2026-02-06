import { createClient } from "@/lib/supabase/server";

export default async function WhoAmIPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <main style={{ padding: 24 }}>
      <h1>whoami</h1>
      <pre>{JSON.stringify(data?.user ?? null, null, 2)}</pre>
    </main>
  );
}
