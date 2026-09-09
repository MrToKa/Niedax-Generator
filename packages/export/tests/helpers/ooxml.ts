import { inflateRawSync } from "node:zlib";
import { posix } from "node:path";

/** Independent ZIP/OOXML reader, deliberately not using ExcelJS or its ZIP parser.
 * Supports the bounded, non-ZIP64 stored/deflated parts used by this renderer. */
export function readParts(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65_557) && buffer.readUInt32LE(end) !== 0x06054b50)
    end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw new Error("Missing ZIP directory");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const parts = new Map<string, string>();
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP directory record");
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const expandedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (parts.has(name) || name.includes("..") || name.startsWith("/"))
      throw new Error("Invalid ZIP part name");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error("Invalid ZIP local record");
    const dataStart =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const expanded = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
    if (expanded === null || expanded.length !== expandedSize)
      throw new Error("Unsupported or damaged ZIP part");
    let crc = 0xffffffff;
    for (const byte of expanded) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== expectedCrc) throw new Error("ZIP CRC mismatch");
    parts.set(name, expanded.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  for (const [name, xml] of parts) {
    if (!name.endsWith(".rels")) continue;
    for (const relationship of xml.matchAll(/<Relationship\s+([^>]+)\/?\s*>/gu)) {
      const attributes = attrs(relationship[1]!);
      if (attributes["TargetMode"] === "External")
        throw new Error("External relationship is forbidden");
      const target = attributes["Target"]!;
      const base = name === "_rels/.rels" ? "" : posix.dirname(posix.dirname(name));
      const resolved = target.startsWith("/")
        ? target.slice(1)
        : posix.normalize(posix.join(base, target));
      if (!parts.has(resolved)) throw new Error(`Unresolved OOXML relationship: ${resolved}`);
    }
  }
  return parts;
}

function decode(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/gu, (entity) => {
    if (entity.startsWith("&#x"))
      return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16));
    if (entity.startsWith("&#"))
      return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10));
    return (
      { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" } as Record<
        string,
        string
      >
    )[entity]!;
  });
}

export function attrs(value: string): Record<string, string> {
  return Object.fromEntries(
    [...value.matchAll(/([\w:]+)="([^"]*)"/gu)].map((match) => [match[1], decode(match[2]!)])
  );
}

export interface XmlCell {
  value: string | number | null;
  formula: string | null;
  type: string;
  style: number;
}

export function readCells(
  parts: ReadonlyMap<string, string>,
  sheetNumber: number
): Map<string, XmlCell> {
  const shared = [
    ...(parts.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/gu)
  ].map((item) =>
    [...item[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
      .map((text) => decode(text[1]!))
      .join("")
  );
  const xml = parts.get(`xl/worksheets/sheet${sheetNumber}.xml`)!;
  const cells = new Map<string, XmlCell>();
  for (const match of xml.matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
    const attributes = attrs(match[1]!);
    const body = match[2] ?? "";
    const raw = /<v>([\s\S]*?)<\/v>/u.exec(body)?.[1];
    const type = attributes["t"] ?? "n";
    const formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/u.exec(body)?.[1];
    cells.set(attributes["r"]!, {
      value:
        raw === undefined
          ? null
          : type === "s"
            ? shared[Number(raw)]!
            : type === "n"
              ? Number(raw)
              : decode(raw),
      formula: formula === undefined ? null : decode(formula),
      type,
      style: Number(attributes["s"] ?? 0)
    });
  }
  return cells;
}
