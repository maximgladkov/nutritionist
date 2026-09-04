export type BasicCredentials = {
  readonly password: string;
  readonly username: string;
};

export function parseBasicAuthorization(header: string | null): BasicCredentials | null {
  if (header === null || !header.startsWith("Basic ")) {
    return null;
  }
  const encoded = header.slice("Basic ".length).trim();
  if (encoded.length === 0) {
    return null;
  }
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) {
    return null;
  }
  return { password: decoded.slice(colon + 1), username: decoded.slice(0, colon) };
}

export function basicCredentialsEqual(actual: BasicCredentials, expected: BasicCredentials): boolean {
  return timingSafeEqualString(`${actual.username}\0${actual.password}`, `${expected.username}\0${expected.password}`);
}

export function isValidAdminBasicAuth(header: string | null): boolean {
  const expected = expectedAdminCredentials();
  if (expected === null) {
    return false;
  }
  const actual = parseBasicAuthorization(header);
  if (actual === null) {
    basicCredentialsEqual({ password: "", username: "" }, expected);
    return false;
  }
  return basicCredentialsEqual(actual, expected);
}

export function expectedAdminCredentials(): BasicCredentials | null {
  const username = process.env.ADMIN_BASIC_USER?.trim() ?? "";
  const password = process.env.ADMIN_BASIC_PASSWORD ?? "";
  if (username.length === 0 || password.length === 0) {
    return null;
  }
  return { password, username };
}

function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}
