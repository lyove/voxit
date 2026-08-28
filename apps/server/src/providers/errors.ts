/**
 * Provider 层错误处理工具
 * formatAxiosError：把 Axios 错误转成可读消息，并附带 "HTTP xxx" 标记
 * （供路由层 inferStatus 推断状态码）
 */

/** 判断是否为 Axios 错误 */
export function isAxiosError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as Record<string, unknown>).isAxiosError === true;
}

/** 从 Axios 错误中提取可读信息 */
export function formatAxiosError(action: string, error: unknown): string {
  if (isAxiosError(error)) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
      code?: string;
    };
    const status = e.response?.status;
    const data = e.response?.data as
      | string
      | { message?: string; error?: { message?: string } | string }
      | undefined;
    let detail: unknown = e.message;
    if (typeof data === 'string' && data) detail = data;
    else if (data && typeof data === 'object') {
      detail = data.message ?? (typeof data.error === 'string' ? data.error : data.error?.message) ?? e.message;
    }
    return `${action}失败（HTTP ${status ?? '网络错误'}）：${detail}`;
  }
  return `${action}失败：${error instanceof Error ? error.message : String(error)}`;
}
