import { readFileSync } from "node:fs";
import { join } from "node:path";

const GEIST_REGULAR_FONT_PATH = join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@vercel",
  "og",
  "Geist-Regular.ttf",
);

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN_X = 54;
const PAGE_TOP = 748;
const DEFAULT_FONT_SIZE = 10;
const DEFAULT_LINE_HEIGHT = 16;
const DEFAULT_LINES_PER_PAGE = 42;
const MAX_CID = 0xffff;

type FontTable = {
  offset: number;
  length: number;
};

type ParsedTrueTypeFont = {
  bytes: Buffer;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  glyphForCodePoint: (codePoint: number) => number;
  advanceForGlyph: (glyphId: number) => number;
};

type PdfObject = Buffer | string;

export type DeterministicUnicodePdfInput = {
  /** A nested array is kept together on one page when its wrapped text fits. */
  lines: readonly (string | readonly string[])[];
  fallbackTitle?: string;
  linesPerPage?: number;
};

export type UnsupportedDeterministicPdfGlyph = {
  character: string;
  codePoint: number;
  codePointLabel: string;
};

export class UnsupportedDeterministicPdfGlyphError extends Error {
  readonly unsupported: UnsupportedDeterministicPdfGlyph;

  constructor(unsupported: UnsupportedDeterministicPdfGlyph) {
    super(
      `The bundled proposal font cannot render ${unsupported.codePointLabel} without altering the customer-visible text.`,
    );
    this.name = "UnsupportedDeterministicPdfGlyphError";
    this.unsupported = unsupported;
  }
}

let cachedFont: ParsedTrueTypeFont | null = null;

function readTableDirectory(bytes: Buffer) {
  const tables = new Map<string, FontTable>();
  const tableCount = bytes.readUInt16BE(4);

  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16;
    const tag = bytes.toString("ascii", recordOffset, recordOffset + 4);
    const offset = bytes.readUInt32BE(recordOffset + 8);
    const length = bytes.readUInt32BE(recordOffset + 12);
    if (offset + length > bytes.length) {
      throw new Error(`The bundled proposal font has an invalid ${tag} table.`);
    }
    tables.set(tag, { offset, length });
  }

  return tables;
}

function requireFontTable(tables: Map<string, FontTable>, tag: string) {
  const table = tables.get(tag);
  if (!table) {
    throw new Error(`The bundled proposal font is missing its ${tag} table.`);
  }
  return table;
}

function buildFormat12Mapper(bytes: Buffer, offset: number) {
  const groupCount = bytes.readUInt32BE(offset + 12);
  const groupsOffset = offset + 16;

  return (codePoint: number) => {
    let low = 0;
    let high = groupCount - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const groupOffset = groupsOffset + middle * 12;
      const start = bytes.readUInt32BE(groupOffset);
      const end = bytes.readUInt32BE(groupOffset + 4);
      if (codePoint < start) {
        high = middle - 1;
      } else if (codePoint > end) {
        low = middle + 1;
      } else {
        return bytes.readUInt32BE(groupOffset + 8) + codePoint - start;
      }
    }
    return 0;
  };
}

function buildFormat4Mapper(bytes: Buffer, offset: number) {
  const segmentCount = bytes.readUInt16BE(offset + 6) / 2;
  const endCodesOffset = offset + 14;
  const startCodesOffset = endCodesOffset + segmentCount * 2 + 2;
  const deltasOffset = startCodesOffset + segmentCount * 2;
  const rangeOffsetsOffset = deltasOffset + segmentCount * 2;

  return (codePoint: number) => {
    if (codePoint > 0xffff) {
      return 0;
    }

    for (let index = 0; index < segmentCount; index += 1) {
      const end = bytes.readUInt16BE(endCodesOffset + index * 2);
      if (codePoint > end) {
        continue;
      }
      const start = bytes.readUInt16BE(startCodesOffset + index * 2);
      if (codePoint < start) {
        return 0;
      }
      const delta = bytes.readInt16BE(deltasOffset + index * 2);
      const rangeOffsetAddress = rangeOffsetsOffset + index * 2;
      const rangeOffset = bytes.readUInt16BE(rangeOffsetAddress);
      if (rangeOffset === 0) {
        return (codePoint + delta) & 0xffff;
      }
      const glyphAddress = rangeOffsetAddress + rangeOffset + (codePoint - start) * 2;
      const glyphId = bytes.readUInt16BE(glyphAddress);
      return glyphId === 0 ? 0 : (glyphId + delta) & 0xffff;
    }
    return 0;
  };
}

