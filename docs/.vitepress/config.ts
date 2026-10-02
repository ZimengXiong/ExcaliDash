import { defineConfig } from "vitepress";
import { docsReviewPlugin } from "./review/plugin.mjs";

export default defineConfig({
  title: "ExcaliDash",
  description: "A self-hosted home for your Excalidraw drawings.",
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    plugins: [docsReviewPlugin()],
    server: {
      allowedHosts: [".v3c.dev"],
    },
  },
  head: [
    ["meta", { name: "theme-color", content: "#6965db" }],
    ["link", { rel: "icon", href: "/images/logo.png", type: "image/png" }],
  ],
  themeConfig: {
    siteTitle: false,
    logo: { src: "/images/logo.png", alt: "ExcaliDash" },
    nav: [
      { text: "Guide", link: "/guide/quick-start" },
      { text: "Deploy", link: "/deploy/docker" },
      { text: "Develop", link: "/develop/" },
      { text: "Reference", link: "/reference/environment" },
    ],
    sidebar: [
      {
        text: "Get started",
        items: [
          { text: "Quick start", link: "/guide/quick-start" },
          { text: "First run", link: "/guide/first-run" },
          { text: "Your workspace", link: "/guide/workspace" },
          { text: "Authentication", link: "/guide/authentication" },
          { text: "Configuration", link: "/guide/configuration" },
        ],
      },
      {
        text: "Deploy",
        items: [{ text: "Docker Compose", link: "/deploy/docker" }],
      },
      {
        text: "Develop",
        items: [
          { text: "Local development", link: "/develop/" },
          { text: "Review the docs", link: "/develop/docs-review" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Environment", link: "/reference/environment" },
          { text: "Architecture", link: "/reference/architecture" },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    editLink: {
      pattern: "https://github.com/ZimengXiong/ExcaliDash/edit/dev/docs/:path",
      text: "Edit this page on GitHub",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/ZimengXiong/ExcaliDash" },
    ],
    footer: {
      message: "Self-hosted, open source, and built around Excalidraw.",
      copyright: "Released under the GNU LGPL v3.0.",
    },
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});
