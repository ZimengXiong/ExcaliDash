/**
 * The WebAssembly sanitizer (backend/sanitizer) replaced DOMPurify on jsdom.
 * DOMPurify stays a dev dependency as the oracle: with the configuration the
 * backend used before, it must find nothing left to remove in our output.
 */
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { sanitizeSvg, sanitizeText } from "../security";

const { window } = new JSDOM("");
const purify = DOMPurify(window as unknown as Window & typeof globalThis);

// the DOMPurify configurations of sanitizeSvg and sanitizeText before the switch
const OLD_SVG_CONFIG = {
  ALLOWED_TAGS: [
    "svg",
    "defs",
    "pattern",
    "g",
    "image",
    "symbol",
    "use",
    "clipPath",
    "mask",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "path",
    "text",
    "tspan",
  ],
  ALLOWED_ATTR: [
    "xmlns",
    "xmlns:xlink",
    "version",
    "id",
    "viewBox",
    "preserveAspectRatio",
    "x",
    "y",
    "width",
    "height",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "x1",
    "y1",
    "x2",
    "y2",
    "points",
    "d",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-dasharray",
    "stroke-dashoffset",
    "opacity",
    "transform",
    "clip-path",
    "mask",
    "clipPathUnits",
    "maskUnits",
    "maskContentUnits",
    "vector-effect",
    "patternUnits",
    "patternContentUnits",
    "font-size",
    "font-family",
    "font-weight",
    "letter-spacing",
    "text-anchor",
    "dominant-baseline",
    "href",
    "xlink:href",
  ],
  FORBID_TAGS: [
    "script",
    "foreignObject",
    "iframe",
    "object",
    "embed",
    "style",
    "link",
    "marker",
    "filter",
  ],
  FORBID_ATTR: [
    "onload",
    "onclick",
    "onerror",
    "onmouseover",
    "onfocus",
    "onblur",
    "src",
    "action",
    "style",
    "class",
  ],
  KEEP_CONTENT: true,
};
const OLD_TEXT_CONFIG = {
  ALLOWED_TAGS: ["b", "i", "u", "em", "strong", "br", "span"],
  ALLOWED_ATTR: [],
  FORBID_TAGS: [
    "script",
    "iframe",
    "object",
    "embed",
    "link",
    "style",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "svg",
    "foreignObject",
  ],
  FORBID_ATTR: [
    "onload",
    "onclick",
    "onerror",
    "onmouseover",
    "onfocus",
    "onblur",
    "onchange",
    "onsubmit",
    "onreset",
    "onkeydown",
    "onkeyup",
    "onkeypress",
    "href",
    "src",
    "action",
    "formaction",
    "style",
  ],
  KEEP_CONTENT: true,
};

const box = window.document.createElement("div");
const normalize = (html: string): string => {
  box.innerHTML = html;
  return box.innerHTML;
};

const SVG_TAGS = new Set(
  OLD_SVG_CONFIG.ALLOWED_TAGS.map((t) => t.toLowerCase()),
);
const SAFE_HREF =
  /^(#[\w-]+|data:image\/[a-z+]+;base64,[a-z0-9+/=\s]+|\/api\/files\/[\w-]+\/[\w-]+)$/i;
const leftovers = (html: string, allowedTags: Set<string>): string[] => {
  box.innerHTML = html;
  const found: string[] = [];
  for (const el of Array.from(box.querySelectorAll("*"))) {
    if (!allowedTags.has(el.localName.toLowerCase()))
      found.push(`<${el.localName}>`);
    for (const attr of Array.from(el.attributes)) {
      if (
        /^on/i.test(attr.name) ||
        ["style", "src", "class"].includes(attr.name)
      ) {
        found.push(`${el.localName} ${attr.name}`);
      }
      if (/href$/i.test(attr.name) && !SAFE_HREF.test(attr.value.trim())) {
        found.push(`${el.localName} ${attr.name}=${attr.value}`);
      }
      if (/url\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value)) {
        found.push(`${el.localName} ${attr.name}=${attr.value}`);
      }
    }
  }
  return found;
};

const SVG_ATTACKS = [
  "<svg><script>alert(1)</script></svg>",
  "<svg onload=alert(1)><rect/></svg>",
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<svg><image href="javascript:alert(1)"/></svg>',
  '<svg><image xlink:href="javascript:alert(1)"/></svg>',
  '<svg><image href=" JaVaScRiPt:alert(1)"/></svg>',
  '<svg><image xlink:href="https://evil.example/x.png"/></svg>',
  '<svg><use href="https://evil.example/x.svg#a"/></svg>',
  '<svg><use href="data:image/svg+xml;base64,PHN2ZyBpZD0iYSIgb25sb2FkPSJhbGVydCgxKSIvPg==#a"/></svg>',
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="data:text/html,<script>alert(1)</script>"/></svg>',
  '<svg><animate attributeName="href" values="javascript:alert(1)"/><a><text>x</text></a></svg>',
  '<svg><set attributeName="onload" to="alert(1)"/></svg>',
  "<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>",
  "<svg><style>@import url(https://evil.example/x.css)</style></svg>",
  "<svg><desc><img src=x onerror=alert(1)></desc></svg>",
  "<svg><title><img src=x onerror=alert(1)></title></svg>",
  "<svg><![CDATA[</text><img src=x onerror=alert(1)>]]></svg>",
  "<svg><text><![CDATA[<img src=x onerror=alert(1)>]]></text></svg>",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
  "<svg><p><style><img src=x onerror=alert(1)></style></p></svg>",
  '<svg><rect style="fill:url(javascript:alert(1))"/></svg>',
  '<svg><rect class="x" onclick="alert(1)" onmouseover="alert(1)"/></svg>',
  '<svg><g clip-path="url(https://evil.example/x.svg#c)" mask="url(javascript:alert(1))"/></svg>',
  '<svg><iframe srcdoc="<script>alert(1)</script>"></iframe></svg>',
  '<svg><noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript></svg>',
  "<svg><g><svg><svg onload=alert(1)></svg></svg></g></svg>",
  '<svg><marker><script>alert(1)</script></marker><filter><feImage href="javascript:alert(1)"/></filter></svg>',
  "<!--><svg onload=alert(1)>-->",
  "<svg><discard onbegin=alert(1)/></svg>",
  '<svg><pattern id="p" href="https://evil.example/p.svg#p"/></svg>',
];