function parseTrueTypeFont(bytes: Buffer): ParsedTrueTypeFont {
  const tables = readTableDirectory(bytes);
  const head = requireFontTable(tables, "head");
  const hhea = requireFontTable(tables, "hhea");
  const hmtx = requireFontTable(tables, "hmtx");
  const maxp = requireFontTable(tables, "maxp");
  const cmap = requireFontTable(tables, "cmap");
  const unitsPerEm = bytes.readUInt16BE(head.offset + 18);
  const glyphCount = bytes.readUInt16BE(maxp.offset + 4);
  const horizontalMetricCount = bytes.readUInt16BE(hhea.offset + 34);
  const cmapCount = bytes.readUInt16BE(cmap.offset + 2);
  const cmapCandidates: Array<{
    priority: number;
    format: number;
    offset: number;
  }> = [];

  for (let index = 0; index < cmapCount; index += 1) {
    const recordOffset = cmap.offset + 4 + index * 8;
    const platformId = bytes.readUInt16BE(recordOffset);
    const encodingId = bytes.readUInt16BE(recordOffset + 2);
    const subtableOffset = cmap.offset + bytes.readUInt32BE(recordOffset + 4);
    const format = bytes.readUInt16BE(subtableOffset);
    if (format !== 4 && format !== 12) {
      continue;
    }
    const priority =
      format === 12 && platformId === 3 && encodingId === 10
        ? 0
        : format === 12 && platformId === 0
          ? 1
          : format === 4 && platformId === 3
            ? 2
            : 3;
    cmapCandidates.push({ priority, format, offset: subtableOffset });
  }

  const chosenCmap = cmapCandidates.sort((left, right) => left.priority - right.priority)[0];
  if (!chosenCmap) {
    throw new Error("The bundled proposal font has no supported Unicode character map.");
  }
  const glyphForCodePoint =
    chosenCmap.format === 12
      ? buildFormat12Mapper(bytes, chosenCmap.offset)
      : buildFormat4Mapper(bytes, chosenCmap.offset);
  const lastMetricOffset = hmtx.offset + (horizontalMetricCount - 1) * 4;
  const lastAdvance = bytes.readUInt16BE(lastMetricOffset);

  return {
    bytes,
    unitsPerEm,
    ascent: bytes.readInt16BE(hhea.offset + 4),
    descent: bytes.readInt16BE(hhea.offset + 6),
    bbox: [
      bytes.readInt16BE(head.offset + 36),
      bytes.readInt16BE(head.offset + 38),
      bytes.readInt16BE(head.offset + 40),
      bytes.readInt16BE(head.offset + 42),
    ],
    glyphForCodePoint(codePoint) {
      const glyphId = glyphForCodePoint(codePoint);
      return glyphId > 0 && glyphId < glyphCount ? glyphId : 0;
    },
    advanceForGlyph(glyphId) {
      return glyphId < horizontalMetricCount
        ? bytes.readUInt16BE(hmtx.offset + glyphId * 4)
        : lastAdvance;
    },
  };
}

function getFont() {
  if (!cachedFont) {
    cachedFont = parseTrueTypeFont(readFileSync(GEIST_REGULAR_FONT_PATH));
  }
  return cachedFont;
}

function toCodePointLabel(codePoint: number) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isPermittedWhitespace(codePoint: number) {
  return codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
}

export function findUnsupportedDeterministicPdfGlyph(
  values: readonly string[],
): UnsupportedDeterministicPdfGlyph | null {
  const font = getFont();
  for (const value of values) {
    for (const character of value) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (isPermittedWhitespace(codePoint)) {
        continue;
      }
      if (codePoint < 0x20 || codePoint === 0x7f || font.glyphForCodePoint(codePoint) === 0) {
        return {
          character,
          codePoint,
          codePointLabel: toCodePointLabel(codePoint),
        };
      }
    }
  }
  return null;
}

