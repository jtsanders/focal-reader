import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "fixtures");

function escapePdf(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pageStream(lines) {
  const commands = ["BT", "/F1 16 Tf", "72 720 Td"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -28 Td");
    commands.push(`(${escapePdf(line)}) Tj`);
  });
  commands.push("ET");
  return commands.join("\n");
}

function buildPdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const contentIds = [];
  for (const lines of pages) {
    const stream = pageStream(lines);
    contentIds.push(
      add(
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
      ),
    );
    pageIds.push(add(""));
  }
  const pagesId = add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );
  for (let i = 0; i < pageIds.length; i += 1) {
    objects[pageIds[i] - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const longToken = "SupercalifragilisticexpialidociousReadingToken";

const pdf = buildPdf([
  [
    "This fixture PDF opens with a harbor note.",
    "The word reading should keep its red letter still.",
    "Page one comes before page two.",
  ],
  [
    "The second page follows in reading order.",
    "A long token sits here.",
    longToken,
    "and then ends.",
    "Hello, fixture.",
  ],
]);

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">fixture-ferry</dc:identifier>
    <dc:title>Fixture Ferry</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="harbor" href="harbor.xhtml" media-type="application/xhtml+xml"/>
    <item id="crossing" href="crossing.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="harbor"/>
    <itemref idref="crossing"/>
  </spine>
</package>
`;

const harbor = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Harbor</title>
    <style>body { color: red; }</style>
  </head>
  <body>
    <h1>Harbor</h1>
    <p>The harbor chapter comes first in the spine.</p>
    <script>alert("do not read this script")</script>
    <p>Hello, harbor.</p>
  </body>
</html>
`;

const crossing = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Crossing</title></head>
  <body>
    <h1>Crossing</h1>
    <p>The crossing chapter comes second, after the harbor.</p>
    <p>A red letter holds the word reading still.</p>
  </body>
</html>
`;

mkdirSync(fixtures, { recursive: true });
writeFileSync(join(fixtures, "harbor-note.pdf"), pdf);

const zip = new JSZip();
zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
zip.file("META-INF/container.xml", container);
zip.file("OEBPS/content.opf", opf);
zip.file("OEBPS/harbor.xhtml", harbor);
zip.file("OEBPS/crossing.xhtml", crossing);
zip.file("OEBPS/style.css", "body { font-family: serif; }");

const epub = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});
writeFileSync(join(fixtures, "ferry-note.epub"), epub);
