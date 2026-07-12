/**
 * リモート画像取得の Repository（#129）
 * .eml インポートで、HTML 本文内のリモート画像参照（許可済み URL）から画像を取得する。
 * どの URL を許可するか・Content-Type の正規化や image/ 判定はビジネスルールなので
 * UseCase 層（emlImportUseCases）の責務とし、ここでは HTTP 取得と
 * サイズ上限の強制（ストリーム読み込み中の打ち切り）のみを行う
 */

/**
 * 失敗側すべてに `bytesRead`（その試行で実際に本体から読み込んだバイト数）を持つ
 * （#139 P1-2: バッチ合計サイズ上限は成功した取得分だけでなく、失敗した試行で
 * 実際にダウンロードしたバイト数も含めて判定する必要があるため。各試行は実際に
 * 別の通信を行っており、失敗して捨てたバイト数も回線・配信元の負荷としては
 * 発生済みである）。本体を読む前に確定する理由（http_error・too_large の
 * Content-Length 事前チェック・no_body・fetch 呼び出し自体の例外としての network）は
 * 常に0。ストリーム読み込み中に確定する理由（too_large のストリーム打ち切り・
 * ストリーム読み込み中の例外としての network）は、確定した時点までの累計バイト数
 */
export type RemoteImageFetchResult =
  | { ok: true; data: Uint8Array; contentType: string }
  | { ok: false; reason: "network"; networkKind: "timeout" | "other"; bytesRead: number }
  | { ok: false; reason: "http_error"; status: number; bytesRead: number }
  | { ok: false; reason: "too_large"; bytesRead: number }
  | { ok: false; reason: "no_body"; bytesRead: number };

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
    // fetch 呼び出し自体の例外なので本体は一切読んでいない（bytesRead: 0、#139 P1-2）
    return {
      ok: false,
      reason: "network",
      networkKind: classifyNetworkError(error),
      bytesRead: 0,
    };
  }

  if (!response.ok) {
    // 本体を読まずに早期returnするため、undici の接続を確実に解放するよう
    // 明示的にキャンセルする。キャンセル自体の失敗は返す reason に影響させない
    // （#132 レビュー対応 P1-2: 未消費のまま返すとコネクションプールを圧迫し得る）
    await response.body?.cancel().catch(() => {});
    // 本体を読まずに cancel しているため bytesRead: 0（#139 P1-2）
    return { ok: false, reason: "http_error", status: response.status, bytesRead: 0 };
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
      // 同上（#132 レビュー対応 P1-2）: Content-Length の事前チェックで本体を
      // 読まずに返す経路も、未消費のまま放置しない
      await response.body?.cancel().catch(() => {});
      // Content-Length の事前チェックで打ち切るため本体を読んでいない（bytesRead: 0、#139 P1-2）
      return { ok: false, reason: "too_large", bytesRead: 0 };
    }
  }

  if (response.body === null) {
    return { ok: false, reason: "no_body", bytesRead: 0 };
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
        // cancel 自体の失敗は返す reason に影響させない（#139 P2-2: 外側の catch に
        // 落とすと too_large が network に変わり、リトライ対象外のはずのサイズ超過が
        // 再試行されてしまう。response.body.cancel() の経路と同じ扱いに揃える）
        await reader.cancel().catch(() => {});
        // ストリーム読み込み中に上限超過を検知した時点の累計を返す（#139 P1-2）
        return { ok: false, reason: "too_large", bytesRead: totalBytes };
      }
      chunks.push(value);
    }
  } catch (error) {
    // 本文ストリーム読み込み中の例外なので、それまでに読んだ累計バイト数を返す
    // （捨てずに保持する。#139 P1-2: バッチ合計サイズ上限の判定に必要）
    return {
      ok: false,
      reason: "network",
      networkKind: classifyNetworkError(error),
      bytesRead: totalBytes,
    };
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
