import { describe, it, expect, vi, afterEach } from "vitest";
import PostalMime from "postal-mime";
import {
  parseEmlFile,
  toTalkImportRecord,
  EmlImportError,
  MAX_EML_FILE_SIZE,
  MAX_EML_FILE_COUNT,
  MAX_EML_TOTAL_SIZE,
  type ParsedEmlMessage,
} from "./emlImportUseCases";

// --- テスト用 .eml フィクスチャビルダー ---
// 実サンプル（.tmp/*.eml、コミット禁止）と同じ構造
// （multipart/alternative + base64 UTF-8）を自作の架空データで再現する

function base64Utf8(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

type AttachmentFixture = {
  filename: string;
  mimeType: string;
  data: Buffer;
  disposition?: "inline" | "attachment";
};

function buildAlternativeEml(options: {
  from?: string;
  subject?: string;
  date?: string;
  textBody?: string | null;
  htmlBody?: string | null;
  attachments?: AttachmentFixture[];
}): string {
  // 明示的に `from: undefined` を渡してヘッダ自体を省略するテストがあるため、
  // 分割代入のデフォルト値（undefined と「未指定」を区別できない）ではなく
  // キーの有無で判定する
  const from = "from" in options ? options.from : '"差出人" <sender@example.com>';
  const subject =
    "subject" in options
      ? options.subject
      : "=?utf-8?B?" + base64Utf8("テスト件名") + "?=";
  const date = "date" in options ? options.date : "Mon, 12 Oct 2020 06:16:14 +0000";
  const {
    textBody = "こんにちは、これはテスト本文です。",
    htmlBody = "<p>こんにちは、これは<b>テスト</b>本文です。</p>",
    attachments = [],
  } = options;

  const altParts: string[] = [];
  if (textBody !== null) {
    altParts.push(
      [
        "--ALT",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: base64",
        "",
        base64Utf8(textBody),
        "",
      ].join("\r\n"),
    );
  }
  if (htmlBody !== null) {
    altParts.push(
      [
        "--ALT",
        'Content-Type: text/html; charset="utf-8"',
        "Content-Transfer-Encoding: base64",
        "",
        base64Utf8(htmlBody),
        "",
      ].join("\r\n"),
    );
  }
  const alternativeBlock = [
    'Content-Type: multipart/alternative; boundary="ALT"',
    "",
    ...altParts,
    "--ALT--",
    "",
  ].join("\r\n");

  const headers: string[] = [];
  if (from !== undefined) headers.push(`From: ${from}`);
  headers.push("To: recipient@example.com");
  if (subject !== undefined) headers.push(`Subject: ${subject}`);
  if (date !== undefined) headers.push(`Date: ${date}`);
  headers.push("MIME-Version: 1.0");

  if (attachments.length === 0) {
    return [...headers, alternativeBlock].join("\r\n");
  }

  const attachmentParts = attachments.map((attachment) =>
    [
      "--MIXED",
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      `Content-Disposition: ${attachment.disposition ?? "attachment"}; filename="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      attachment.data.toString("base64"),
      "",
    ].join("\r\n"),
  );

  return [
    ...headers,
    'Content-Type: multipart/mixed; boundary="MIXED"',
    "",
    "--MIXED",
    alternativeBlock,
    ...attachmentParts,
    "--MIXED--",
    "",
  ].join("\r\n");
}

// python3 -c "print('こんにちは、これはテスト本文です。'.encode('iso-2022-jp'))" のbase64版
const ISO_2022_JP_BODY_BASE64 =
  "GyRCJDMkcyRLJEEkTyEiJDMkbCRPJUYlOSVIS1xKOCRHJDkhIxsoQg==";
const ISO_2022_JP_SUBJECT_BASE64 = "GyRCJUYlOSVIN29MPhsoQg==";
const ISO_2022_JP_DECODED_BODY = "こんにちは、これはテスト本文です。";
const ISO_2022_JP_DECODED_SUBJECT = "テスト件名";

function buildIso2022JpEml(): string {
  return [
    'From: "Sender" <sender@example.com>',
    "To: recipient@example.com",
    `Subject: =?ISO-2022-JP?B?${ISO_2022_JP_SUBJECT_BASE64}?=`,
    "Date: Mon, 12 Oct 2020 06:16:14 +0000",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="ISO-2022-JP"',
    "Content-Transfer-Encoding: base64",
    "",
    ISO_2022_JP_BODY_BASE64,
    "",
  ].join("\r\n");
}

describe("parseEmlFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts sender address (lowercased), date (ISO 8601 UTC), subject, and text body", async () => {
    const raw = buildAlternativeEml({
      from: '"差出人" <Sender@Example.com>',
      date: "Mon, 12 Oct 2020 06:16:14 +0000",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.senderAddress).toBe("sender@example.com");
    expect(result.postedAt).toBe("2020-10-12T06:16:14.000Z");
    expect(result.title).toBe("テスト件名");
    expect(result.content).toBe("こんにちは、これはテスト本文です。");
    expect(result.image).toBeNull();
    expect(result.extraImageCount).toBe(0);
  });

  it("returns null title for a blank subject", async () => {
    const raw = buildAlternativeEml({ subject: "" });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.title).toBeNull();
  });

  it('returns null title for a subject of "無題"', async () => {
    const raw = buildAlternativeEml({
      subject: "=?utf-8?B?" + base64Utf8("無題") + "?=",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.title).toBeNull();
  });

  it("falls back to the HTML body (tags stripped, entities decoded) when text/plain is missing", async () => {
    const raw = buildAlternativeEml({
      textBody: null,
      htmlBody: "<p>こんにちは&amp;&nbsp;<b>世界</b>です。</p><p>2行目です。</p>",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).not.toBeNull();
    expect(result.content).not.toContain("<");
    expect(result.content).toContain("こんにちは& 世界です。");
    expect(result.content).toContain("2行目です。");
  });

  it("throws EmlImportError when the body is blank and there is no image (would violate the text-record content CHECK constraint)", async () => {
    const raw = buildAlternativeEml({ textBody: "   ", htmlBody: "  " });

    await expect(parseEmlFile(raw, "empty.eml")).rejects.toThrow(
      EmlImportError,
    );
    await expect(parseEmlFile(raw, "empty.eml")).rejects.toThrow(
      "empty.eml: 本文が空のため取り込めません",
    );
  });

  it("parses a blank-body email with an image as a valid image message (content null)", async () => {
    const raw = buildAlternativeEml({
      textBody: "   ",
      htmlBody: "  ",
      attachments: [
        {
          filename: "photo.png",
          mimeType: "image/png",
          data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ],
    });

    const result = await parseEmlFile(raw, "image-only.eml");

    expect(result.content).toBeNull();
    expect(result.image?.filename).toBe("photo.png");
    expect(toTalkImportRecord(result).type).toBe("image");
  });

  it("truncates a subject longer than 200 characters to 200 (consistent with the JSON import limit)", async () => {
    const longSubject = "あ".repeat(201);
    const raw = buildAlternativeEml({
      subject: "=?utf-8?B?" + base64Utf8(longSubject) + "?=",
    });

    const result = await parseEmlFile(raw, "long-subject.eml");

    expect(result.title).toBe("あ".repeat(200));
  });

  it("extracts the first image attachment and counts remaining images as extraImageCount", async () => {
    const raw = buildAlternativeEml({
      attachments: [
        {
          filename: "photo1.png",
          mimeType: "image/png",
          data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
          disposition: "inline",
        },
        {
          filename: "photo2.jpg",
          mimeType: "image/jpeg",
          data: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        },
        {
          filename: "photo3.jpg",
          mimeType: "image/jpeg",
          data: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
        },
      ],
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.image).not.toBeNull();
    expect(result.image?.filename).toBe("photo1.png");
    expect(result.image?.mimeType).toBe("image/png");
    expect(result.image?.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.image?.data ?? [])).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x00, 0x01,
    ]);
    expect(result.extraImageCount).toBe(2);
  });

  it("ignores non-image attachments when picking the image", async () => {
    const raw = buildAlternativeEml({
      attachments: [
        {
          filename: "doc.pdf",
          mimeType: "application/pdf",
          data: Buffer.from([0x25, 0x50, 0x44, 0x46]),
        },
        {
          filename: "photo.png",
          mimeType: "image/png",
          data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ],
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.image?.filename).toBe("photo.png");
    expect(result.extraImageCount).toBe(0);
  });

  it("decodes ISO-2022-JP encoded subject and body correctly", async () => {
    const raw = buildIso2022JpEml();

    const result = await parseEmlFile(raw, "iso2022jp.eml");

    expect(result.title).toBe(ISO_2022_JP_DECODED_SUBJECT);
    expect(result.content).toBe(ISO_2022_JP_DECODED_BODY);
  });

  it("throws EmlImportError including the filename when the From address is missing", async () => {
    const raw = buildAlternativeEml({ from: undefined });

    await expect(parseEmlFile(raw, "no-from.eml")).rejects.toThrow(
      EmlImportError,
    );
    await expect(parseEmlFile(raw, "no-from.eml")).rejects.toThrow(
      /no-from\.eml/,
    );
  });

  it("throws EmlImportError including the filename when the Date header is missing", async () => {
    const raw = buildAlternativeEml({ date: undefined });

    await expect(parseEmlFile(raw, "no-date.eml")).rejects.toThrow(
      EmlImportError,
    );
    await expect(parseEmlFile(raw, "no-date.eml")).rejects.toThrow(
      /no-date\.eml/,
    );
  });

  it("wraps unexpected parser failures in EmlImportError including the filename", async () => {
    vi.spyOn(PostalMime, "parse").mockRejectedValueOnce(new Error("boom"));

    await expect(parseEmlFile("irrelevant", "broken.eml")).rejects.toThrow(
      EmlImportError,
    );
    vi.spyOn(PostalMime, "parse").mockRejectedValueOnce(new Error("boom"));
    await expect(parseEmlFile("irrelevant", "broken.eml")).rejects.toThrow(
      /broken\.eml/,
    );
  });
});

describe("toTalkImportRecord", () => {
  function baseMessage(
    overrides: Partial<ParsedEmlMessage> = {},
  ): ParsedEmlMessage {
    return {
      senderAddress: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      title: "件名",
      content: "本文",
      image: null,
      extraImageCount: 0,
      ...overrides,
    };
  }

  it("maps a message without an image to a text record", () => {
    const message = baseMessage();

    expect(toTalkImportRecord(message)).toEqual({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
  });

  it("maps a message with an image to an image record (image data itself is not part of TalkImportRecord)", () => {
    const message = baseMessage({
      image: {
        filename: "photo.png",
        mimeType: "image/png",
        data: new Uint8Array([1, 2, 3]),
      },
    });

    const record = toTalkImportRecord(message);

    expect(record.type).toBe("image");
    expect(record.content).toBe("本文");
  });
});

describe("constants", () => {
  it("exposes the eml file size and count limits", () => {
    expect(MAX_EML_FILE_SIZE).toBe(10 * 1024 * 1024);
    expect(MAX_EML_FILE_COUNT).toBe(200);
    expect(MAX_EML_TOTAL_SIZE).toBe(50 * 1024 * 1024);
  });
});
