import { signOut } from "@/lib/accounts";

export async function POST() {
  await signOut();
  return Response.json({ ok: true });
}
