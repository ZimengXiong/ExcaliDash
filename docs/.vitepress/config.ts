import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitepress";
import { docsReviewPlugin } from "./review/plugin.mjs";

const SITE_URL = "https://excalidash.xyz";
const OG_IMAGE = `${SITE_URL}/images/og-card.png`;
const SCREENSHOT = `${SITE_URL}/images/workspace.png`;
const AUTHOR = {
  "@type": "Person",
  "@id": "https://zimengxiong.com/#person",
  name: "Zimeng Xiong",
  url: "https://zimengxiong.com/",
  sameAs: ["https://github.com/ZimengXiong"],
};
const VERSION = readFileSync(
  resolve(__dirname, "../../VERSION"),
  "utf8",
).trim();

const HOME_FAQS = [
  {
    question:
      "What does ExcaliDash add to the official Excalidraw Docker image?",
    answer:
      "The official excalidraw/excalidraw container is a static frontend that saves drawings only in browser localStorage and routes collaboration to public servers. ExcaliDash adds a searchable dashboard, persistent SQLite or PostgreSQL storage, collections, self-hosted Socket.IO collaboration, version history, local and OIDC SSO accounts, and automated backups.",
  },
  {
    question: "Does ExcaliDash real-time collaboration stay on my own server?",
    answer:
      "Yes. ExcaliDash runs its own Socket.IO collaboration backend inside the Docker Compose stack, so edits, live cursors, presence avatars, and viewport follow mode stay on your server without needing a separate excalidraw-room container.",
  },
  {
    question: "Is ExcaliDash a self-hosted alternative to Excalidraw+?",
    answer:
      "Yes. ExcaliDash is an independent open-source (LGPL-3.0) workspace that brings saved drawings, collections, team sharing, live collaboration, version history, and OIDC SSO to your own infrastructure.",
  },
  {
    question: "Can I import and export standard .excalidraw files?",
    answer:
      "Yes. Import existing .excalidraw files into your workspace, export any drawing back to .excalidraw anytime, or export full .excalidash archives with collections, version history, and uploaded images.",
  },
  {
    question:
      "Can I run ExcaliDash behind Caddy, Nginx, Traefik, or Cloudflare Tunnel?",
    answer:
      "Yes. Point your reverse proxy to host port 6767 or container port 8080, forward WebSocket upgrades on /socket.io/, set FRONTEND_URL to your public https:// origin, and set TRUST_PROXY to match your proxy hop count.",
  },
];

const SECTION_HUBS: Record<string, { name: string; url: string }> = {
  guides: { name: "Guides", url: `${SITE_URL}/guides` },
  deploy: { name: "Deploy", url: `${SITE_URL}/deploy/docker` },
  guide: { name: "Docs", url: `${SITE_URL}/guide/quick-start` },
  reference: { name: "Reference", url: `${SITE_URL}/reference/environment` },
};

function toCleanPath(relativePath: string): string {
  return relativePath.replace(/(^|\/)index\.md$/, "").replace(/\.md$/, "");
}

const DOCS_DIR = resolve(__dirname, "..");
const gitDateCache = new Map<string, string | undefined>();

