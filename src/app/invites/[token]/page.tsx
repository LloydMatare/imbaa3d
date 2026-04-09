import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { InviteAcceptPanel } from "./invite-accept-panel";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=/invites/${encodeURIComponent(token)}`);

  return <InviteAcceptPanel token={token} />;
}