export function assertDeterministicUnicodePdfTextSupported(values: readonly string[]) {
  const unsupported = findUnsupportedDeterministicPdfGlyph(values);
  if (unsupported) {
    throw new UnsupportedDeterministicPdfGlyphError(unsupported);
  }
}

function normalizeVisibleLine(value: string) {
  return value.replace(/\t/g, "    ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function codePointWidth(font: ParsedTrueTypeFont, character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return font.advanceForGlyph(font.glyphForCodePoint(codePoint));
}

function wrapLineByWidth(
  font: ParsedTrueTypeFont,
  value: string,
  maximumWidthInFontUnits: number,
) {
  const characters = Array.from(normalizeVisibleLine(value));
  if (!characters.length) {
    return [""];
  }

  const lines: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let width = 0;
    let end = start;
    let lastWhitespace = -1;
    while (end < characters.length) {
      const nextWidth = codePointWidth(font, characters[end]);
      if (end > start && width + nextWidth > maximumWidthInFontUnits) {
        break;
      }
      width += nextWidth;
      if (/\s/u.test(characters[end])) {
        lastWhitespace = end;
      }
      end += 1;
    }

    if (end < characters.length && lastWhitespace >= start) {
      end = lastWhitespace;
    }
    if (end === start) {
      end += 1;
    }

    lines.push(characters.slice(start, end).join("").trimEnd());
    start = end;
    while (start < characters.length && /\s/u.test(characters[start])) {
      start += 1;
    }
  }

  return lines.length ? lines : [""];
}

function utf16BeHex(codePoint: number) {
  if (codePoint <= 0xffff) {
    return codePoint.toString(16).padStart(4, "0").toUpperCase();
  }
  const normalized = codePoint - 0x10000;
  const high = 0xd800 + (normalized >> 10);
  const low = 0xdc00 + (normalized & 0x3ff);
  return `${high.toString(16).padStart(4, "0")}${low
    .toString(16)
    .padStart(4, "0")}`.toUpperCase();
}

