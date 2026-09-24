import { cpSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pdfjs = join(root, "node_modules/pdfjs-dist");
const publicDir = join(root, "public");

mkdirSync(publicDir, { recursive: true });
copyFileSync(
  join(pdfjs, "build/pdf.worker.min.mjs"),
  join(publicDir, "pdf.worker.min.mjs"),
);
cpSync(join(pdfjs, "cmaps"), join(publicDir, "cmaps"), { recursive: true });
cpSync(join(pdfjs, "standard_fonts"), join(publicDir, "standard_fonts"), {
  recursive: true,
});
