export const displayFontFamily = "var(--excalidash-display-font, Excalifont)";

const quoteFontFamily = (family: string): string => {
  if (/^['"].*['"]$/.test(family)) return family;
  return `'${family.replace(/'/g, "\\'")}'`;
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
  style.textContent = `@font-face { font-family: ${quoteFontFamily(family)}; src: url('${fontUrl.replace(/'/g, "%27")}') format('woff2'); font-weight: normal; font-style: normal; font-display: swap; }`;
  document.head.appendChild(style);
};