function buildToUnicodeCmap(codePointsByCid: readonly number[]) {
  const entries = codePointsByCid.slice(1).map((codePoint, index) => {
    const cid = index + 1;
    return `<${cid.toString(16).padStart(4, "0").toUpperCase()}> <${utf16BeHex(codePoint)}>`;
  });
  const mappingBlocks: string[] = [];
  for (let index = 0; index < entries.length; index += 100) {
    const block = entries.slice(index, index + 100);
    mappingBlocks.push(`${block.length} beginbfchar\n${block.join("\n")}\nendbfchar`);
  }

  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /WTOSUnicode def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    ...mappingBlocks,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

function buildStreamObject(content: Buffer, extraDictionary = "") {
  const prefix = Buffer.from(
    `<< /Length ${content.length}${extraDictionary ? ` ${extraDictionary}` : ""} >>\nstream\n`,
    "ascii",
  );
  return Buffer.concat([prefix, content, Buffer.from("\nendstream", "ascii")]);
}

function buildPdf(objects: readonly PdfObject[]) {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  let byteLength = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(byteLength);
    const header = Buffer.from(`${index + 1} 0 obj\n`, "ascii");
    const body = typeof object === "string" ? Buffer.from(object, "ascii") : object;
    const footer = Buffer.from("\nendobj\n", "ascii");
    chunks.push(header, body, footer);
    byteLength += header.length + body.length + footer.length;
  });

  const xrefOffset = byteLength;
  const xref = Buffer.from(
    [
      `xref\n0 ${objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      `startxref\n${xrefOffset}`,
      "%%EOF",
      "",
    ].join("\n"),
    "ascii",
  );
  chunks.push(xref);
  return Buffer.concat(chunks);
}

function scaleFontMetric(value: number, unitsPerEm: number) {
  return Math.round((value * 1000) / unitsPerEm);
}

/**
 * Builds a deterministic, extractable Type0/CIDFont PDF using the Geist font
 * already pinned inside Next.js. It never fetches a font or substitutes text.
 */
export function buildDeterministicUnicodeTextPdf({
  lines,
  fallbackTitle = "Document",
  linesPerPage = DEFAULT_LINES_PER_PAGE,
}: DeterministicUnicodePdfInput) {
  if (!Number.isInteger(linesPerPage) || linesPerPage < 1 || linesPerPage > 60) {
    throw new Error("The deterministic PDF line limit must be between 1 and 60.");
  }

  const font = getFont();
  const sourceBlocks = lines.length
    ? lines.map((lineOrBlock) =>
        typeof lineOrBlock === "string" ? [lineOrBlock] : [...lineOrBlock],
      )
    : [[fallbackTitle]];
  const sourceLines = sourceBlocks.flat();
  assertDeterministicUnicodePdfTextSupported([...sourceLines, fallbackTitle]);
  const maximumWidthInFontUnits =
    ((PAGE_WIDTH - PAGE_MARGIN_X * 2) * font.unitsPerEm) / DEFAULT_FONT_SIZE;
  const wrappedBlocks = sourceBlocks.map((block) =>
    block.flatMap((line) =>
      line
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .flatMap((part) => wrapLineByWidth(font, part, maximumWidthInFontUnits)),
    ),
  );
  const pages: string[][] = [];
  let currentPage: string[] = [];
  for (const wrappedBlock of wrappedBlocks) {
    if (
      currentPage.length > 0 &&
      currentPage.length + wrappedBlock.length > linesPerPage
    ) {
      pages.push(currentPage);
      currentPage = [];
    }

    for (let index = 0; index < wrappedBlock.length; index += linesPerPage) {
      const blockPage = wrappedBlock.slice(index, index + linesPerPage);
      if (currentPage.length > 0 && currentPage.length + blockPage.length > linesPerPage) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(...blockPage);
      if (currentPage.length === linesPerPage) {
        pages.push(currentPage);
        currentPage = [];
      }
    }
  }
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  if (!pages.length) {
    pages.push([fallbackTitle]);
  }

  const renderedPages = pages.map((page, index) => [
    ...page,
    "",
    `Page ${index + 1} of ${pages.length}`,
  ]);
  const uniqueCodePoints = new Set<number>();
  for (const line of renderedPages.flat()) {
    for (const character of line) {
      uniqueCodePoints.add(character.codePointAt(0) ?? 0);
    }
  }
  const orderedCodePoints = [...uniqueCodePoints].sort((left, right) => left - right);
  if (orderedCodePoints.length > MAX_CID) {
    throw new Error("The deterministic PDF contains too many unique characters.");
  }
  const codePointsByCid = [0, ...orderedCodePoints];
  const cidByCodePoint = new Map(
    orderedCodePoints.map((codePoint, index) => [codePoint, index + 1]),
  );
  const glyphByCid = codePointsByCid.map((codePoint, cid) =>
    cid === 0 ? 0 : font.glyphForCodePoint(codePoint),
  );
  const widths = glyphByCid.map((glyphId) =>
    scaleFontMetric(font.advanceForGlyph(glyphId), font.unitsPerEm),
  );
  const encodeLine = (line: string) =>
    Array.from(line)
      .map((character) => {
        const cid = cidByCodePoint.get(character.codePointAt(0) ?? 0);
        if (!cid) {
          throw new Error("The deterministic PDF character map is incomplete.");
        }
        return cid.toString(16).padStart(4, "0").toUpperCase();
      })
      .join("");

  const pageObjectIds = renderedPages.map((_, index) => 3 + index * 2);
  const firstFontObjectId = 3 + renderedPages.length * 2;
  const type0FontObjectId = firstFontObjectId;
  const descendantFontObjectId = firstFontObjectId + 1;
  const fontDescriptorObjectId = firstFontObjectId + 2;
  const fontFileObjectId = firstFontObjectId + 3;
  const toUnicodeObjectId = firstFontObjectId + 4;
  const cidToGidObjectId = firstFontObjectId + 5;
  const objects: PdfObject[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${renderedPages.length} >>`,
  ];

  renderedPages.forEach((pageLines, pageIndex) => {
    const pageObjectId = pageObjectIds[pageIndex];
    const contentObjectId = pageObjectId + 1;
    const content = Buffer.from(
      [
        "% WTOS-TEXT-BEGIN",
        "BT",
        `/F1 ${DEFAULT_FONT_SIZE} Tf`,
        `${PAGE_MARGIN_X} ${PAGE_TOP} Td`,
        ...pageLines.flatMap((line, index) => [
          ...(index ? [`0 -${DEFAULT_LINE_HEIGHT} Td`] : []),
          `<${encodeLine(line)}> Tj`,
        ]),
        "ET",
        "% WTOS-TEXT-END",
      ].join("\n"),
      "ascii",
    );
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${type0FontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      buildStreamObject(content),
    );
  });

  const widthEntries = widths
    .slice(1)
    .map((width, index) => `${index + 1} [${width}]`)
    .join(" ");
  const cidToGid = Buffer.alloc(glyphByCid.length * 2);
  glyphByCid.forEach((glyphId, cid) => cidToGid.writeUInt16BE(glyphId, cid * 2));
  const [xMin, yMin, xMax, yMax] = font.bbox.map((metric) =>
    scaleFontMetric(metric, font.unitsPerEm),
  );
  const ascent = scaleFontMetric(font.ascent, font.unitsPerEm);
  const descent = scaleFontMetric(font.descent, font.unitsPerEm);
  const toUnicode = Buffer.from(buildToUnicodeCmap(codePointsByCid), "ascii");

  objects.push(
    `<< /Type /Font /Subtype /Type0 /BaseFont /Geist-Regular /Encoding /Identity-H /DescendantFonts [${descendantFontObjectId} 0 R] /ToUnicode ${toUnicodeObjectId} 0 R >>`,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Geist-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fontDescriptorObjectId} 0 R /DW 1000 /W [${widthEntries}] /CIDToGIDMap ${cidToGidObjectId} 0 R >>`,
    `<< /Type /FontDescriptor /FontName /Geist-Regular /Flags 32 /FontBBox [${xMin} ${yMin} ${xMax} ${yMax}] /ItalicAngle 0 /Ascent ${ascent} /Descent ${descent} /CapHeight ${ascent} /StemV 80 /FontFile2 ${fontFileObjectId} 0 R >>`,
    buildStreamObject(font.bytes, `/Length1 ${font.bytes.length}`),
    buildStreamObject(toUnicode),
    buildStreamObject(cidToGid),
  );

  return buildPdf(objects);
}

/** Decodes text from PDFs emitted by buildDeterministicUnicodeTextPdf in tests. */
export function extractDeterministicUnicodePdfTextForTesting(content: Buffer) {
  const source = content.toString("latin1");
  const cidToText = new Map<number, string>();
  for (const match of source.matchAll(/<([0-9A-F]{4})> <([0-9A-F]{4}|[0-9A-F]{8})>/g)) {
    const cid = Number.parseInt(match[1], 16);
    const utf16 = Buffer.from(match[2], "hex");
    const littleEndian = Buffer.alloc(utf16.length);
    for (let index = 0; index < utf16.length; index += 2) {
      littleEndian[index] = utf16[index + 1];
      littleEndian[index + 1] = utf16[index];
    }
    cidToText.set(cid, littleEndian.toString("utf16le"));
  }

  const lines: string[] = [];
  for (const block of source.matchAll(/% WTOS-TEXT-BEGIN\n([\s\S]*?)\n% WTOS-TEXT-END/g)) {
    for (const text of block[1].matchAll(/<([0-9A-F]*)> Tj/g)) {
      let decoded = "";
      for (let offset = 0; offset < text[1].length; offset += 4) {
        const cid = Number.parseInt(text[1].slice(offset, offset + 4), 16);
        const character = cidToText.get(cid);
        if (character === undefined) {
          throw new Error("The deterministic PDF test character map is incomplete.");
        }
        decoded += character;
      }
      lines.push(decoded);
    }
  }
  return lines;
}
