import { redirect } from "next/navigation";
import { signIn } from "@/lib/accounts";
import { accountFromCheckout } from "@/lib/signup";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("session_id");
  const account = id ? await accountFromCheckout(id) : null;
  if (!account) redirect("/signup?error=checkout");
  await signIn(account.id);
  redirect("/dashboard?welcome=1");
}
