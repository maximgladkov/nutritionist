import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function candidate(base) {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
    const file = base + suffix;
    if (existsSync(file) && statSync(file).isFile()) {
      return file;
    }
  }
  return null;
}

// Lets `node --test` load app code that relies on bundler resolution: the `@/` alias,
// extensionless relative imports, and extensionless package subpaths.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const file = candidate(path.join(root, specifier.slice(2)));
    if (file) {
      return nextResolve(pathToFileURL(file).href, context);
    }
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const file = candidate(path.resolve(parent, specifier));
    if (file) {
      return nextResolve(pathToFileURL(file).href, context);
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Packages such as next-auth import `next/server` without the `.js` Next.js ships.
    if (error?.code === "ERR_MODULE_NOT_FOUND" && !specifier.startsWith(".") && !specifier.endsWith(".js")) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}
