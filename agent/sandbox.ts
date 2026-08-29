import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";
import { vercel } from "eve/sandbox/vercel";

export default process.env.VERCEL
  ? defineSandbox({ backend: vercel() })
  : defineSandbox({ backend: justbash() });
