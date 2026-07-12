import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRemoteImage } from "./remoteImageRepository";

// --- fetch レスポンスのモックビルダー ---

type MockReader = {
  read: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

/**
 * getReader() ベースのチャンク読みを完全に制御するための偽 Response を組み立てる。
 * chunks を渡すと read() が順に返し、読み尽くすと done: true を返す
 */
function buildMockResponse(options: {
  ok?: boolean;
  contentType?: string | null;
  contentLength?: string | null;
  chunks?: Uint8Array[];
  bodyNull?: boolean;
}): {
  response: Response;
  reader: MockReader;
  getReaderMock: ReturnType<typeof vi.fn>;
  bodyCancelMock: ReturnType<typeof vi.fn>;
} {
  const {
    ok = true,
    contentType = "image/jpeg",
    contentLength = null,
    chunks = [],
    bodyNull = false,
  } = options;

  const remaining = [...chunks];
  const reader: MockReader = {
    read: vi.fn(async () =>
      remaining.length > 0
        ? { done: false, value: remaining.shift() }
        : { done: true, value: undefined },
    ),
    cancel: vi.fn(async () => {}),
  };
  const getReaderMock = vi.fn(() => reader);
  // response.body 自体の cancel()（早期return時の未消費ボディ解放、#132 レビュー対応
  // P1-2）を reader.cancel() とは別に検証できるよう、専用のモックを用意する
  const bodyCancelMock = vi.fn(async () => {});

  const headers = {
    get: (name: string) => {
      const lower = name.toLowerCase();
      if (lower === "content-type") {
        return contentType;
      }
      if (lower === "content-length") {
        return contentLength;
      }
      return null;
    },
  };

  const response = {
    ok,
    headers,
    body: bodyNull
      ? null
      : { getReader: getReaderMock, cancel: bodyCancelMock },
  } as unknown as Response;

  return { response, reader, getReaderMock, bodyCancelMock };
}

const DEFAULT_OPTIONS = { timeoutMs: 15_000, maxBytes: 100 };

describe("fetchRemoteImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok with the concatenated chunks and the raw Content-Type header on success", async () => {
    const { response } = buildMockResponse({
      contentType: "image/jpeg; charset=binary",
      chunks: [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage(
      "https://example.com/image",
      DEFAULT_OPTIONS,
    );

    expect(result).toEqual({
      ok: true,
      data: new Uint8Array([1, 2, 3, 4, 5]),
      // Content-Type は生ヘッダのまま返す（正規化・image/ 判定は UseCase 側の責務）
      contentType: "image/jpeg; charset=binary",
    });
  });

  it("passes redirect: 'error' and an abort signal to fetch", async () => {
    const { response } = buildMockResponse({ chunks: [new Uint8Array([1])] });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await fetchRemoteImage("https://example.com/image", DEFAULT_OPTIONS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/image",
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns { ok: false, reason: 'network' } when fetch rejects (network error / timeout / redirect)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const result = await fetchRemoteImage(
      "https://example.com/image",
      DEFAULT_OPTIONS,
    );

    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("returns { ok: false, reason: 'http_error' } without reading the body when the response is not ok", async () => {
    const { response, getReaderMock, bodyCancelMock } = buildMockResponse({
      ok: false,
      chunks: [new Uint8Array([1])],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage(
      "https://example.com/image",
      DEFAULT_OPTIONS,
    );

    expect(result).toEqual({ ok: false, reason: "http_error" });
    expect(getReaderMock).not.toHaveBeenCalled();
    // #132 レビュー対応 P1-2: 本体を読まずに返す経路でも response.body を
    // cancel() して undici の接続を解放する
    expect(bodyCancelMock).toHaveBeenCalledTimes(1);
  });

  it("still returns { ok: false, reason: 'http_error' } even if response.body.cancel() itself rejects", async () => {
    const { response } = buildMockResponse({ ok: false });
    // cancel() 自体が失敗しても reason は変えず、例外も外へ漏らさない
    (response.body as { cancel: () => Promise<void> }).cancel = vi
      .fn()
      .mockRejectedValue(new Error("cancel failed"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage(
      "https://example.com/image",
      DEFAULT_OPTIONS,
    );

    expect(result).toEqual({ ok: false, reason: "http_error" });
  });

  it("returns { ok: false, reason: 'too_large' } before reading the body when Content-Length exceeds maxBytes", async () => {
    const { response, getReaderMock, bodyCancelMock } = buildMockResponse({
      contentLength: "101",
      chunks: [new Uint8Array(101)],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage("https://example.com/image", {
      timeoutMs: 15_000,
      maxBytes: 100,
    });

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(getReaderMock).not.toHaveBeenCalled();
    // #132 レビュー対応 P1-2: Content-Length の事前チェックで返す経路でも
    // response.body を cancel() して未消費のまま放置しない
    expect(bodyCancelMock).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: false, reason: 'too_large' } and cancels the reader mid-stream when cumulative bytes exceed maxBytes without Content-Length", async () => {
    const { response, reader } = buildMockResponse({
      contentLength: null,
      chunks: [new Uint8Array(60), new Uint8Array(60), new Uint8Array(60)],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage("https://example.com/image", {
      timeoutMs: 15_000,
      maxBytes: 100,
    });

    expect(result).toEqual({ ok: false, reason: "too_large" });
    // 2チャンク目（累計120 > 100）で打ち切り、3チャンク目は読まない
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
  });

  it("accepts a body whose total size is exactly maxBytes (boundary)", async () => {
    const { response } = buildMockResponse({
      chunks: [new Uint8Array(60), new Uint8Array(40)],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage("https://example.com/image", {
      timeoutMs: 15_000,
      maxBytes: 100,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected an ok result");
    }
    expect(result.data.byteLength).toBe(100);
  });

  it("returns { ok: false, reason: 'no_body' } when the response body is null", async () => {
    const { response } = buildMockResponse({ bodyNull: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage(
      "https://example.com/image",
      DEFAULT_OPTIONS,
    );

    expect(result).toEqual({ ok: false, reason: "no_body" });
  });

  it("returns { ok: false, reason: 'network' } when reading the body stream fails midway", async () => {
    const { response, reader } = buildMockResponse({});
    reader.read
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(10) })
      .mockRejectedValueOnce(new Error("stream broken"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const result = await fetchRemoteImage(
      "https://example.com/image",
      DEFAULT_OPTIONS,
    );

    expect(result).toEqual({ ok: false, reason: "network" });
  });
});
