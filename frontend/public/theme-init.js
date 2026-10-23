// Applies the dark class before React mounts so a dark page never flashes
// white on load. Mirrors the lookup order of PreferencesContext: the mirrored
// preferences blob, then the legacy "theme" key, then the OS color scheme.
// Kept as a separate file because the nginx CSP only allows `script-src 'self'`.
(function () {
  var theme;
  try {
    var raw = localStorage.getItem("excalidash-preferences");
    if (raw) {
      theme = JSON.parse(raw).theme;
    } else {
      theme = localStorage.getItem("theme");
    }
  } catch (e) {
    /* storage unavailable or corrupt: fall back to the OS theme */
  }
  if (theme !== "light" && theme !== "dark") {
    theme =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  }
})();
