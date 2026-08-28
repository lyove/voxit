/**
 * 登录状态管理：token 存 localStorage + 登录/登出 API
 */
import axios from 'axios';

const TOKEN_KEY = 'voxit-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/** 调用后端登录接口，成功则保存 token */
export async function login(username: string, password: string): Promise<void> {
  const resp = await axios.post('/api/auth/login', { username, password });
  setToken(resp.data.token);
}

/** 登出（仅清本地，后端无状态） */
export function logout(): void {
  clearToken();
  window.location.href = '/login';
}
