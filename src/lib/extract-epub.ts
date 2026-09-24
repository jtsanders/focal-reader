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

function htmlToText(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  doc.querySelectorAll("script, style, noscript, svg").forEach((node) => {
    node.remove();
  });
  const chunks: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      chunks.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const name = element.tagName.toLowerCase();
    if (name === "br") {
      chunks.push("\n");
      return;
    }
    const block = BLOCK_TAGS.has(name);
    if (block) chunks.push("\n");
    for (const child of element.childNodes) walk(child);
    if (block) chunks.push("\n");
  };
  if (doc.body) walk(doc.body);
  return chunks
    .join("")
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
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

  const chapters: string[] = [];
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (!item || !isHtmlItem(item.href, item.mediaType)) continue;
    const chapterFile = findZipFile(zip, resolveZipPath(opfDir, item.href));
    if (!chapterFile) continue;
    const text = htmlToText(await chapterFile.async("string"));
    if (text) chapters.push(text);
  }

  if (chapters.length === 0) {
    throw new ExtractError(`“${fileName}” has no readable chapters.`);
  }

  return chapters.join("\n");
}
