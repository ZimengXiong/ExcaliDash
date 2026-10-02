import DefaultTheme from "vitepress/theme";
import "./style.css";
import ReviewLayout from "./ReviewLayout.vue";
import "./review.css";

export default { extends: DefaultTheme, Layout: ReviewLayout };
