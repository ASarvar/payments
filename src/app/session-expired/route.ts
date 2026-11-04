import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/authz";
import { withBase } from "@/lib/basePath";

export async function GET() {
  if (await getCurrentUser()) redirect("/dashboard");
  await signOut({ redirectTo: withBase("/login?expired=1") });
}
