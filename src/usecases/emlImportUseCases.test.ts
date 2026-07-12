import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import PostalMime from "postal-mime";
import {
  parseEmlFile,
  expandEmlMessageToRecords,
  fetchRemoteImagesForImport,
  EmlImportError,
  MAX_EML_FILE_SIZE,
  MAX_EML_FILE_COUNT,
  MAX_EML_TOTAL_SIZE,
  type ParsedEmlMessage,
} from "./emlImportUseCases";

const { fetchRemoteImageRepositoryMock } = vi.hoisted(() => ({
  fetchRemoteImageRepositoryMock: vi.fn(),
}));

vi.mock("@/repositories/remoteImageRepository", () => ({
  fetchRemoteImage: fetchRemoteImageRepositoryMock,
}));

// 許可リスト（mail-web.c-nogizaka46.com の qimage のみ、#129 SSRF 対策）に一致する
// リモート画像 URL のテスト用ビルダー
function allowedImageUrl(imageName: string): string {
  return `https://mail-web.c-nogizaka46.com/mail/output/qimage?image_name=${imageName}`;
}

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
  /** Message-ID ヘッダの生の値（山括弧込み、例: "<abc123@example.com>"）。未指定ならヘッダ自体を省略する（P1-2） */
  messageId?: string;
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
    messageId,
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
  if (messageId !== undefined) headers.push(`Message-ID: ${messageId}`);
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
    expect(result.images).toEqual([]);
    expect(result.remoteImageUrls).toEqual([]);
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
    expect(result.images).toHaveLength(1);
    expect(result.images[0].filename).toBe("photo.png");
    const units = expandEmlMessageToRecords(result);
    expect(units).toHaveLength(1);
    expect(units[0].record.type).toBe("image");
  });

  it("truncates a subject longer than 200 characters to 200 (consistent with the JSON import limit)", async () => {
    const longSubject = "あ".repeat(201);
    const raw = buildAlternativeEml({
      subject: "=?utf-8?B?" + base64Utf8(longSubject) + "?=",
    });

    const result = await parseEmlFile(raw, "long-subject.eml");

    expect(result.title).toBe("あ".repeat(200));
  });

  it("extracts all image attachments in order (#133: multi-image import)", async () => {
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

    expect(result.images).toHaveLength(3);
    expect(result.images[0].filename).toBe("photo1.png");
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[0].data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.images[0].data)).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x00, 0x01,
    ]);
    expect(result.images[1].filename).toBe("photo2.jpg");
    expect(Array.from(result.images[1].data)).toEqual([
      0xff, 0xd8, 0xff, 0x00,
    ]);
    expect(result.images[2].filename).toBe("photo3.jpg");
    expect(Array.from(result.images[2].data)).toEqual([
      0xff, 0xd8, 0xff, 0x01,
    ]);
    // 添付画像がある場合、リモート画像は無視する（従来どおり）
    expect(result.remoteImageUrls).toEqual([]);
  });

  it("ignores non-image attachments when collecting images", async () => {
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

    expect(result.images).toHaveLength(1);
    expect(result.images[0].filename).toBe("photo.png");
  });

  // #128 レビュー対応（P1）: 異常な HTML 数値文字参照（範囲外・サロゲート範囲等）で
  // String.fromCodePoint が RangeError を投げ、バッチ全体（Promise.all 相当）が
  // 失敗することを防ぐ。デコード前にコードポイントを検証し、無効な場合は元の表記のまま残す
  describe("malformed HTML numeric character references (#128)", () => {
    it("does not throw and leaves the original notation when the code point exceeds 0x10FFFF", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#x110000;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("先頭&#x110000;末尾");
    });

    it("does not throw and leaves the original notation for a decimal reference exceeding 0x10FFFF (1114112)", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#1114112;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("先頭&#1114112;末尾");
    });

    it("does not throw and leaves the original notation for a surrogate-range code point (0xD800)", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#xD800;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("先頭&#xD800;末尾");
    });

    it("does not throw and leaves the original notation for the top of the surrogate range (0xDFFF)", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#xDFFF;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("先頭&#xDFFF;末尾");
    });

    it("still decodes a valid boundary code point just below the surrogate range (0xD7FF)", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#xD7FF;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe(`先頭${String.fromCodePoint(0xd7ff)}末尾`);
    });

    it("still decodes the maximum valid code point (0x10FFFF)", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#x10FFFF;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe(`先頭${String.fromCodePoint(0x10ffff)}末尾`);
    });

    it("leaves the rest of the body intact when only one of several numeric references is malformed", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>正常&#65;範囲外&#x110000;正常&#66;</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("正常A範囲外&#x110000;正常B");
    });

    it("wraps unexpected content-normalization failures in EmlImportError with the filename (defense in depth against decode failures)", async () => {
      const fromCodePointSpy = vi
        .spyOn(String, "fromCodePoint")
        .mockImplementation(() => {
          throw new Error("unexpected decode failure");
        });

      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>&#65;</p>",
      });

      await expect(parseEmlFile(raw, "broken-body.eml")).rejects.toThrow(
        EmlImportError,
      );
      fromCodePointSpy.mockImplementation(() => {
        throw new Error("unexpected decode failure");
      });
      await expect(parseEmlFile(raw, "broken-body.eml")).rejects.toThrow(
        "broken-body.eml: 本文の解析に失敗しました",
      );
    });
  });

  // #128 第3ラウンドレビュー対応（P1）: isValidCodePoint は codePoint >= 0 のため
  // U+0000（NUL）を有効として扱い、`&#0;` / `&#x0;` が NUL 文字としてデコードされていた。
  // PostgreSQL の jsonb/text カラムは NUL 文字を保存できず、プレビューは通過するものの
  // import_records_atomic RPC でバッチ全体が失敗する。数値文字参照は元の表記のまま残し、
  // text/plain 由来の生 NUL・Subject の NUL も最終文字列から除去する（防御の多重化）
  describe("U+0000 (NUL) handling (#128 第3ラウンドレビュー P1)", () => {
    // ソース中に生の NUL 文字を書くのを避けるため、コードポイントから組み立てる
    const NUL = String.fromCharCode(0);

    it("does not decode &#0; (decimal NUL reference) and leaves the original notation", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#0;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("先頭&#0;末尾");
    });

    it("does not decode &#x0; (hex NUL reference) and leaves the original notation", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody: "<p>先頭&#x0;末尾</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("先頭&#x0;末尾");
    });

    it("strips a raw NUL character embedded in a text/plain body", async () => {
      const raw = buildAlternativeEml({
        textBody: `前${NUL}後`,
        htmlBody: null,
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("前後");
      expect(result.content).not.toContain(NUL);
    });

    it("falls back to the HTML body when the text/plain body becomes empty after stripping NUL characters", async () => {
      const raw = buildAlternativeEml({
        textBody: `${NUL}${NUL}`,
        htmlBody: "<p>HTML本文</p>",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.content).toBe("HTML本文");
    });

    it("throws EmlImportError when the body is NUL-only and there is no image (empty after NUL stripping)", async () => {
      const raw = buildAlternativeEml({
        textBody: NUL,
        htmlBody: NUL,
      });

      await expect(parseEmlFile(raw, "nul-only.eml")).rejects.toThrow(
        EmlImportError,
      );
      await expect(parseEmlFile(raw, "nul-only.eml")).rejects.toThrow(
        "nul-only.eml: 本文が空のため取り込めません",
      );
    });

    it("strips NUL characters embedded in the subject", async () => {
      const raw = buildAlternativeEml({
        subject: "=?utf-8?B?" + base64Utf8(`${NUL}タイトル`) + "?=",
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.title).toBe("タイトル");
    });
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

// P1-1レビュー対応P1-2: import_key はファイル名ではなくメールの識別情報（Message-ID、
// 無ければ本文バイト列のハッシュ）から導出する。ファイル名ベースだと同名だが別内容の
// メールが衝突（2件目が silently skip されデータ損失）したり、リネームで再インポート時に
// 重複扱いされなくなったりするため
describe("parseEmlFile: mailKey derivation (P1-2: stable per-mail dedup key, not filename-based)", () => {
  it("derives a hashed mailKey (msgid: prefix + SHA-256 hex digest) from the normalized Message-ID (trimmed, angle brackets stripped) when present", async () => {
    const raw = buildAlternativeEml({ messageId: "<ABC-123@Example.com>" });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.mailKey).toMatch(/^msgid:[0-9a-f]{64}$/);
  });

  it("derives the identical mailKey for the same Message-ID parsed twice (stable)", async () => {
    const rawA = buildAlternativeEml({ messageId: "<stable@example.com>" });
    const rawB = buildAlternativeEml({ messageId: "<stable@example.com>" });

    const a = await parseEmlFile(rawA, "a.eml");
    const b = await parseEmlFile(rawB, "b.eml");

    expect(a.mailKey).toBe(b.mailKey);
  });

  // 回帰テスト: Message-ID の比較は大文字小文字を区別する（RFC 5256）。
  // 旧実装は normalizeMessageId 内で .toLowerCase() していたため、大文字小文字だけが
  // 異なる2通のメールが同一の mailKey/importKey に潰れ、後からインポートした方の
  // レコードが重複排除 RPC によって丸ごとスキップされていた（データ損失）
  it("produces DIFFERENT mailKeys for Message-IDs differing only in case (case must be preserved, not lowercased)", async () => {
    const rawUpper = buildAlternativeEml({ messageId: "<Foo@example.com>" });
    const rawLower = buildAlternativeEml({ messageId: "<foo@example.com>" });

    const upper = await parseEmlFile(rawUpper, "upper.eml");
    const lower = await parseEmlFile(rawLower, "lower.eml");

    expect(upper.mailKey).not.toBe(lower.mailKey);
  });

  it("falls back to a sha256 content hash when Message-ID is absent", async () => {
    const raw = buildAlternativeEml({});

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.mailKey).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces the identical mailKey for identical content parsed under two different filenames (would dedup)", async () => {
    const raw = buildAlternativeEml({ textBody: "同じ内容の本文です" });

    const a = await parseEmlFile(raw, "message.eml");
    const b = await parseEmlFile(raw, "message.eml");

    expect(a.mailKey).toBe(b.mailKey);
  });

  it("produces different mailKeys for different content parsed under the same filename (both import, no data loss)", async () => {
    const rawA = buildAlternativeEml({ textBody: "内容A" });
    const rawB = buildAlternativeEml({ textBody: "内容B" });

    const a = await parseEmlFile(rawA, "message.eml");
    const b = await parseEmlFile(rawB, "message.eml");

    expect(a.mailKey).not.toBe(b.mailKey);
  });

  it("produces the same mailKey for two mails sharing the same Message-ID, even with different content (dedup by mail identity)", async () => {
    const rawA = buildAlternativeEml({
      messageId: "<dup@example.com>",
      textBody: "内容A",
    });
    const rawB = buildAlternativeEml({
      messageId: "<dup@example.com>",
      textBody: "内容B",
    });

    const a = await parseEmlFile(rawA, "a.eml");
    const b = await parseEmlFile(rawB, "b.eml");

    expect(a.mailKey).toBe(b.mailKey);
  });

  it("produces different mailKeys for two mails with different Message-IDs", async () => {
    const rawA = buildAlternativeEml({ messageId: "<one@example.com>" });
    const rawB = buildAlternativeEml({ messageId: "<two@example.com>" });

    const a = await parseEmlFile(rawA, "a.eml");
    const b = await parseEmlFile(rawB, "b.eml");

    expect(a.mailKey).not.toBe(b.mailKey);
  });
});

// #129: 実メール41通の調査結果対応（数値文字参照・Gmail画像マーカー・スタブ本文・
// リモート画像）。実メールは添付ファイル0件で、画像は HTML パート内の
// <img src="https://.../qimage?..."> というリモート参照のみを持つ
describe("parseEmlFile: numeric character references in text/plain (#129)", () => {
  it("decodes a valid hex numeric character reference (&#x2600;) in text/plain", async () => {
    const raw = buildAlternativeEml({
      textBody: `先頭&#x2600;末尾`,
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe(`先頭${String.fromCodePoint(0x2600)}末尾`);
  });

  it("decodes a valid decimal numeric character reference (&#9728;) in text/plain", async () => {
    const raw = buildAlternativeEml({
      textBody: `先頭&#9728;末尾`,
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe(`先頭${String.fromCodePoint(9728)}末尾`);
  });

  it("leaves an invalid numeric character reference (&#0;, out of range) in text/plain untouched", async () => {
    const raw = buildAlternativeEml({
      textBody: `先頭&#0;中&#x110000;末尾`,
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("先頭&#0;中&#x110000;末尾");
  });

  it("does not decode named HTML entities (e.g. &amp;) in text/plain, since they may be literal text", async () => {
    const raw = buildAlternativeEml({
      textBody: `AT&amp;T`,
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("AT&amp;T");
  });
});

describe("parseEmlFile: Gmail-style [image: ...] marker lines (#129)", () => {
  it("removes a marker-only line and keeps the surrounding body", async () => {
    const raw = buildAlternativeEml({
      textBody: "前の行\n[image: 1142-20220301-041051.jpg]\n後の行",
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("前の行\n後の行");
  });

  it("collapses consecutive blank lines created by removing the marker line", async () => {
    const raw = buildAlternativeEml({
      textBody: "前\n\n[image: x.jpg]\n\n後",
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("前\n\n後");
  });

  it("falls back to the HTML body when the text/plain body is only a marker line", async () => {
    const raw = buildAlternativeEml({
      textBody: "[image: 1142-20220301-041051.jpg]",
      htmlBody: "<p>HTML本文</p>",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("HTML本文");
  });

  it("throws EmlImportError when the body is only a marker line and there is no HTML fallback", async () => {
    const raw = buildAlternativeEml({
      textBody: "[image: 1142-20220301-041051.jpg]",
      htmlBody: "  ",
    });

    await expect(parseEmlFile(raw, "marker-only.eml")).rejects.toThrow(
      "marker-only.eml: 本文が空のため取り込めません",
    );
  });
});

// #132 レビュー対応 P1-1: removeImageMarkerLines がマーカー行の有無に関わらず常に
// 改行を正規化し全ての連続空行を畳み込んでいたため、マーカーを含まない通常本文の
// 忠実性（CRLF・意図的な連続空行）が損なわれていた。マーカーが無ければ入力を
// 完全に無変更で返し、マーカーがある場合も除去によってできた空行の畳み込みに限定する
describe("removeImageMarkerLines: non-marker body fidelity (#132 review P1-1)", () => {
  it("returns a body with no marker line completely unchanged, preserving CRLF and a pre-existing double blank line", async () => {
    const raw = buildAlternativeEml({
      textBody: "アルファ\r\n\r\n\r\nベータ",
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("アルファ\r\n\r\n\r\nベータ");
  });

  it("removes a marker line surrounded by blank lines and collapses the two resulting adjacent blanks into one", async () => {
    const raw = buildAlternativeEml({
      textBody: "前\n\n[image: x.jpg]\n\n後",
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("前\n\n後");
  });

  it("removes a marker line with no adjacent blank lines, leaving the surrounding lines untouched", async () => {
    const raw = buildAlternativeEml({
      textBody: "前の行\n[image: 1142-20220301-041051.jpg]\n後の行",
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("前の行\n後の行");
  });

  it("collapses only the blank run created by marker removal while preserving an unrelated pre-existing double blank elsewhere", async () => {
    const raw = buildAlternativeEml({
      textBody: "前\n\n[image: x.jpg]\n\n中\n\n\n後",
      htmlBody: null,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("前\n\n中\n\n\n後");
  });
});

describe("parseEmlFile: stub text/plain body falls back to HTML (#129)", () => {
  it("falls back to the HTML body when text/plain is only the cuenote stub with a link", async () => {
    const raw = buildAlternativeEml({
      textBody:
        "メールがうまく表示されない方はこちらをご覧ください\r\nhttp://fc1093.cuenote.jp/h/xxxxxx",
      htmlBody: "<p>本当の本文です。</p>",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("本当の本文です。");
  });

  it("falls back to the HTML body when text/plain is only the cuenote stub without a link", async () => {
    const raw = buildAlternativeEml({
      textBody: "メールがうまく表示されない方はこちらをご覧ください",
      htmlBody: "<p>本当の本文です。</p>",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toBe("本当の本文です。");
  });

  it("throws EmlImportError when the stub body has no usable HTML fallback and there is no image", async () => {
    const raw = buildAlternativeEml({
      textBody:
        "メールがうまく表示されない方はこちらをご覧ください\r\nhttp://fc1093.cuenote.jp/h/xxxxxx",
      htmlBody: "  ",
    });

    await expect(parseEmlFile(raw, "stub-only.eml")).rejects.toThrow(
      "stub-only.eml: 本文が空のため取り込めません",
    );
  });

  it("does not treat a body that merely starts with the stub sentence as a stub (real content keeps text/plain)", async () => {
    const raw = buildAlternativeEml({
      textBody:
        "メールがうまく表示されない方はこちらをご覧ください\r\nhttp://fc1093.cuenote.jp/h/xxxxxx\r\n追記: 本当はこれも本文です",
      htmlBody: "<p>HTML側</p>",
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.content).toContain("追記: 本当はこれも本文です");
  });

  // #129 レビュー対応（誤検出防止）: スタブ文言を「含む」だけの通常本文はスタブ扱いせず
  // text/plain のまま採用する（判定は本文全体に対する anchored 一致のみ）
  it("keeps a normal text/plain body that mentions the stub sentence in the middle of other content", async () => {
    const raw = buildAlternativeEml({
      textBody:
        "今日の配信メールに\r\nメールがうまく表示されない方はこちらをご覧ください\r\nと書いてあって面白かった",
      htmlBody: "<p>HTML側</p>",
    });

    const result = await parseEmlFile(raw, "test.eml");

    // マーカー行が無い本文は removeImageMarkerLines を素通りし、改行（\r\n）は
    // 正規化されずそのまま残る（#132 レビュー対応 P1-1: マーカーが無い本文まで
    // 一律に改行正規化・空行畳み込みされていた過剰な書き換えを修正）
    expect(result.content).toBe(
      "今日の配信メールに\r\nメールがうまく表示されない方はこちらをご覧ください\r\nと書いてあって面白かった",
    );
  });
});

describe("parseEmlFile: remote image extraction from HTML <img> (#129, #133: 全件抽出)", () => {
  it("extracts an allowed remote image URL and decodes &amp; in its query string", async () => {
    const raw = buildAlternativeEml({
      textBody: null,
      htmlBody:
        '<p>本文</p><img src="https://mail-web.c-nogizaka46.com/mail/output/qimage?image_name=abc123&amp;token=xyz">',
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.images).toEqual([]);
    expect(result.remoteImageUrls).toEqual([
      "https://mail-web.c-nogizaka46.com/mail/output/qimage?image_name=abc123&token=xyz",
    ]);
  });

  it("ignores non-http(s) img src values such as javascript: or cid:", async () => {
    const raw = buildAlternativeEml({
      textBody: null,
      htmlBody:
        '<p>本文</p><img src="javascript:alert(1)"><img src="cid:abc123">',
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.remoteImageUrls).toEqual([]);
  });

  // #129 レビュー対応: SSRF・トラッキングピクセル対策として、リモート画像 URL は
  // 許可リスト（https・mail-web.c-nogizaka46.com・/mail/output/qimage・userinfo なし・
  // ポート指定なし）に一致するもののみ取得候補とする
  describe("remote image URL allowlist (SSRF countermeasure)", () => {
    it("rejects a non-https URL even when the host and path match the allowlist", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody:
          '<p>本文</p><img src="http://mail-web.c-nogizaka46.com/mail/output/qimage?image_name=a">',
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.remoteImageUrls).toEqual([]);
    });

    it("rejects a URL on a different host", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody:
          '<p>本文</p><img src="https://evil.example.com/mail/output/qimage?image_name=a">',
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.remoteImageUrls).toEqual([]);
    });

    it("rejects a URL with a different path", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody:
          '<p>本文</p><img src="https://mail-web.c-nogizaka46.com/other/path?image_name=a">',
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.remoteImageUrls).toEqual([]);
    });

    it("rejects a URL with an explicit port", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody:
          '<p>本文</p><img src="https://mail-web.c-nogizaka46.com:8443/mail/output/qimage?image_name=a">',
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.remoteImageUrls).toEqual([]);
    });

    it("rejects a URL with userinfo (https://user@mail-web...)", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody:
          '<p>本文</p><img src="https://user@mail-web.c-nogizaka46.com/mail/output/qimage?image_name=a">',
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.remoteImageUrls).toEqual([]);
    });

    it("keeps only allowlisted URLs when allowed and disallowed images are mixed", async () => {
      const raw = buildAlternativeEml({
        textBody: null,
        htmlBody:
          "<p>本文</p>" +
          '<img src="https://tracking.example.com/pixel.gif">' +
          `<img src="${allowedImageUrl("first")}">` +
          '<img src="https://evil.example.com/mail/output/qimage?image_name=x">' +
          `<img src="${allowedImageUrl("second")}">`,
      });

      const result = await parseEmlFile(raw, "test.eml");

      expect(result.remoteImageUrls).toEqual([
        allowedImageUrl("first"),
        allowedImageUrl("second"),
      ]);
    });
  });

  it("returns all allowed remote image URLs in order (#133: multi-image import)", async () => {
    const raw = buildAlternativeEml({
      textBody: null,
      htmlBody:
        "<p>本文</p>" +
        `<img src="${allowedImageUrl("1")}">` +
        '<img src="cid:ignored">' +
        `<img src="${allowedImageUrl("2")}">` +
        `<img src="${allowedImageUrl("3")}">`,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.remoteImageUrls).toEqual([
      allowedImageUrl("1"),
      allowedImageUrl("2"),
      allowedImageUrl("3"),
    ]);
  });

  it("dedupes exact-duplicate remote image URLs while preserving order", async () => {
    const raw = buildAlternativeEml({
      textBody: null,
      htmlBody:
        "<p>本文</p>" +
        `<img src="${allowedImageUrl("1")}">` +
        `<img src="${allowedImageUrl("2")}">` +
        `<img src="${allowedImageUrl("1")}">`,
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.remoteImageUrls).toEqual([
      allowedImageUrl("1"),
      allowedImageUrl("2"),
    ]);
  });

  it("prefers attachment images over HTML <img> and ignores HTML images entirely (avoids cid double-counting)", async () => {
    const raw = buildAlternativeEml({
      textBody: null,
      htmlBody: `<p>本文</p><img src="${allowedImageUrl("1")}">`,
      attachments: [
        {
          filename: "photo.png",
          mimeType: "image/png",
          data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ],
    });

    const result = await parseEmlFile(raw, "test.eml");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].filename).toBe("photo.png");
    expect(result.remoteImageUrls).toEqual([]);
  });

  it("parses a blank-body email with only a remote image as a valid image message", async () => {
    const raw = buildAlternativeEml({
      textBody: "   ",
      htmlBody: `<img src="${allowedImageUrl("1")}">`,
    });

    const result = await parseEmlFile(raw, "remote-image-only.eml");

    expect(result.content).toBeNull();
    expect(result.remoteImageUrls).toEqual([allowedImageUrl("1")]);
    const units = expandEmlMessageToRecords(result);
    expect(units).toHaveLength(1);
    expect(units[0].record.type).toBe("image");
  });

  it("treats a blank-body email whose only image URL is disallowed as an empty-body row error", async () => {
    const raw = buildAlternativeEml({
      textBody: "   ",
      htmlBody: '<img src="https://tracking.example.com/pixel.gif">',
    });

    await expect(parseEmlFile(raw, "pixel-only.eml")).rejects.toThrow(
      "pixel-only.eml: 本文が空のため取り込めません",
    );
  });

  it("throws EmlImportError when body, images, and remoteImageUrls are all absent", async () => {
    const raw = buildAlternativeEml({ textBody: "  ", htmlBody: "  " });

    await expect(parseEmlFile(raw, "all-empty.eml")).rejects.toThrow(
      "all-empty.eml: 本文が空のため取り込めません",
    );
  });
});

describe("fetchRemoteImagesForImport (#129, #132 レビュー対応 P1-3/P2-1/P2-2)", () => {
  beforeEach(() => {
    fetchRemoteImageRepositoryMock.mockReset();
  });

  it("fetches every task via the repository (10MB per image, 15s timeout) and returns normalized ok results", async () => {
    fetchRemoteImageRepositoryMock.mockResolvedValue({
      ok: true,
      data: new Uint8Array([1, 2, 3]),
      contentType: "IMAGE/JPEG; charset=binary",
    });

    const result = await fetchRemoteImagesForImport([
      { key: "record-1", url: allowedImageUrl("1") },
      { key: "record-2", url: allowedImageUrl("2") },
    ]);

    expect(fetchRemoteImageRepositoryMock).toHaveBeenCalledTimes(2);
    expect(fetchRemoteImageRepositoryMock).toHaveBeenCalledWith(
      allowedImageUrl("1"),
      { timeoutMs: 15_000, maxBytes: MAX_EML_FILE_SIZE },
    );
    // Content-Type はメディアタイプのみに正規化され（; 以降除去・trim・小文字化）、
    // filename は正規化後の subtype から導出される
    expect(result.get("record-1")).toEqual({
      ok: true,
      image: {
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
        filename: "image-1.jpeg",
      },
    });
    expect(result.get("record-2")).toEqual({
      ok: true,
      image: {
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
        filename: "image-1.jpeg",
      },
    });
  });

  it("returns an empty map for an empty task list without calling the repository", async () => {
    const result = await fetchRemoteImagesForImport([]);

    expect(result.size).toBe(0);
    expect(fetchRemoteImageRepositoryMock).not.toHaveBeenCalled();
  });

  it("maps a non-image Content-Type to { ok: false, reason: 'not_image' }", async () => {
    fetchRemoteImageRepositoryMock.mockResolvedValue({
      ok: true,
      data: new Uint8Array([1]),
      contentType: "text/html; charset=utf-8",
    });

    const result = await fetchRemoteImagesForImport([
      { key: "record-1", url: allowedImageUrl("1") },
    ]);

    expect(result.get("record-1")).toEqual({ ok: false, reason: "not_image" });
  });

  it("maps repository failures to { ok: false, reason: 'fetch_failed' } while other tasks still succeed", async () => {
    fetchRemoteImageRepositoryMock.mockImplementation(async (url: string) =>
      url === allowedImageUrl("bad")
        ? { ok: false, reason: "network" }
        : {
            ok: true,
            data: new Uint8Array([1, 2]),
            contentType: "image/png",
          },
    );

    const result = await fetchRemoteImagesForImport([
      { key: "record-bad", url: allowedImageUrl("bad") },
      { key: "record-ok", url: allowedImageUrl("ok") },
    ]);

    expect(result.get("record-bad")).toEqual({
      ok: false,
      reason: "fetch_failed",
    });
    expect(result.get("record-ok")).toEqual({
      ok: true,
      image: {
        data: new Uint8Array([1, 2]),
        contentType: "image/png",
        filename: "image-1.png",
      },
    });
  });

  // P2-1: SSRF 自己完結性。fetchOne は repository を呼ぶ前に必ず
  // isAllowedRemoteImageUrl で再検証し、許可外 URL は outbound I/O を一切行わない
  it("rejects a disallowed URL as { ok: false, reason: 'not_allowed' } without calling the repository for it", async () => {
    const disallowedUrl = "https://evil.example.com/mail/output/qimage?image_name=x";
    fetchRemoteImageRepositoryMock.mockResolvedValue({
      ok: true,
      data: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    });

    const result = await fetchRemoteImagesForImport([
      { key: "record-bad", url: disallowedUrl },
      { key: "record-ok", url: allowedImageUrl("1") },
    ]);

    expect(result.get("record-bad")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
    expect(fetchRemoteImageRepositoryMock).toHaveBeenCalledTimes(1);
    expect(fetchRemoteImageRepositoryMock).not.toHaveBeenCalledWith(
      disallowedUrl,
      expect.anything(),
    );
    expect(result.get("record-ok")).toEqual({
      ok: true,
      image: {
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
        filename: "image-1.jpeg",
      },
    });
  });

  // P2-2: 非画像でダウンロードされたバイト数もバッチ合計に含める
  it("counts a non-image download's bytes toward the batch cap, tipping a later task into batch_size_exceeded", async () => {
    const nonImageUrl = allowedImageUrl("non-image");
    const imageUrl = allowedImageUrl("image");
    const thirtyMb = 30 * 1024 * 1024;
    const twentyFiveMb = 25 * 1024 * 1024;
    fetchRemoteImageRepositoryMock.mockImplementation(async (url: string) =>
      url === nonImageUrl
        ? {
            ok: true,
            data: new Uint8Array(thirtyMb),
            contentType: "text/html; charset=utf-8",
          }
        : {
            ok: true,
            data: new Uint8Array(twentyFiveMb),
            contentType: "image/jpeg",
          },
    );

    const result = await fetchRemoteImagesForImport([
      { key: "record-non-image", url: nonImageUrl },
      { key: "record-image", url: imageUrl },
    ]);

    // 非画像（30MB）単体では合計50MBを超えないため not_image
    expect(result.get("record-non-image")).toEqual({
      ok: false,
      reason: "not_image",
    });
    // 非画像の30MB + 画像の25MB = 55MB > 50MB。非画像のバイト数もカウントされて
    // いなければこのタスク単体（25MB）は上限を超えないため、non-image の分が
    // カウントされていることの証拠になる
    expect(result.get("record-image")).toEqual({
      ok: false,
      reason: "batch_size_exceeded",
    });
  });

  it("fails tasks with { ok: false, reason: 'batch_size_exceeded' } once the cumulative fetched size exceeds MAX_EML_TOTAL_SIZE (50MB)", async () => {
    // 9MB × 7件 = 63MB。5件目まで（45MB）は成功し、累計が 50MB を超えた時点で
    // 当該・以降のタスクは batch_size_exceeded になる
    const nineMb = 9 * 1024 * 1024;
    fetchRemoteImageRepositoryMock.mockResolvedValue({
      ok: true,
      data: new Uint8Array(nineMb),
      contentType: "image/jpeg",
    });

    const tasks = Array.from({ length: 7 }, (_, i) => ({
      key: `record-${i}`,
      url: allowedImageUrl(String(i)),
    }));
    const result = await fetchRemoteImagesForImport(tasks);

    const succeeded = [...result.values()].filter((value) => value.ok);
    const failed = [...result.values()].filter(
      (value) => !value.ok,
    ) as Array<{ ok: false; reason: string }>;
    expect(succeeded).toHaveLength(5);
    expect(result.size).toBe(7);
    expect(
      failed.every((value) => value.reason === "batch_size_exceeded"),
    ).toBe(true);
  });

  it("never runs more than 5 fetches concurrently", async () => {
    let activeCount = 0;
    let maxActiveCount = 0;
    fetchRemoteImageRepositoryMock.mockImplementation(async () => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount -= 1;
      return {
        ok: true,
        data: new Uint8Array([1]),
        contentType: "image/jpeg",
      };
    });

    const tasks = Array.from({ length: 12 }, (_, i) => ({
      key: `record-${i}`,
      url: allowedImageUrl(String(i)),
    }));
    const result = await fetchRemoteImagesForImport(tasks);

    expect(result.size).toBe(12);
    expect(maxActiveCount).toBeLessThanOrEqual(5);
    // 直列実行に退化していないこと（並列で動いている）
    expect(maxActiveCount).toBeGreaterThan(1);
  });
});

describe("expandEmlMessageToRecords (#133: 複数画像を全件登録する)", () => {
  function baseMessage(
    overrides: Partial<ParsedEmlMessage> = {},
  ): ParsedEmlMessage {
    return {
      senderAddress: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      title: "件名",
      content: "本文",
      images: [],
      remoteImageUrls: [],
      mailKey: "msgid:mail-key@example.com",
      ...overrides,
    };
  }

  it("maps a message without images to a single text record with importKey '<message.mailKey>#0' (P1-2: derived from mail identity, not filename)", () => {
    const message = baseMessage();

    const units = expandEmlMessageToRecords(message);

    expect(units).toEqual([
      {
        record: {
          speaker: "sender@example.com",
          postedAt: "2020-10-12T06:16:14.000Z",
          type: "text",
          title: "件名",
          content: "本文",
          hasAudio: false,
          importKey: "msgid:mail-key@example.com#0",
        },
        media: null,
      },
    ]);
  });

  it("maps a message with a single attachment image to one image unit carrying the body content", () => {
    const message = baseMessage({
      images: [
        {
          filename: "photo.png",
          mimeType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        },
      ],
    });

    const units = expandEmlMessageToRecords(message);

    expect(units).toHaveLength(1);
    expect(units[0].record.type).toBe("image");
    expect(units[0].record.content).toBe("本文");
    expect(units[0].record.title).toBe("件名");
    expect(units[0].record.importKey).toBe("msgid:mail-key@example.com#0");
    expect(units[0].media).toEqual({
      kind: "attachment",
      data: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      filename: "photo.png",
    });
  });

  it("maps a message with 3 attachment images to 3 units: main keeps content, extras have null content, all share title/postedAt/speaker", () => {
    const message = baseMessage({
      images: [
        { filename: "photo1.png", mimeType: "image/png", data: new Uint8Array([1]) },
        { filename: "photo2.jpg", mimeType: "image/jpeg", data: new Uint8Array([2]) },
        { filename: "photo3.jpg", mimeType: "image/jpeg", data: new Uint8Array([3]) },
      ],
    });

    const units = expandEmlMessageToRecords(message);

    expect(units).toHaveLength(3);

    expect(units[0].record).toEqual({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "image",
      title: "件名",
      content: "本文",
      hasAudio: false,
      importKey: "msgid:mail-key@example.com#0",
    });
    expect(units[0].media).toEqual({
      kind: "attachment",
      data: new Uint8Array([1]),
      mimeType: "image/png",
      filename: "photo1.png",
    });

    expect(units[1].record).toEqual({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "image",
      title: "件名",
      content: null,
      hasAudio: false,
      importKey: "msgid:mail-key@example.com#1",
    });
    expect(units[1].media).toEqual({
      kind: "attachment",
      data: new Uint8Array([2]),
      mimeType: "image/jpeg",
      filename: "photo2.jpg",
    });

    expect(units[2].record).toEqual({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "image",
      title: "件名",
      content: null,
      hasAudio: false,
      importKey: "msgid:mail-key@example.com#2",
    });
    expect(units[2].media).toEqual({
      kind: "attachment",
      data: new Uint8Array([3]),
      mimeType: "image/jpeg",
      filename: "photo3.jpg",
    });
  });

  it("maps a message with 2 remote image URLs (no attachments) to 2 remote units", () => {
    const message = baseMessage({
      remoteImageUrls: [
        "https://example.com/1.jpg",
        "https://example.com/2.jpg",
      ],
    });

    const units = expandEmlMessageToRecords(message);

    expect(units).toHaveLength(2);
    expect(units[0].record.type).toBe("image");
    expect(units[0].record.content).toBe("本文");
    expect(units[0].record.importKey).toBe("msgid:mail-key@example.com#0");
    expect(units[0].media).toEqual({
      kind: "remote",
      url: "https://example.com/1.jpg",
    });
    expect(units[1].record.type).toBe("image");
    expect(units[1].record.content).toBeNull();
    expect(units[1].record.importKey).toBe("msgid:mail-key@example.com#1");
    expect(units[1].media).toEqual({
      kind: "remote",
      url: "https://example.com/2.jpg",
    });
  });

  it("ignores remoteImageUrls when attachment images are present (attachment takes precedence)", () => {
    const message = baseMessage({
      images: [
        { filename: "photo.png", mimeType: "image/png", data: new Uint8Array([1]) },
      ],
      remoteImageUrls: ["https://example.com/1.jpg"],
    });

    const units = expandEmlMessageToRecords(message);

    expect(units).toHaveLength(1);
    expect(units[0].media).toEqual({
      kind: "attachment",
      data: new Uint8Array([1]),
      mimeType: "image/png",
      filename: "photo.png",
    });
  });
});

describe("constants", () => {
  it("exposes the eml file size and count limits", () => {
    expect(MAX_EML_FILE_SIZE).toBe(10 * 1024 * 1024);
    expect(MAX_EML_FILE_COUNT).toBe(200);
    expect(MAX_EML_TOTAL_SIZE).toBe(50 * 1024 * 1024);
  });
});
