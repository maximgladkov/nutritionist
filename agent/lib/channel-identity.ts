import { consumeLinkCode, createLinkCode, resolveChannelUser } from "../../lib/identity";
import { parseLinkCommand } from "../../lib/link-command";
import { appPrincipal } from "../../lib/principal";

export async function handleChannelLink(input: {
  provider: "telegram" | "whatsapp";
  providerUserId: string;
  name?: string;
  text: string;
}): Promise<string | null> {
  const command = parseLinkCommand(input.text);
  if (!command) {
    return null;
  }
  const user = await resolveChannelUser({
    provider: input.provider,
    providerUserId: input.providerUserId,
    name: input.name,
  });
  if (command.kind === "generate") {
    const { code, expiresAt } = await createLinkCode(user.id);
    const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
    return `Your link code is ${code}. Sign in on the web app and enter it in Settings within ${minutes} minutes.`;
  }
  const result = await consumeLinkCode(command.code, user.id);
  if (result.status === "merged" || result.status === "linked") {
    return "Linked. Your chats on this channel now share memory with your other accounts.";
  }
  if (result.status === "already") {
    return "This chat is already linked to that account.";
  }
  if (result.status === "expired") {
    return "That code has expired. Generate a new one and try again.";
  }
  if (result.status === "both-have-email") {
    return "Those accounts both have email sign-in, so they cannot be merged. Use one account.";
  }
  return "That code is not valid.";
}

export { appPrincipal, resolveChannelUser };