// shapes an Excalidraw preview contains; the old pipeline kept them as they are
const SVG_PREVIEWS = [
  '<svg viewBox="0 0 10 10" preserveAspectRatio="none" version="1.1" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="5" height="5"></rect></svg>',
  '<svg><defs><clipPath id="c" clipPathUnits="userSpaceOnUse"><rect width="5" height="5"></rect></clipPath></defs><g clip-path="url(#c)"><circle cx="2" cy="2" r="1"></circle></g></svg>',
  '<svg><mask id="m" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"></rect></mask><path mask="url(#m)" d="M0 0 L5 5" stroke-dasharray="8 4"></path></svg>',
  '<svg><image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"></image></svg>',
  '<svg><image href="/api/files/abc-1/def_2" width="10" height="10"></image></svg>',
  '<svg><symbol id="s"><path d="M0 0"></path></symbol><use href="#s"></use></svg>',
  '<svg><pattern id="p" patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse" width="4" height="4"><line x1="0" y1="0" x2="4" y2="4"></line></pattern><polygon points="0,0 1,1 2,0" fill="url(#p)"></polygon></svg>',
  '<svg><text x="1" y="2" font-family="Excalifont, Xiaolai" font-size="20" text-anchor="middle" dominant-baseline="alphabetic">Hi &amp; &lt;b&gt; "q" \'s\' привет<tspan>2</tspan></text></svg>',
  '<svg><g transform="translate(10 10) rotate(0 5 5)" stroke-linecap="round" opacity="0.5"><path d="M0 0 C1 1, 2 2, 3 3" stroke="#1e1e1e" stroke-width="2" fill="none"></path></g><ellipse cx="1" cy="1" rx="1" ry="1"></ellipse><polyline points="0,0 1,1"></polyline></svg>',
];

const TEXTS = [
  "Project plan",
  "Tom & Jerry <3",
  "a < b > c",
  "\"quoted\" 'single'",
  "Доска № 1",
  "<b>bold</b> <i>it</i> <u>u</u> <em>e</em> <strong>s</strong><br><span>sp</span>",
  '<span class="x" style="color:red" title="t">attrs</span>',
  "<img src=x onerror=alert(1)>name",
  "<script>alert(1)</script>name",
  '<a href="javascript:alert(1)">link</a>',
  "<svg><g onload=alert(1)>svg</g></svg>name",
  "<textarea><b>x</b></textarea>",
  "<style>body{}</style>styled",
  "<!-- comment -->visible",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
];

// html5ever parses <noscript> content as text (scripting on), jsdom as markup:
// the results differ but both must be inert
const TEXTS_PARSED_DIFFERENTLY = [
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
];

describe("sanitizeSvg (WebAssembly)", () => {
  it.each(SVG_ATTACKS)("leaves nothing executable: %s", (input) => {
    const out = sanitizeSvg(input);
    expect(leftovers(out, SVG_TAGS)).toEqual([]);
    expect(normalize(purify.sanitize(out, OLD_SVG_CONFIG))).toBe(
      normalize(out),
    );
  });

  it.each(SVG_PREVIEWS)("keeps preview markup: %s", (input) => {
    expect(normalize(sanitizeSvg(input))).toBe(normalize(input));
  });

  it("keeps xlink:href images as href", () => {
    const out = sanitizeSvg(
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="data:image/png;base64,iVBORw0KGgo="/></svg>',
    );
    expect(out).toBe(
      '<svg><image href="data:image/png;base64,iVBORw0KGgo="></image></svg>',
    );
  });

  it("handles a preview with a large embedded image", () => {
    const data = "A".repeat(5 * 1024 * 1024);
    const input = `<svg><image href="data:image/png;base64,${data}" width="1" height="1"/><rect/></svg>`;
    const out = sanitizeSvg(input);
    expect(out).toContain(data);
    expect(sanitizeSvg("<svg><rect/></svg>")).toBe("<svg><rect></rect></svg>");
  });
});

describe("sanitizeText (WebAssembly)", () => {
  it.each(TEXTS)("matches the DOMPurify result: %s", (input) => {
    const out = sanitizeText(input);
    expect(leftovers(out, new Set(OLD_TEXT_CONFIG.ALLOWED_TAGS))).toEqual([]);
    expect(out).toBe(purify.sanitize(input, OLD_TEXT_CONFIG).trim());
  });

  it.each(TEXTS_PARSED_DIFFERENTLY)(
    "leaves nothing executable: %s",
    (input) => {
      const out = sanitizeText(input);
      expect(leftovers(out, new Set(OLD_TEXT_CONFIG.ALLOWED_TAGS))).toEqual([]);
      expect(normalize(purify.sanitize(out, OLD_TEXT_CONFIG))).toBe(
        normalize(out),
      );
    },
  );
});
