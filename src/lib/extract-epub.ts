import JSZip from "jszip";

import { ExtractError } from "@/lib/extract-error";

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "section",
  "article",
  "tr",
  "figcaption",
  "header",
  "footer",
]);

function elementsByLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter(
    (element) => element.localName === localName,
  );
}

function parseXml(xml: string, fileName: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new ExtractError(`“${fileName}” is not a readable EPUB.`);
  }
  return doc;
}

function zipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveZipPath(baseDir: string, href: string): string {
  const cleaned = decodeURIComponent(href.split("#")[0]?.split("?")[0] ?? href);
  const combined = `${baseDir}${cleaned}`;
  const parts: string[] = [];
  for (const part of zipPath(combined).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function findZipFile(zip: JSZip, path: string) {
  const normalized = zipPath(path);
  const direct = zip.file(normalized);
  if (direct && !direct.dir) return direct;
  const lower = normalized.toLowerCase();
  const match = Object.keys(zip.files).find(
    (key) => !zip.files[key].dir && zipPath(key).toLowerCase() === lower,
  );
  return match ? zip.file(match) : null;
}

type TocTarget = {
  title: string;
  path: string;
  fragment: string;
  depth: number;
  used: boolean;
};

function cleanTitle(value: string): string {
  return value
    .replace(/[\u0001\u0002]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function htmlToText(markup: string, targets: TocTarget[]): string {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  doc.querySelectorAll("script, style, noscript, svg").forEach((node) => {
    node.remove();
  });
  const chunks: string[] = [];
  let emittedText = false;
  const useToc = targets.length > 0;

  const mark = (fragment: string) => {
    for (const target of targets) {
      if (target.used || target.fragment !== fragment) continue;
      const title = cleanTitle(target.title);
      if (!title) continue;
      chunks.push(`\u0001${target.depth}\u0002${title}\u0001`);
      target.used = true;
    }
  };

  mark("");

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (value.trim()) emittedText = true;
      chunks.push(value);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const name = element.tagName.toLowerCase();
    if (name === "br") {
      chunks.push("\n");
      return;
    }
    const id = element.getAttribute("id");
    if (id) mark(decodeURIComponent(id));
    const heading = name === "h1" || name === "h2";
    const block = BLOCK_TAGS.has(name);
    if (heading) {
      const title = cleanTitle(element.textContent ?? "");
      if (!useToc && title) {
        if (emittedText) chunks.push("\f");
        const depth = name === "h1" ? 0 : 1;
        chunks.push(`\u0001${depth}\u0002${title}\u0001`);
      } else if (useToc && emittedText) {
        chunks.push("\f");
      }
    } else if (block) {
      chunks.push("\n\n");
    }
    for (const child of element.childNodes) walk(child);
    if (block || heading) chunks.push("\n\n");
  };
  if (doc.body) walk(doc.body);
  const text = chunks
    .join("")
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]*\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*\f[ \t]*/g, "\f")
    .replace(/\n*\f\n*/g, "\f")
    .replace(/\f{2,}/g, "\f")
    .replace(/^\f+/, "")
    .trim();
  if (useToc && !targets.some((target) => target.used)) {
    return htmlToText(markup, []);
  }
  return text;
}

function childByLocalName(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find(
    (child) => child.localName?.toLowerCase() === localName,
  );
}

function tocTarget(
  href: string,
  title: string,
  baseDir: string,
  depth: number,
): TocTarget | null {
  const cleaned = cleanTitle(title);
  if (!href || !cleaned || href.startsWith("http")) return null;
  const [path, fragment = ""] = href.split("#");
  return {
    title: cleaned,
    path: resolveZipPath(baseDir, path ?? ""),
    fragment: decodeURIComponent(fragment),
    depth,
    used: false,
  };
}

function tocFromNav(doc: Document, navDir: string): TocTarget[] {
  const navs = elementsByLocalName(doc, "nav");
  const tocNav =
    navs.find((nav) =>
      (nav.getAttribute("epub:type") ?? nav.getAttribute("type") ?? "")
        .split(/\s+/)
        .includes("toc"),
    ) ?? navs[0];
  if (!tocNav) return [];
  const targets: TocTarget[] = [];
  const walk = (element: Element, depth: number) => {
    for (const child of Array.from(element.children)) {
      const name = child.localName.toLowerCase();
      if (name === "li") {
        const link = Array.from(child.children).find(
          (node) => node.localName.toLowerCase() === "a",
        );
        if (link) {
          const target = tocTarget(
            link.getAttribute("href") ?? "",
            link.textContent ?? "",
            navDir,
            depth,
          );
          if (target) targets.push(target);
        }
        for (const nested of Array.from(child.children)) {
          const nestedName = nested.localName.toLowerCase();
          if (nestedName === "ol" || nestedName === "ul") walk(nested, depth + 1);
        }
      } else if (name === "ol" || name === "ul" || name === "nav") {
        walk(child, depth);
      }
    }
  };
  walk(tocNav, 0);
  return targets;
}

function tocFromNcx(doc: Document, ncxDir: string): TocTarget[] {
  const map = elementsByLocalName(doc, "navmap")[0] ?? doc.documentElement;
  const collect = (element: Element, depth: number): TocTarget[] => {
    const targets: TocTarget[] = [];
    for (const child of Array.from(element.children)) {
      if (child.localName.toLowerCase() !== "navpoint") continue;
      const label = childByLocalName(child, "navlabel");
      const content = childByLocalName(child, "content");
      const target = tocTarget(
        content?.getAttribute("src") ?? "",
        label?.textContent ?? "",
        ncxDir,
        depth,
      );
      if (target) targets.push(target);
      targets.push(...collect(child, depth + 1));
    }
    return targets;
  };
  return collect(map, 0);
}

function isHtmlItem(href: string, mediaType: string): boolean {
  const type = mediaType.toLowerCase();
  const path = href.split("#")[0]?.split("?")[0] ?? href;
  if (type.includes("html")) return true;
  return /\.x?html?$/i.test(path);
}

export async function extractEpubText(
  data: ArrayBuffer,
  fileName: string,
): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new ExtractError(`“${fileName}” is not a readable EPUB.`);
  }

  const containerFile = findZipFile(zip, "META-INF/container.xml");
  if (!containerFile) {
    throw new ExtractError(`“${fileName}” is not a readable EPUB.`);
  }

  const container = parseXml(await containerFile.async("string"), fileName);
  const rootfile = elementsByLocalName(container, "rootfile")[0];
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) {
    throw new ExtractError(`“${fileName}” is not a readable EPUB.`);
  }

  const opfFile = findZipFile(zip, opfPath);
  if (!opfFile) {
    throw new ExtractError(`“${fileName}” is not a readable EPUB.`);
  }

  const opf = parseXml(await opfFile.async("string"), fileName);
  const opfDir = opfPath.includes("/")
    ? `${zipPath(opfPath).slice(0, zipPath(opfPath).lastIndexOf("/") + 1)}`
    : "";

  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const item of elementsByLocalName(opf, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      mediaType: item.getAttribute("media-type") ?? "",
    });
  }

  const spine = elementsByLocalName(opf, "itemref")
    .map((item) => item.getAttribute("idref"))
    .filter((id): id is string => Boolean(id));

  if (spine.length === 0) {
    throw new ExtractError(`“${fileName}” has no readable chapters.`);
  }

  const spineElement = elementsByLocalName(opf, "spine")[0];
  const tocId = spineElement?.getAttribute("toc");
  let toc: TocTarget[] = [];
  const ncxEntry = [...manifest.entries()].find(
    ([id, item]) =>
      item.mediaType === "application/x-dtbncx+xml" ||
      (tocId != null && id === tocId && item.href.toLowerCase().endsWith(".ncx")),
  );
  if (ncxEntry) {
    const ncxPath = resolveZipPath(opfDir, ncxEntry[1].href);
    const ncxFile = findZipFile(zip, ncxPath);
    if (ncxFile) {
      const ncx = parseXml(await ncxFile.async("string"), fileName);
      const ncxDir = ncxPath.includes("/")
        ? ncxPath.slice(0, ncxPath.lastIndexOf("/") + 1)
        : "";
      toc = tocFromNcx(ncx, ncxDir);
    }
  }
  if (toc.length === 0) {
    const navEntry = [...manifest.entries()].find(([, item]) =>
      item.href.toLowerCase().includes("nav."),
    );
    const navByProperties = elementsByLocalName(opf, "item").find((item) =>
      (item.getAttribute("properties") ?? "").split(/\s+/).includes("nav"),
    );
    const navHref = navByProperties?.getAttribute("href") ?? navEntry?.[1].href;
    if (navHref) {
      const navPath = resolveZipPath(opfDir, navHref);
      const navFile = findZipFile(zip, navPath);
      if (navFile) {
        const nav = new DOMParser().parseFromString(
          await navFile.async("string"),
          "text/html",
        );
        const navDir = navPath.includes("/")
          ? navPath.slice(0, navPath.lastIndexOf("/") + 1)
          : "";
        toc = tocFromNav(nav, navDir);
      }
    }
  }

  const chapters: string[] = [];
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item || !isHtmlItem(item.href, item.mediaType)) continue;
    const chapterPath = resolveZipPath(opfDir, item.href);
    const chapterFile = findZipFile(zip, chapterPath);
    if (!chapterFile) continue;
    const targets = toc.filter(
      (target) => target.path.toLowerCase() === chapterPath.toLowerCase(),
    );
    const text = htmlToText(await chapterFile.async("string"), targets);
    if (text) chapters.push(text);
  }

  if (chapters.length === 0) {
    throw new ExtractError(`“${fileName}” has no readable chapters.`);
  }

  return chapters.join("\f");
}
