export const displayFontFamily = "var(--excalidash-display-font, Excalifont)";

const quoteCssString = (value: string): string =>
  `'${value
    .replace(/\0/g, "\uFFFD")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\d ")
    .replace(/\n/g, "\\a ")
    .replace(/\f/g, "\\c ")}'`;

const quoteFontFamily = (family: string): string => {
  const firstCharacter = family.at(0);
  const hasMatchingQuotes =
    family.length >= 2 &&
    (firstCharacter === "'" || firstCharacter === '"') &&
    family.at(-1) === firstCharacter;

  return quoteCssString(hasMatchingQuotes ? family.slice(1, -1) : family);
};

export const configureDisplayFont = (): void => {
  const family = (
    import.meta.env.VITE_EXCALIDASH_UI_FONT_FAMILY || "Excalifont"
  ).trim();
  const fontUrl = (import.meta.env.VITE_EXCALIDASH_UI_FONT_URL || "").trim();

  document.documentElement.style.setProperty(
    "--excalidash-display-font",
    family,
  );
  if (!fontUrl) return;

  const style = document.createElement("style");
  style.setAttribute("data-excalidash-custom-font", "true");
  style.textContent = `@font-face { font-family: ${quoteFontFamily(family)}; src: url(${quoteCssString(fontUrl)}) format('woff2'); font-weight: normal; font-style: normal; font-display: swap; }`;
  document.head.appendChild(style);
};
