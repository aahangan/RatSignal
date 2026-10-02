import { redirect } from "next/navigation";
import { getAccount, signIn } from "@/lib/accounts";
import { unseal } from "@/lib/seal";
import type { LoginToken } from "../request/route";

export async function GET(req: Request) {
  const token = unseal<LoginToken>(new URL(req.url).searchParams.get("token"));
  if (!token || token.exp < Date.now() || !(await getAccount(token.aid))) redirect("/login?error=expired");
  await signIn(token.aid);
  redirect("/dashboard");
}
