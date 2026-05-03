import type {
  ActivityTimelineRow,
  DeveloperGlobalRow,
  FileGlobalRow,
  WeeklyRecap,
} from "../types";

export type ReportExportFormat = "csv" | "pdf" | "pptx";
export type ReportExportType = "dashboard" | "code_health" | "weekly";

export interface ReportExportInput {
  reportType: ReportExportType;
  reportLabel: string;
  scopeLabel: string;
  fromDate: string;
  toDate: string;
  markdown: string;
  developers: DeveloperGlobalRow[];
  activity: ActivityTimelineRow[];
  files: FileGlobalRow[];
  weeklyRecap: WeeklyRecap | null;
}

const MIME_TYPES: Record<ReportExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function periodSlug(input: ReportExportInput): string {
  return `${input.fromDate}-${input.toDate}`.replace(/[^0-9a-z-]+/gi, "-");
}

function reportTypeSlug(input: ReportExportInput): string {
  return input.reportType.replace(/_/g, "-");
}

export function reportExportFilename(
  input: ReportExportInput,
  format: ReportExportFormat,
): string {
  return `gitpulse-${reportTypeSlug(input)}-${periodSlug(input)}.${format}`;
}

function periodLabel(input: ReportExportInput): string {
  if (input.fromDate === "0001-01-01" && input.toDate === "9999-12-31") {
    return "All time";
  }
  return `${input.fromDate} to ${input.toDate}`;
}

function hotspotScore(file: FileGlobalRow): number {
  return file.churn_score + file.co_touch_score;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(",");
}

export function buildReportCsv(input: ReportExportInput): string {
  const rows: string[][] = [
    ["section", "metric", "value", "extra"],
    ["meta", "report", input.reportLabel, ""],
    ["meta", "scope", input.scopeLabel, ""],
    ["meta", "period", periodLabel(input), ""],
  ];

  if (input.weeklyRecap != null) {
    rows.push(
      ["weekly", "week", `${input.weeklyRecap.week_start} to ${input.weeklyRecap.week_end}`, ""],
      ["weekly", "commits", String(input.weeklyRecap.commits), ""],
      ["weekly", "insertions", String(input.weeklyRecap.insertions), ""],
      ["weekly", "deletions", String(input.weeklyRecap.deletions), ""],
      ["weekly", "active days", String(input.weeklyRecap.active_days), ""],
      [
        "weekly",
        "top developer",
        input.weeklyRecap.top_developer_name ?? "",
        `${input.weeklyRecap.top_developer_commits} commits`,
      ],
      [
        "weekly",
        "top file",
        input.weeklyRecap.top_file_path ?? "",
        `${input.weeklyRecap.top_file_commits} commits`,
      ],
    );
  }

  input.activity.forEach((row) => {
    rows.push([
      "activity",
      row.date,
      String(row.commits),
      `${row.insertions} insertions / ${row.deletions} deletions / ${row.files_touched} files`,
    ]);
  });

  input.developers.forEach((developer) => {
    rows.push([
      "developer",
      developer.developer_name,
      String(developer.total_commits),
      `${developer.total_insertions} insertions / ${developer.total_deletions} deletions`,
    ]);
  });

  input.files.forEach((file) => {
    rows.push([
      "file",
      file.file_path,
      String(file.commit_count),
      `${hotspotScore(file).toFixed(1)} hotspot`,
    ]);
  });

  rows.push(["markdown", "body", input.markdown, ""]);

  return `${rows.map(csvRow).join("\n")}\n`;
}

function reportTitle(input: ReportExportInput): string {
  const firstHeading = input.markdown
    .split(/\r?\n/)
    .find((line) => line.startsWith("# "));
  return firstHeading?.replace(/^#\s+/, "").trim() || `GitPulse ${input.reportLabel} Report`;
}

function exportLines(input: ReportExportInput): string[] {
  const markdownLines = input.markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 32);

  return [
    reportTitle(input),
    `${input.reportLabel} | ${input.scopeLabel} | ${periodLabel(input)}`,
    "",
    ...markdownLines,
  ];
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxLength = 92): string[] {
  if (line.length <= maxLength) return [line];

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
}

