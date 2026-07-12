/**
 * リモート画像取得の Repository（#129）
 * .eml インポートで、HTML 本文内のリモート画像参照（許可済み URL）から画像を取得する。
 * どの URL を許可するか・Content-Type の正規化や image/ 判定はビジネスルールなので
 * UseCase 層（emlImportUseCases）の責務とし、ここでは HTTP 取得と
 * サイズ上限の強制（ストリーム読み込み中の打ち切り）のみを行う
 */

export type RemoteImageFetchResult =
  | { ok: true; data: Uint8Array; contentType: string }
  | { ok: false; reason: "network"; networkKind: "timeout" | "other" }
  | { ok: false; reason: "http_error"; status: number }
  | { ok: false; reason: "too_large" }
  | { ok: false; reason: "no_body" };

export type RemoteImageFetchOptions = {
  /** fetch 全体のタイムアウト（ミリ秒） */
  timeoutMs: number;
  /** 本体サイズの上限（バイト）。超過が確定した時点で読み込みを打ち切る */
  maxBytes: number;
};

/**
 * fetch 呼び出し自体、または本文ストリーム読み込み中に投げられた例外を network の
 * サブ分類に振り分ける（#137: 配信元の一時的な 502/504 をリトライ対象にするため、
 * UseCase 層がタイムアウトとそれ以外を区別できるようにする）。
 * `AbortSignal.timeout(options.timeoutMs)` による中断は、fetch 実装によらず
 * `DOMException`（`name: "TimeoutError"`）として届くため、これを timeout、
 * それ以外（DNS解決失敗・接続断・redirect: "error" によるリダイレクト拒否など）を
 * other として扱う。
 *
 * redirect: "error" によるリダイレクト拒否もここを通り other に分類される
 * （undici が投げる例外は TimeoutError ではないため）。これは意図的な設計判断で、
 * 許可リスト済み URL への再試行が数回増えるだけで実害はなく、undici の例外
 * メッセージ文字列（バージョン依存で変わりうる）を判定条件にする脆い実装を
 * 避けるためのトレードオフとして受け入れる
 */
function classifyNetworkError(error: unknown): "timeout" | "other" {
  return error instanceof DOMException && error.name === "TimeoutError"
    ? "timeout"
    : "other";
}

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
  } catch (error) {
    return { ok: false, reason: "network", networkKind: classifyNetworkError(error) };
  }

  if (!response.ok) {
    // 本体を読まずに早期returnするため、undici の接続を確実に解放するよう
    // 明示的にキャンセルする。キャンセル自体の失敗は返す reason に影響させない
    // （#132 レビュー対応 P1-2: 未消費のまま返すとコネクションプールを圧迫し得る）
    await response.body?.cancel().catch(() => {});
    return { ok: false, reason: "http_error", status: response.status };
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      // 同上（#132 レビュー対応 P1-2）: Content-Length の事前チェックで本体を
      // 読まずに返す経路も、未消費のまま放置しない
      await response.body?.cancel().catch(() => {});
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
  } catch (error) {
    return { ok: false, reason: "network", networkKind: classifyNetworkError(error) };
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
