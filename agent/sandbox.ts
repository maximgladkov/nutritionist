import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";
import { VercelSandbox } from "eve/sandbox/vercel";

export const environment = process.env.VERCEL ? VercelSandbox.environment() : JustBashSandbox.environment();

export default defineSandbox(() => environment.open());
