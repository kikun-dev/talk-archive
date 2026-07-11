import { MY_NAME_PLACEHOLDER } from "@/types/domain";

export function replaceMyNamePlaceholder(
  text: string,
  displayName: string,
): string {
  if (displayName.length === 0) return text;
  return text.replaceAll(MY_NAME_PLACEHOLDER, displayName);
}

export type TextSegment = { type: "text" | "url"; value: string };

// URL 末尾に付きがちな句読点・記号は URL に含めず、後続のテキストへ戻す
const TRAILING_PUNCTUATION = /[。、）」！？!?,.;:)]+$/;

const URL_PATTERN = /https?:\/\/\S+/g;

export function splitTextByUrls(text: string): TextSegment[] {
  if (text.length === 0) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchStart = match.index;
    let rawUrl = match[0];

    const trailingMatch = rawUrl.match(TRAILING_PUNCTUATION);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    if (trailing.length > 0) {
      rawUrl = rawUrl.slice(0, rawUrl.length - trailing.length);
    }

    if (rawUrl.length === 0) continue;

    if (matchStart > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, matchStart) });
    }
    segments.push({ type: "url", value: rawUrl });

    lastIndex = matchStart + rawUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}
