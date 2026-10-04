import { defineConfig } from "vitepress";
import { docsReviewPlugin } from "./review/plugin.mjs";

export default defineConfig({
  title: "ExcaliDash",
  description:
    "Self-host Excalidraw with saved drawings, collections, real-time collaboration, and version history. Deploy ExcaliDash with Docker Compose.",
  sitemap: { hostname: "https://excalidash.xyz" },
  transformHead({ pageData }) {
    if (pageData.relativePath === "404.md") return [];
    const path = pageData.relativePath
      .replace(/index\.md$/, "")
      .replace(/\.md$/, "");
    const url = `https://excalidash.xyz/${path}`;
    const title = pageData.frontmatter.title || pageData.title;
    return [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:site_name", content: "ExcaliDash" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: pageData.description }],
      ["meta", { property: "og:url", content: url }],
      [
        "meta",
        {
          property: "og:image",
          content: "https://excalidash.xyz/images/workspace.png",
        },
      ],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ];
  },
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
          { text: "Authentication", link: "/guide/authentication" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Collaboration", link: "/guide/collaboration" },
          { text: "Storage and backups", link: "/guide/storage-backups" },
        ],
      },
      {
        text: "Deploy",
        items: [{ text: "Docker Compose", link: "/deploy/docker" }],
      },
      {
        text: "Develop",
        items: [{ text: "Local development", link: "/develop/" }],
      },
      {
        text: "Reference",
        items: [
          { text: "Environment", link: "/reference/environment" },
          { text: "Screenshots", link: "/reference/screenshots" },
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
