import type { Locale } from "../i18n/locales.ts";
import { requireUser, type ApiUser } from "./auth.ts";
import { translateErrorMessage } from "./error-messages.ts";
import { toApiError } from "./errors.ts";
import { CORS_HEADERS, json, noContent } from "./http.ts";
import { localeResolver } from "./locale.ts";

export type RouteContext = {
  // The language to write in; see localeResolver.
  locale: () => Promise<Locale>;
  params: Record<string, string>;
  request: Request;
  url: URL;
  user: ApiUser;
};

export type PublicRouteContext = Omit<RouteContext, "user">;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Result = Response | Record<string, unknown> | unknown[] | null;

export type RouteDefinition =
  | { auth?: true; handler: (ctx: RouteContext) => Promise<Result>; method: Method; path: string }
  | { auth: false; handler: (ctx: PublicRouteContext) => Promise<Result>; method: Method; path: string };

type CompiledRoute = RouteDefinition & { keys: string[]; pattern: RegExp };

export const API_PREFIX = "/api/v1";

function compile(route: RouteDefinition): CompiledRoute {
  const keys: string[] = [];
  const source = route.path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { ...route, keys, pattern: new RegExp(`^${source}/?$`) };
}

function toResponse(result: Result, method: Method): Response {
  if (result instanceof Response) {
    return result;
  }
  if (result === null) {
    return noContent();
  }
  return json(result, method === "POST" ? 201 : 200);
}

export function createRouter(routes: readonly RouteDefinition[]) {
  const compiled = routes.map(compile);

  return async function dispatch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS, status: 204 });
    }
    const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) || "/" : url.pathname;
    let pathMatched = false;
    for (const route of compiled) {
      const match = route.pattern.exec(path);
      if (!match) {
        continue;
      }
      pathMatched = true;
      if (route.method !== request.method) {
        continue;
      }
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] ?? "");
      });
      let locale = localeResolver(request);
      try {
        if (route.auth === false) {
          return toResponse(await route.handler({ locale, params, request, url }), route.method);
        }
        const user = await requireUser(request);
        locale = localeResolver(request, user.id);
        return toResponse(await route.handler({ locale, params, request, url, user }), route.method);
      } catch (error) {
        const apiError = toApiError(error);
        // Translated only here, after toApiError has read the English text for the status.
        const message = translateErrorMessage(apiError.message, await locale().catch(() => "en" as const));
        return json({ error: { code: apiError.code, details: apiError.details, message } }, apiError.status);
      }
    }
    const locale = await localeResolver(request)();
    return pathMatched
      ? json({ error: { code: "method_not_allowed", message: translateErrorMessage("Method not allowed.", locale) } }, 405)
      : json({ error: { code: "not_found", message: translateErrorMessage("No such endpoint.", locale) } }, 404);
  };
}
