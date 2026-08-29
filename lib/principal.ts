export type ChannelName = "web" | "telegram" | "whatsapp";

export type ChannelProvider = "telegram" | "whatsapp" | "email";

export const APP_AUTHENTICATOR = "app";
export const APP_ISSUER = "nutritionist";

export function appPrincipal(
  userId: string,
  channel: ChannelName,
): {
  attributes: { channel: ChannelName };
  authenticator: typeof APP_AUTHENTICATOR;
  issuer: typeof APP_ISSUER;
  principalId: string;
  principalType: "user";
  subject: string;
} {
  return {
    attributes: { channel },
    authenticator: APP_AUTHENTICATOR,
    issuer: APP_ISSUER,
    principalId: userId,
    principalType: "user",
    subject: userId,
  };
}
