import { randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ensureEmailIdentity } from "../../identity.ts";
import { prisma } from "../../prisma.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, unauthorized } from "../errors.ts";
import { json, noContent, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { hashToken, issueTokens, revokeRefreshToken, rotateRefreshToken } from "../tokens.ts";
import { toMeView } from "./me.ts";

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MS = 15 * 60_000;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address." }));

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function startEmailSignIn({ request }: { request: Request }) {
  const body = await readJson(request, z.object({ email: emailSchema, locale: z.string().optional() }));
  const now = apiDeps().now();
  const recent = await prisma.emailLoginCode.count({
    where: { createdAt: { gte: new Date(now.getTime() - CODE_WINDOW_MS) }, email: body.email },
  });
  if (recent >= MAX_CODES_PER_WINDOW) {
    throw new ApiError(429, "too_many_requests", "Too many codes requested. Try again in a few minutes.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.emailLoginCode.create({
    data: { codeHash: hashToken(`${body.email}:${code}`), email: body.email, expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  });
  await apiDeps().sendEmailCode({ code, email: body.email, locale: body.locale ?? "en" });
  return noContent();
}

async function verifyEmailSignIn({ request }: { request: Request }) {
  const body = await readJson(
    request,
    z.object({
      code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
      deviceName: z.string().max(120).optional(),
      email: emailSchema,
    }),
  );
  const now = apiDeps().now();
  const row = await prisma.emailLoginCode.findFirst({
    orderBy: { createdAt: "desc" },
    where: { consumedAt: null, email: body.email, expiresAt: { gt: now } },
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) {
    throw unauthorized("That code expired. Request a new one.");
  }
  if (!sameHash(row.codeHash, hashToken(`${body.email}:${body.code}`))) {
    await prisma.emailLoginCode.update({ data: { attempts: { increment: 1 } }, where: { id: row.id } });
    throw unauthorized("That code is not correct.");
  }
  const consumed = await prisma.emailLoginCode.updateMany({
    data: { consumedAt: now },
    where: { consumedAt: null, id: row.id },
  });
  if (consumed.count === 0) {
    throw unauthorized("That code expired. Request a new one.");
  }
  const user = await prisma.user.upsert({
    create: { email: body.email, emailVerified: now },
    update: {},
    where: { email: body.email },
  });
  if (!user.emailVerified) {
    await prisma.user.update({ data: { emailVerified: now }, where: { id: user.id } });
  }
  await ensureEmailIdentity(user.id, body.email);
  const tokens = await issueTokens(user.id, body.deviceName);
  return json({ ...tokens, user: await toMeView(user.id) });
}

async function verifiedAppleIdentity(identityToken: string) {
  try {
    return await apiDeps().verifyAppleToken(identityToken);
  } catch (error) {
    console.warn("api: Apple identity token rejected", error);
    throw unauthorized("Apple sign-in failed. Try again.");
  }
}

// Finds the account for an Apple ID: first by the Apple identity, then by a verified,
// non-relay email that already has an account, else a new account.
async function resolveAppleUser(apple: Awaited<ReturnType<typeof verifiedAppleIdentity>>, name?: string) {
  const identity = await prisma.channelIdentity.findUnique({
    include: { user: true },
    where: { provider_providerUserId: { provider: "apple", providerUserId: apple.sub } },
  });
  if (identity) {
    return identity.user;
  }
  const email = apple.email && apple.emailVerified ? apple.email : null;
  const owner = email ? await prisma.user.findUnique({ where: { email } }) : null;
  // A relay address (…@privaterelay.appleid.com) never matches an account made another way.
  const existing = owner && !apple.isPrivateEmail ? owner : null;
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: email && !owner ? email : null,
        emailVerified: email && !owner ? apiDeps().now() : null,
        name: name ?? null,
      },
    }));
  await prisma.channelIdentity.create({ data: { provider: "apple", providerUserId: apple.sub, userId: user.id } });
  if (user.email) {
    await ensureEmailIdentity(user.id, user.email);
  }
  return user;
}

const appleBodySchema = z.object({
  deviceName: z.string().max(120).optional(),
  fullName: z.string().trim().max(80).optional(),
  identityToken: z.string().min(20),
});

export { verifiedAppleIdentity };

export const authRoutes: RouteDefinition[] = [
  {
    auth: false,
    async handler({ request }) {
      const body = await readJson(request, appleBodySchema);
      const apple = await verifiedAppleIdentity(body.identityToken);
      const user = await resolveAppleUser(apple, body.fullName || undefined);
      const tokens = await issueTokens(user.id, body.deviceName);
      return json({ ...tokens, user: await toMeView(user.id) });
    },
    method: "POST",
    path: "/auth/apple",
  },
  { auth: false, handler: startEmailSignIn, method: "POST", path: "/auth/email/start" },
  { auth: false, handler: verifyEmailSignIn, method: "POST", path: "/auth/email/verify" },
  {
    auth: false,
    async handler({ request }) {
      const body = await readJson(request, z.object({ refreshToken: z.string().min(1) }));
      return json(await rotateRefreshToken(body.refreshToken));
    },
    method: "POST",
    path: "/auth/refresh",
  },
  {
    auth: false,
    async handler({ request }) {
      const body = await readJson(request, z.object({ refreshToken: z.string().min(1) }));
      await revokeRefreshToken(body.refreshToken);
      return noContent();
    },
    method: "POST",
    path: "/auth/logout",
  },
];
