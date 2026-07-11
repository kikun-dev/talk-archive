/**
 * リモート画像取得の Repository（#129）
 * .eml インポートで、HTML 本文内のリモート画像参照（許可済み URL）から画像を取得する。
 * どの URL を許可するか・Content-Type の正規化や image/ 判定はビジネスルールなので
 * UseCase 層（emlImportUseCases）の責務とし、ここでは HTTP 取得と
 * サイズ上限の強制（ストリーム読み込み中の打ち切り）のみを行う
 */

export type RemoteImageFetchResult =
  | { ok: true; data: Uint8Array; contentType: string }
  | { ok: false; reason: "network" | "http_error" | "too_large" | "no_body" };

export type RemoteImageFetchOptions = {
  /** fetch 全体のタイムアウト（ミリ秒） */
  timeoutMs: number;
  /** 本体サイズの上限（バイト）。超過が確定した時点で読み込みを打ち切る */
  maxBytes: number;
};

/**
 * URL から画像を取得する
 * - リダイレクトは追わない（redirect: "error"。取得先は許可リストで検証済みの URL に
 *   限られるため、リダイレクト先への遷移は許可リストの迂回になる）。失敗は network 扱い
 * - `Content-Length` ヘッダが maxBytes を超える場合は本体を読む前に too_large を返す
 * - ヘッダが無い/偽装されている場合に備え、本体はチャンク単位で読み、累計が maxBytes を
 *   超えた時点で reader.cancel() して too_large を返す（巨大レスポンスを全読みしない）
 * - contentType は生ヘッダのまま返す（正規化・image/ 判定は UseCase 側）
 */
export async function fetchRemoteImage(
  url: string,
  options: RemoteImageFetchOptions,
): Promise<RemoteImageFetchResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: "error",
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) {
    return { ok: false, reason: "http_error" };
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  if (response.body === null) {
    return { ok: false, reason: "no_body" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "network" };
  }

  const data = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    ok: true,
    data,
    contentType: response.headers.get("content-type") ?? "",
  };
}
