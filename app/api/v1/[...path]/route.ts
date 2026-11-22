import { handleApiRequest } from "@/lib/api";

// Mobile and web clients share this versioned JSON API. Routing lives in lib/api so it can be
// exercised end to end in tests without Next.js.
export const dynamic = "force-dynamic";

export const GET = handleApiRequest;
export const POST = handleApiRequest;
export const PUT = handleApiRequest;
export const PATCH = handleApiRequest;
export const DELETE = handleApiRequest;
export const OPTIONS = handleApiRequest;
