//! HTML/SVG sanitizer of the backend: ammonia (html5ever, the HTML parser of
//! Servo) compiled to WebAssembly. It replaces DOMPurify on jsdom, which kept
//! about 40 MB of the backend heap alive just to parse previews and names.

use ammonia::Builder;
use std::collections::{HashMap, HashSet};

const SVG_TAGS: &[&str] = &[
    "svg", "defs", "pattern", "g", "image", "symbol", "use", "clipPath", "mask", "rect", "circle",
    "ellipse", "line", "polyline", "polygon", "path", "text", "tspan",
];

// "xlink:href" is matched by its local name "href"
const SVG_ATTRS: &[&str] = &[
    "xmlns", "version", "id", "viewBox", "preserveAspectRatio", "x", "y", "width", "height", "cx",
    "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "d", "fill", "fill-opacity",
    "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
    "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "transform",
    "clip-path", "mask", "clipPathUnits", "maskUnits", "maskContentUnits", "vector-effect",
    "patternUnits", "patternContentUnits", "font-size", "font-family", "font-weight",
    "letter-spacing", "text-anchor", "dominant-baseline", "href",
];

const TEXT_TAGS: &[&str] = &["b", "i", "u", "em", "strong", "br", "span"];

// elements whose content is dropped with them, as FORBID_CONTENTS of DOMPurify
const DROP_CONTENT: &[&str] = &[
    "script", "style", "template", "title", "noscript", "noembed", "noframes", "iframe", "xmp",
    "plaintext", "math", "svg", "desc", "foreignObject", "annotation-xml", "audio", "video",
    "head", "colgroup", "thead", "mi", "mn", "mo", "ms", "mtext",
];

fn set(items: &[&'static str]) -> HashSet<&'static str> {
    items.iter().copied().collect()
}

pub fn sanitize_svg(input: &str) -> String {
    let mut drop_content = set(DROP_CONTENT);
    for tag in SVG_TAGS {
        drop_content.remove(tag);
    }
    Builder::empty()
        .tags(set(SVG_TAGS))
        .tag_attributes(HashMap::new())
        .generic_attributes(set(SVG_ATTRS))
        .generic_attribute_prefixes(HashSet::new())
        // no absolute URLs: safe data URLs arrive as /api/files/ placeholders
        .url_schemes(HashSet::new())
        .link_rel(None)
        .strip_comments(true)
        .clean_content_tags(drop_content)
        .clean(input)
        .to_string()
        .trim()
        .to_string()
}

pub fn sanitize_text(input: &str) -> String {
    Builder::empty()
        .tags(set(TEXT_TAGS))
        .tag_attributes(HashMap::new())
        .generic_attributes(HashSet::new())
        .generic_attribute_prefixes(HashSet::new())
        .link_rel(None)
        .strip_comments(true)
        .clean_content_tags(set(DROP_CONTENT))
        .clean(input)
        .to_string()
        .trim()
        .to_string()
}

// WebAssembly ABI: the host writes UTF-8 into alloc(len), calls sanitize(kind, ptr, len) and
// reads the result at out_ptr()/out_len(). The host creates a fresh instance per call, so a
// large input does not leave its grown linear memory behind.
static mut OUT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// kind 0 sanitizes an SVG document, kind 1 a short text such as a name
///
/// # Safety
/// `ptr` and `len` must describe memory returned by `alloc`.
#[no_mangle]
pub unsafe extern "C" fn sanitize(kind: u32, ptr: *mut u8, len: usize) {
    let bytes = Vec::from_raw_parts(ptr, len, len);
    let input = String::from_utf8_lossy(&bytes);
    let out = if kind == 0 { sanitize_svg(&input) } else { sanitize_text(&input) };
    *std::ptr::addr_of_mut!(OUT) = out.into_bytes();
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() }
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    unsafe { (*std::ptr::addr_of!(OUT)).len() }
}
