import { z } from "zod";
import { fatSecretReportText } from "../../fatsecret-import.ts";
import { prisma } from "../../prisma.ts";
import { sealSecret, openSecret } from "../../secret-box.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, invalid } from "../errors.ts";
import { readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";

// Where FatSecret may send the user back to: the app's own links (and Expo's in development).
const RETURN_URL_PREFIXES = ["heroui-native-app://", "btrme://", "exp://", "exps://"];

function allowedReturnUrl(value: string): boolean {
  return RETURN_URL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export type FatSecretView = {
  available: boolean;
  import: {
    days: number;
    entries: number;
    error: string | null;
    finishedAt: string | null;
    month: string | null;
    monthsDone: number;
    oldestDate: string | null;
    report: string | null;
    startedAt: string | null;
    status: "idle" | "running" | "done" | "failed";
    weights: number;
  } | null;
  status: "disconnected" | "pending" | "connected";
};

async function fatSecretView(userId: string): Promise<FatSecretView> {
  const available = apiDeps().fatSecret.configured();
  const row = await prisma.fatSecretConnection.findUnique({ where: { userId } });
  if (!row || (row.status !== "connected" && !row.requestToken)) {
    return { available, import: null, status: "disconnected" };
  }
  const status = row.importStatus as NonNullable<FatSecretView["import"]>["status"];
  return {
    available,
    import:
      status === "idle"
        ? null
        : {
            days: row.importedDays,
            entries: row.importedEntries,
            error: row.importError,
            finishedAt: row.importFinishedAt?.toISOString() ?? null,
            month: row.importMonth,
            monthsDone: row.importMonthsDone,
            oldestDate: row.importOldestDate,
            report:
              status === "done"
                ? fatSecretReportText({ days: row.importedDays, entries: row.importedEntries, weights: row.importedWeights })
                : null,
            startedAt: row.importStartedAt?.toISOString() ?? null,
            status,
            weights: row.importedWeights,
          },
    status: row.status === "connected" ? "connected" : "pending",
  };
}

// Shows the import as running straight away; the workflow takes a moment to start.
async function queueImport(userId: string): Promise<void> {
  await prisma.fatSecretConnection.update({
    data: {
      importError: null,
      importedDays: 0,
      importedEntries: 0,
      importedWeights: 0,
      importFinishedAt: null,
      importMonth: null,
      importMonthsDone: 0,
      importOldestDate: null,
      importStartedAt: apiDeps().now(),
      importStatus: "running",
    },
    where: { userId },
  });
  try {
    await apiDeps().startFatSecretImport(userId);
  } catch (error) {
    await prisma.fatSecretConnection.update({
      data: { importError: "The import couldn't start.", importStatus: "failed" },
      where: { userId },
    });
    throw error;
  }
}

function redirectTo(url: string): Response {
  return new Response(null, { headers: { location: url }, status: 302 });
}

function withQuery(url: string, params: Record<string, string>): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${new URLSearchParams(params).toString()}`;
}

function donePage(message: string): Response {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>FatSecret</title><body style="font-family:-apple-system,system-ui,sans-serif;padding:32px;text-align:center"><p>${message}</p></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }, status: 200 });
}

export const integrationRoutes: RouteDefinition[] = [
  {
    async handler({ user }) {
      return { fatsecret: await fatSecretView(user.id) };
    },
    method: "GET",
    path: "/integrations",
  },
  {
    async handler({ request, url, user }) {
      const client = apiDeps().fatSecret;
      if (!client.configured()) {
        throw new ApiError(503, "unavailable", "FatSecret isn't available right now.");
      }
      const body = await readJson(request, z.object({ returnUrl: z.string().trim().min(1).max(500) }).strict());
      if (!allowedReturnUrl(body.returnUrl)) {
        throw invalid("returnUrl must be a link back to the app.");
      }
      const callbackUrl = `${url.origin}/api/v1/integrations/fatsecret/callback`;
      const request_ = await client.requestToken(callbackUrl);
      const pending = {
        requestSecret: sealSecret(request_.secret),
        requestToken: request_.token,
        returnUrl: body.returnUrl,
      };
      await prisma.fatSecretConnection.upsert({
        create: { ...pending, userId: user.id },
        update: pending,
        where: { userId: user.id },
      });
      return { authorizeUrl: client.authorizeUrl(request_.token) };
    },
    method: "POST",
    path: "/integrations/fatsecret/connect",
  },
  {
    // FatSecret sends the browser here after sign-in, so this can't carry our access token: the
    // one-time request token identifies whose sign-in it was.
    auth: false,
    async handler({ url }) {
      const token = url.searchParams.get("oauth_token");
      const verifier = url.searchParams.get("oauth_verifier");
      const row = token ? await prisma.fatSecretConnection.findUnique({ where: { requestToken: token } }) : null;
      if (!row || !row.requestSecret || !token) {
        return donePage("This FatSecret sign-in link has expired. Go back to the app and try again.");
      }
      const back = row.returnUrl;
      if (!verifier) {
        await prisma.fatSecretConnection.update({
          data: { requestSecret: null, requestToken: null },
          where: { userId: row.userId },
        });
        return back ? redirectTo(withQuery(back, { fatsecret: "cancelled" })) : donePage("FatSecret wasn't connected.");
      }
      try {
        const access = await apiDeps().fatSecret.accessToken({ secret: openSecret(row.requestSecret), token }, verifier);
        await prisma.fatSecretConnection.update({
          data: {
            accessSecret: sealSecret(access.secret),
            accessToken: sealSecret(access.token),
            requestSecret: null,
            requestToken: null,
            returnUrl: null,
            status: "connected",
          },
          where: { userId: row.userId },
        });
      } catch (error) {
        console.error("api: FatSecret sign-in failed", error);
        return back ? redirectTo(withQuery(back, { fatsecret: "error" })) : donePage("FatSecret sign-in failed.");
      }
      await queueImport(row.userId).catch((error: unknown) => console.error("api: FatSecret import didn't start", error));
      return back ? redirectTo(withQuery(back, { fatsecret: "connected" })) : donePage("FatSecret is connected. You can go back to the app.");
    },
    method: "GET",
    path: "/integrations/fatsecret/callback",
  },
  {
    async handler({ user }) {
      const row = await prisma.fatSecretConnection.findUnique({ where: { userId: user.id } });
      if (!row || row.status !== "connected") {
        throw new ApiError(409, "not_connected", "Connect FatSecret first.");
      }
      if (row.importStatus !== "running") {
        await queueImport(user.id);
      }
      return { fatsecret: await fatSecretView(user.id) };
    },
    method: "POST",
    path: "/integrations/fatsecret/import",
  },
  {
    // Forgets the FatSecret tokens; everything already imported stays in the diary.
    async handler({ user }) {
      await prisma.fatSecretConnection.deleteMany({ where: { userId: user.id } });
      return null;
    },
    method: "DELETE",
    path: "/integrations/fatsecret",
  },
];
