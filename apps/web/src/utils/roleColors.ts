/**
 * 角色配色：同一角色名全局固定同色，不同角色尽量使用不同颜色。
 * 用于章节详情 / 段落编辑中按角色区分段落卡片。
 */

export interface RoleColor {
  /** 主色（左边框、标题等） */
  color: string;
  /** 卡片背景色 */
  bg: string;
}

/** 预设调色板（柔和、可区分），按角色首次出现顺序循环分配 */
const ROLE_COLORS: RoleColor[] = [
  { color: '#1677ff', bg: '#e6f4ff' },
  { color: '#52c41a', bg: '#f6ffed' },
  { color: '#722ed1', bg: '#f9f0ff' },
  { color: '#fa8c16', bg: '#fff7e6' },
  { color: '#f5222d', bg: '#fff1f0' },
  { color: '#13c2c2', bg: '#e6fffb' },
  { color: '#eb2f96', bg: '#fff0f6' },
  { color: '#faad14', bg: '#fffbe6' },
  { color: '#2f54eb', bg: '#f0f5ff' },
  { color: '#a0d911', bg: '#fcffe6' },
];

/** 模块级缓存：角色名 -> 配色（跨页面保持一致） */
const roleColorCache = new Map<string, RoleColor>();

/** 获取角色配色；无角色名时按默认角色「旁白」处理 */
export function getRoleColor(characterName?: string | null): RoleColor {
  const key = (characterName || '').trim() || '旁白';
  let c = roleColorCache.get(key);
  if (!c) {
    c = ROLE_COLORS[roleColorCache.size % ROLE_COLORS.length];
    roleColorCache.set(key, c);
  }
  return c;
}