function gitDate(file: string, first: boolean): string | undefined {
  const key = `${first ? "a" : "m"}:${file}`;
  if (gitDateCache.has(key)) return gitDateCache.get(key);
  let date: string | undefined;
  try {
    const args = first
      ? ["log", "--follow", "--diff-filter=A", "--format=%cI", "--", file]
      : ["log", "-1", "--format=%cI", "--", file];
    const lines = execFileSync("git", args, { cwd: DOCS_DIR, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    const value = first ? lines[lines.length - 1] : lines[0];
    date = value ? new Date(value).toISOString() : undefined;
  } catch {
    date = undefined;
  }
  gitDateCache.set(key, date);
  return date;
}

function fileModified(file: string): string {
  return (
    gitDate(file, false) ??
    (existsSync(file) ? statSync(file).mtime : new Date()).toISOString()
  );
}

function filePublished(file: string): string {
  return gitDate(file, true) ?? fileModified(file);
}

function sitemapLastmod(url: string): string {
  const clean = url.replace(/^\//, "");
  const base = clean === "" || clean.endsWith("/") ? `${clean}index` : clean;
  const direct = resolve(DOCS_DIR, `${base}.md`);
  const file = existsSync(direct)
    ? direct
    : resolve(DOCS_DIR, base, "index.md");
  return fileModified(file);
}

function stripForLlms(source: string): string {
  return source
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<script setup>[\s\S]*?<\/script>\n*/g, "")
    .replace(/^<[A-Z][A-Za-z]*\b[^>]*\/>\n*/gm, "")
    .replace(/\{\{\s*\$frontmatter\.excalidashVersion\s*\}\}/g, VERSION)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readFrontmatter(source: string): Record<string, string> {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  const fields: Record<string, string> = {};
  if (!match) return fields;
  for (const line of match[1].split("\n")) {
    const field = line.match(/^(title|description):\s*(.+)$/);
    if (field) fields[field[1]] = field[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}

function toCanonicalUrl(relativePath: string): string {
  const clean = toCleanPath(relativePath);
  return clean ? `${SITE_URL}/${clean}` : `${SITE_URL}/`;
}

export default defineConfig({
  lang: "en-US",
  title: "ExcaliDash",
  description:
    "Self-hosted Excalidraw workspace with saved drawings, collections, real-time collaboration, version history, and OIDC SSO via Docker Compose.",
  sitemap: {
    hostname: SITE_URL,
    transformItems(items) {
      return items.map((item) => ({
        ...item,
        lastmod: sitemapLastmod(item.url),
        url:
          item.url === "" || item.url === "/"
            ? ""
            : item.url.replace(/\/$/, ""),
      }));
    },
  },
  transformHead({ pageData }) {
    if (pageData.relativePath === "404.md") return [];
    const cleanPath = toCleanPath(pageData.relativePath);
    const url = toCanonicalUrl(pageData.relativePath);
    const rawTitle = pageData.frontmatter.title || pageData.title;
    const ogTitle =
      pageData.frontmatter.titleTemplate === false
        ? rawTitle
        : `${rawTitle} | ExcaliDash`;
    const isArticle =
      cleanPath.startsWith("guides/") || cleanPath.startsWith("deploy/");
    const head: Array<[string, Record<string, string>, string?]> = [
      ["link", { rel: "canonical", href: url }],
      [
        "meta",
        { property: "og:type", content: isArticle ? "article" : "website" },
      ],
      ["meta", { property: "og:locale", content: "en_US" }],
      ["meta", { property: "og:site_name", content: "ExcaliDash" }],
      ["meta", { property: "og:title", content: ogTitle }],
      ["meta", { property: "og:description", content: pageData.description }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:image", content: OG_IMAGE }],
      ["meta", { property: "og:image:width", content: "1200" }],
      ["meta", { property: "og:image:height", content: "630" }],
      [
        "meta",
        {
          property: "og:image:alt",
          content:
            "ExcaliDash logo and self-hosted Excalidraw workspace dashboard with drawing previews and collections",
        },
      ],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: ogTitle }],
      ["meta", { name: "twitter:description", content: pageData.description }],
      ["meta", { name: "twitter:image", content: OG_IMAGE }],
    ];

    if (pageData.relativePath === "index.md") {
      head.push(
        [
          "script",
          { type: "application/ld+json" },
          JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "ExcaliDash",
            alternateName: "ExcaliDash Self-Hosted Excalidraw",
            url: `${SITE_URL}/`,
          }),
        ],
        [
          "script",
          { type: "application/ld+json" },
          JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "ExcaliDash",
            softwareVersion: VERSION,
            applicationCategory: "DeveloperApplication",
            applicationSubCategory: "Whiteboard, Diagramming",
            operatingSystem: "Linux, macOS, Windows, Docker",
            softwareRequirements: "Docker Compose v2",
            installUrl: `${SITE_URL}/deploy/docker`,
            isBasedOn: "https://github.com/excalidraw/excalidraw",
            url: `${SITE_URL}/`,
            screenshot: SCREENSHOT,
            author: AUTHOR,
            creator: AUTHOR,
            codeRepository: "https://github.com/ZimengXiong/ExcaliDash",
            sameAs: [
              "https://github.com/ZimengXiong/ExcaliDash",
              "https://hub.docker.com/r/zimengxiong/excalidash-frontend",
              "https://integrations.goauthentik.io/dashboards/excalidash/",
            ],
            license: "https://www.gnu.org/licenses/lgpl-3.0.html",
            isAccessibleForFree: true,
            description: pageData.description,
            featureList: [
              "Persistent SQLite and PostgreSQL storage for Excalidraw drawings",
              "Collections, folders, search, and visual previews",
              "Built-in self-hosted Socket.IO real-time collaboration and follow mode",
              "Automatic drawing version history and two-click restore",
              "Local accounts, OpenID Connect (OIDC) SSO, and scoped API keys",
              "S3-compatible image storage and automated backups",
            ],
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
            mainEntity: HOME_FAQS.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }),
        ],
      );
    } else {
      const segments = cleanPath.split("/").filter(Boolean);
      const items: Array<{
        "@type": "ListItem";
        position: number;
        name: string;
        item: string;
      }> = [
        {
          "@type": "ListItem",
          position: 1,
          name: "ExcaliDash",
          item: `${SITE_URL}/`,
        },
      ];
      if (segments.length > 1) {
        const hub = SECTION_HUBS[segments[0]];
        if (hub && hub.url !== url) {
          items.push({
            "@type": "ListItem",
            position: items.length + 1,
            name: hub.name,
            item: hub.url,
          });
        }
      }
      items.push({
        "@type": "ListItem",
        position: items.length + 1,
        name: rawTitle,
        item: url,
      });

      head.push([
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items,
        }),
      ]);

      if (isArticle) {
        const sourceFile = resolve(DOCS_DIR, pageData.relativePath);
        const articleSchema: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: rawTitle,
          description: pageData.description,
          image: OG_IMAGE,
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": url,
          },
          author: AUTHOR,
          datePublished: filePublished(sourceFile),
          dateModified: fileModified(sourceFile),
          publisher: {
            "@type": "Organization",
            name: "ExcaliDash",
            url: `${SITE_URL}/`,
            logo: {
              "@type": "ImageObject",
              url: `${SITE_URL}/images/logo.png`,
            },
          },
        };
        head.push([
          "script",
          { type: "application/ld+json" },
          JSON.stringify(articleSchema),
        ]);
      }
    }
    return head;
  },
  transformPageData(pageData) {
    pageData.frontmatter.excalidashVersion = VERSION;
  },
  buildEnd(siteConfig) {
    const pages = [...siteConfig.pages]
      .filter((page) => page !== "404.md")
      .sort((a, b) => {
        if (a === "index.md") return -1;
        if (b === "index.md") return 1;
        return a.localeCompare(b);
      });
    const sections = pages.map((page) => {
      const source = readFileSync(resolve(siteConfig.srcDir, page), "utf8");
      const { title, description } = readFrontmatter(source);
      const body = stripForLlms(source);
      const meta = [`URL: ${toCanonicalUrl(page)}`];
      if (description) meta.push(`Description: ${description}`);
      const heading = /^# /m.test(body)
        ? ""
        : `# ${title ?? toCleanPath(page)}\n\n`;
      return `${heading}${meta.join("\n")}\n\n${body}`;
    });
    const intro = readFileSync(
      resolve(siteConfig.srcDir, "public/llms.txt"),
      "utf8",
    )
      .split("\n## ")[0]
      .trim();
    writeFileSync(
      resolve(siteConfig.outDir, "llms-full.txt"),
      `${intro}\n\n${sections.join("\n\n---\n\n")}\n`,
    );
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
    ["link", { rel: "apple-touch-icon", href: "/images/logo.png" }],
  ],
  themeConfig: {
    siteTitle: false,
    logo: { src: "/images/logo.png", alt: "ExcaliDash" },
    nav: [
      { text: "Guides", link: "/guides" },
      { text: "Deploy", link: "/deploy/docker" },
      { text: "Docs", link: "/guide/quick-start" },
      { text: "Reference", link: "/reference/environment" },
    ],
    sidebar: [
      {
        text: "Self-hosting guides",
        items: [
          { text: "All guides", link: "/guides" },
          {
            text: "How to self-host Excalidraw",
            link: "/guides/self-host-excalidraw",
          },
          {
            text: "How ExcaliDash works",
            link: "/guides/how-excalidash-works",
          },
          {
            text: "Excalidraw+ alternative",
            link: "/guides/excalidraw-plus-alternative",
          },
          {
            text: "Self-hosted Excalidraw projects compared",
            link: "/guides/self-hosted-excalidraw-projects",
          },
          {
            text: "Collaboration server (excalidraw-room)",
            link: "/guides/excalidraw-collaboration-server",
          },
          {
            text: "Drawings not saving",
            link: "/guides/excalidraw-docker-not-saving",
          },
          {
            text: "OIDC & SSO setup",
            link: "/guides/excalidraw-oidc-sso",
          },
          {
            text: "Reverse proxy & HTTPS",
            link: "/guides/excalidraw-reverse-proxy",
          },
          {
            text: "PostgreSQL & S3 storage",
            link: "/guides/excalidraw-postgresql-s3",
          },
        ],
      },
      {
        text: "Deploy",
        items: [
          { text: "Docker Compose", link: "/deploy/docker" },
          {
            text: "Coolify, Portainer & Dokploy",
            link: "/deploy/coolify-portainer",
          },
          {
            text: "Kubernetes, Proxmox & Unraid",
            link: "/deploy/kubernetes-proxmox-unraid",
          },
        ],
      },
      {
        text: "Documentation",
        items: [
          { text: "Quick start", link: "/guide/quick-start" },
          { text: "First run", link: "/guide/first-run" },
          { text: "Accounts & API keys", link: "/guide/authentication" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Collaboration & sharing", link: "/guide/collaboration" },
          { text: "Storage & backups", link: "/guide/storage-backups" },
        ],
      },
      {
        text: "Develop",
        items: [{ text: "Local development", link: "/develop" }],
      },
      {
        text: "Reference",
        items: [
          { text: "Environment variables", link: "/reference/environment" },
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
      message:
        'Self-hosted, open source, and built around Excalidraw by <a href="https://zimengxiong.com/">Zimeng Xiong</a>.',
      copyright: "Released under the GNU LGPL v3.0.",
    },
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});