export function buildReportPdfBytes(input: ReportExportInput): Uint8Array {
  const encoder = new TextEncoder();
  const lines = exportLines(input).flatMap((line) => wrapLine(line)).slice(0, 42);
  const content = [
    "BT",
    "/F1 18 Tf",
    "50 780 Td",
    ...lines.flatMap((line, index) => [
      `(${escapePdfText(line)}) Tj`,
      index === 0 ? "/F1 11 Tf" : "",
      "0 -18 Td",
    ]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((body, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(pdf);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraph(line: string, fontSize: number): string {
  return [
    "<a:p>",
    "<a:r>",
    `<a:rPr lang="en-US" sz="${fontSize}"/>`,
    `<a:t>${xmlEscape(line)}</a:t>`,
    "</a:r>",
    "</a:p>",
  ].join("");
}

function textShape(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  lines: string[],
  fontSize: number,
): string {
  return [
    "<p:sp>",
    "<p:nvSpPr>",
    `<p:cNvPr id="${id}" name="${xmlEscape(name)}"/>`,
    "<p:cNvSpPr txBox=\"1\"/>",
    "<p:nvPr/>",
    "</p:nvSpPr>",
    "<p:spPr>",
    `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`,
    "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom>",
    "<a:noFill/>",
    "</p:spPr>",
    "<p:txBody>",
    "<a:bodyPr wrap=\"square\"/>",
    "<a:lstStyle/>",
    ...lines.map((line) => paragraph(line, fontSize)),
    "</p:txBody>",
    "</p:sp>",
  ].join("");
}

function buildSlideXml(input: ReportExportInput): string {
  const lines = exportLines(input);
  const title = lines[0] ?? reportTitle(input);
  const body = lines.slice(1).flatMap((line) => wrapLine(line, 72)).slice(0, 18);

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" ",
    "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" ",
    "xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\">",
    "<p:cSld><p:spTree>",
    "<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>",
    "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/>",
    "<a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>",
    textShape(2, "Title", 457200, 457200, 8229600, 914400, [title], 2800),
    textShape(3, "Report body", 457200, 1371600, 8229600, 4572000, body, 1500),
    "</p:spTree></p:cSld>",
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>",
    "</p:sld>",
  ].join("");
}

function pptxFiles(input: ReportExportInput): Array<{ name: string; data: string }> {
  return [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/app.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>GitPulse</Application>
  <PresentationFormat>On-screen Show (16:9)</PresentationFormat>
  <Slides>1</Slides>
</Properties>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${xmlEscape(reportTitle(input))}</dc:title>
  <dc:creator>GitPulse</dc:creator>
</cp:coreProperties>`,
    },
    {
      name: "ppt/presentation.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
    },
    {
      name: "ppt/slides/slide1.xml",
      data: buildSlideXml(input),
    },
  ];
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function createZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const checksum = crc32(file.data);

    const localHeader = new Uint8Array(30);
    const local = new DataView(localHeader.buffer);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, file.data.length);
    writeUint32(local, 22, file.data.length);
    writeUint16(local, 26, name.length);
    writeUint16(local, 28, 0);

    localParts.push(localHeader, name, file.data);

    const centralHeader = new Uint8Array(46);
    const central = new DataView(centralHeader.buffer);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, file.data.length);
    writeUint32(central, 24, file.data.length);
    writeUint16(central, 28, name.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + file.data.length;
  });

  const localBytes = concatBytes(localParts);
  const centralBytes = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralBytes.length);
  writeUint32(endView, 16, localBytes.length);
  writeUint16(endView, 20, 0);

  return concatBytes([localBytes, centralBytes, end]);
}

export function buildReportPptxBytes(input: ReportExportInput): Uint8Array {
  const encoder = new TextEncoder();
  return createZip(
    pptxFiles(input).map((file) => ({
      name: file.name,
      data: encoder.encode(file.data),
    })),
  );
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function reportBlob(input: ReportExportInput, format: ReportExportFormat): Blob {
  if (format === "csv") {
    return new Blob([buildReportCsv(input)], { type: MIME_TYPES.csv });
  }

  if (format === "pdf") {
    return new Blob([bytesToArrayBuffer(buildReportPdfBytes(input))], {
      type: MIME_TYPES.pdf,
    });
  }

  return new Blob([bytesToArrayBuffer(buildReportPptxBytes(input))], {
    type: MIME_TYPES.pptx,
  });
}

export function downloadReportFile(
  input: ReportExportInput,
  format: ReportExportFormat,
) {
  const blob = reportBlob(input, format);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportExportFilename(input, format);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
