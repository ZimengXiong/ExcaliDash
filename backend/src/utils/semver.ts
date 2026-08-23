export type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[]; // split by "."
  raw: string;
};

const SEMVER_RE =
  /^v?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<pre>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const parseSemver = (input: string): ParsedSemver | null => {
  const trimmed = input.trim();
  const match = SEMVER_RE.exec(trimmed);
  if (!match || !match.groups) return null;

  const major = Number(match.groups.major);
  const minor = Number(match.groups.minor);
  const patch = Number(match.groups.patch);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  const pre = typeof match.groups.pre === "string" && match.groups.pre.length > 0 ? match.groups.pre : "";
  const prerelease = pre ? pre.split(".") : [];

  return { major, minor, patch, prerelease, raw: trimmed };
};

const isNumericIdentifier = (id: string): boolean => /^[0-9]+$/.test(id);

export const compareSemver = (a: ParsedSemver, b: ParsedSemver): number => {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  const aPre = a.prerelease;
  const bPre = b.prerelease;

  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const ai = aPre[i];
    const bi = bPre[i];
    if (ai === undefined) return -1; // shorter prerelease list has lower precedence
    if (bi === undefined) return 1;
    if (ai === bi) continue;

    const aNum = isNumericIdentifier(ai);
    const bNum = isNumericIdentifier(bi);

    if (aNum && bNum) {
      const aN = Number(ai);
      const bN = Number(bi);
      if (aN !== bN) return aN < bN ? -1 : 1;
      continue;
    }

    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;

    return ai < bi ? -1 : 1;
  }

  return 0;
};
