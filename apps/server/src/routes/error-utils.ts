/**
 * 路由层错误处理 —— 从 Provider 错误信息中推断合适的 HTTP 状态码
 * 把 "（HTTP 401）" 这类标记转成对应状态码，而非统一 500
 */

/** 从错误信息中提取 HTTP 状态码，推断合适的响应状态 */
export function inferStatus(errorMessage: string): number {
  if (errorMessage.includes('HTTP 401')) return 401;
  if (errorMessage.includes('HTTP 403')) return 403;
  if (errorMessage.includes('HTTP 429')) return 429;
  if (errorMessage.includes('HTTP 400')) return 400;
  if (errorMessage.includes('HTTP 404')) return 404;
  return 500;
}

/** 统一的路由 catch 处理：推断状态码 + 返回错误信息 */
export function sendError(res: any, e: unknown): void {
  const msg = (e as Error).message ?? '未知错误';
  res.status(inferStatus(msg)).json({ error: msg });
}