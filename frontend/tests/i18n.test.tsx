import { describe, expect, it } from "vitest";
import {
  LOCALE_LANGUAGE_CODES,
  localeForLanguageCode,
  resolveLocale,
  translate,
} from "../src/i18n";
import { en } from "../src/i18n/locales/en";
import { zhCN } from "../src/i18n/locales/zh-CN";

describe("i18n", () => {
  it("uses the locale's own translation when it exists", () => {
    expect(translate("zh-CN", "sidebar.trash")).toBe("回收站");
  });

  it("falls back to English for keys a locale has not translated yet", () => {
    expect(zhCN["common.loading"]).toBeUndefined();
    expect(translate("zh-CN", "common.loading")).toBe(en["common.loading"]);
  });

  it("interpolates placeholders and leaves unknown ones untouched", () => {
    expect(translate("en", "dashboard.moveItemsTo", { count: 3 })).toBe(
      "Move 3 items to...",
    );
    expect(translate("en", "dashboard.moveItemsTo")).toBe(
      "Move {count} items to...",
    );
  });

  it("resolves browser and editor language codes to a supported locale", () => {
    expect(resolveLocale("zh-CN")).toBe("zh-CN");
    expect(resolveLocale("zh-TW")).toBe("zh-CN");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("fr-FR")).toBe("fr");
    expect(resolveLocale("fr-CA")).toBe("fr");
    expect(resolveLocale("de-DE")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
  });

  it("maps locales to the language codes the editor understands", () => {
    expect(LOCALE_LANGUAGE_CODES.fr).toBe("fr-FR");
    expect(localeForLanguageCode("fr-FR")).toBe("fr");
    expect(localeForLanguageCode("fr")).toBe("fr");
    expect(localeForLanguageCode("de-DE")).toBeUndefined();
  });

  it("translates into French with French typography", () => {
    expect(translate("fr", "sidebar.trash")).toBe("Corbeille");
    expect(translate("fr", "auth.login.forgotPassword")).toBe(
      "Mot de passe oublié\u202F?",
    );
  });
});
