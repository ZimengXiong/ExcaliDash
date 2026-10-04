import DefaultTheme from "vitepress/theme";
import "./style.css";
import ReviewLayout from "./ReviewLayout.vue";
import "./review.css";
import ThemeScreenshot from "./ThemeScreenshot.vue";
import type { Theme } from "vitepress";

export default {
  extends: DefaultTheme,
  Layout: ReviewLayout,
  enhanceApp({ app }) {
    app.component("ThemeScreenshot", ThemeScreenshot);
  },
} satisfies Theme;
