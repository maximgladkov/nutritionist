// Short group codes people can type ("LEAN-7K2P"): up to four letters from the group name, a dash,
// then four characters from an alphabet without look-alikes (no 0/O, 1/I/L).
const SUFFIX_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SUFFIX_LENGTH = 4;

export function joinCodePrefix(name: string): string {
  const letters = name
    .normalize("NFD")
    .replace(/[^A-Za-z]/gu, "")
    .toUpperCase()
    .slice(0, 4);
  return letters.length > 0 ? letters : "BTR";
}

export function generateJoinCode(name: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
  const suffix = Array.from(bytes, (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join("");
  return `${joinCodePrefix(name)}-${suffix}`;
}

// Turns what someone typed ("lean 7k2p", "LEAN-7K2P") into the stored form, or null when it can't
// be a code. The dash always sits before the last four characters.
export function normalizeJoinCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (compact.length < SUFFIX_LENGTH + 1 || compact.length > SUFFIX_LENGTH + 4) {
    return null;
  }
  return `${compact.slice(0, -SUFFIX_LENGTH)}-${compact.slice(-SUFFIX_LENGTH)}`;
}
