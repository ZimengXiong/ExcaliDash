import { defineConfig } from "vitepress";
import { docsReviewPlugin } from "./review/plugin.mjs";

export default defineConfig({
  title: "ExcaliDash",
  description:
    "Self-host Excalidraw with saved drawings, collections, real-time collaboration, version history, and OIDC SSO. Deploy ExcaliDash with Docker Compose.",
  sitemap: { hostname: "https://excalidash.xyz" },
  transformHead({ pageData }) {
    if (pageData.relativePath === "404.md") return [];
    const path = pageData.relativePath
      .replace(/index\.md$/, "")
      .replace(/\.md$/, "");
    const url = `https://excalidash.xyz/${path}`;
    const rawTitle = pageData.frontmatter.title || pageData.title;
    const ogTitle =
      pageData.frontmatter.titleTemplate === false
        ? rawTitle
        : `${rawTitle} | ExcaliDash`;
    const head: Array<[string, Record<string, string>, string?]> = [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:site_name", content: "ExcaliDash" }],
      ["meta", { property: "og:title", content: ogTitle }],
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
      ["meta", { name: "twitter:title", content: ogTitle }],
      ["meta", { name: "twitter:description", content: pageData.description }],
      [
        "meta",
        {
          name: "twitter:image",
          content: "https://excalidash.xyz/images/workspace.png",
        },
      ],
    ];
    if (pageData.relativePath === "index.md") {
      head.push(
        [
          "script",
          { type: "application/ld+json" },
          JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "ExcaliDash",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Linux, macOS, Windows, Docker",
            url: "https://excalidash.xyz/",
            codeRepository: "https://github.com/ZimengXiong/ExcaliDash",
            license: "https://www.gnu.org/licenses/lgpl-3.0.html",
            description: pageData.description,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
          }),
        ],
        [
          "script",
          { type: "application/ld+json" },
          JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What does ExcaliDash add to the official Excalidraw Docker image?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The official excalidraw/excalidraw container is a static frontend that saves drawings only in browser localStorage and routes collaboration to public servers. ExcaliDash adds a dashboard, persistent SQLite or PostgreSQL storage, collections, search, self-hosted real-time collaboration, version history, user accounts with OIDC SSO, and backups.",
                },
              },
              {
                "@type": "Question",
                name: "Does ExcaliDash real-time collaboration stay on my own server?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. ExcaliDash runs its own Socket.IO collaboration backend inside the Docker Compose stack, so edits, live cursors, presence avatars, and follow mode stay on your server without needing a separate excalidraw-room container.",
                },
              },
              {
                "@type": "Question",
                name: "Is ExcaliDash a self-hosted alternative to Excalidraw+?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. ExcaliDash is an independent open-source (LGPL-3.0) workspace that brings saved drawings, collections, team sharing, live collaboration, version history, and SSO to your own infrastructure.",
                },
              },
              {
                "@type": "Question",
                name: "Can I import and export standard .excalidraw files?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. You can import existing .excalidraw files into your workspace, export drawings back to .excalidraw at any time, or export full .excalidash library archives with version history and images.",
                },
              },
            ],
          }),
        ],
      );
    } else {
      const segments = path.replace(/\/$/, "").split("/").filter(Boolean);
      const items = [
        {
          "@type": "ListItem",
          position: 1,
          name: "ExcaliDash",
          item: "https://excalidash.xyz/",
        },
        ...segments.map((seg, idx) => ({
          "@type": "ListItem",
          position: idx + 2,
          name:
            idx === segments.length - 1
              ? rawTitle
              : seg.charAt(0).toUpperCase() + seg.slice(1),
          item: `https://excalidash.xyz/${segments.slice(0, idx + 1).join("/")}`,
        })),
      ];
      head.push([
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items,
        }),
      ]);
    }
    return head;
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
          { text: "Authentication & SSO", link: "/guide/authentication" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Collaboration", link: "/guide/collaboration" },
          { text: "Storage and backups", link: "/guide/storage-backups" },
        ],
      },
      {
        text: "Self-hosting guides",
        items: [
          {
            text: "How to self-host Excalidraw",
            link: "/guides/self-host-excalidraw",
          },
          {
            text: "Excalidraw+ alternative",
            link: "/guides/excalidraw-plus-alternative",
          },
          {
            text: "Excalidraw with OIDC / SSO",
            link: "/guides/excalidraw-oidc-sso",
          },
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
      pattern: "https://github.com/ZimengXiong/ExcaliDash/edit/main/docs/:path",
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
