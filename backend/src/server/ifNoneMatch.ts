/** GET and HEAD use weak comparison. Commas inside opaque tags are valid. */
export const matchesIfNoneMatch = (
  header: string | undefined,
  tag: string,
): boolean => {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const opaque = tag.replace(/^W\//, "");
  return header.match(/"[^"]*"/g)?.includes(opaque) ?? false;
};
