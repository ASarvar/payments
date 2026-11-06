import { redirect } from "next/navigation";
import { homePath, requireUserOrRedirect } from "@/lib/authz";

export default async function Home() {
  const user = await requireUserOrRedirect();
  redirect((await homePath(user)) ?? "/dashboard");
}
