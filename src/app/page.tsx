import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homePathFor } from "@/lib/access";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect(homePathFor(session.user.role));
  redirect("/login");
}
