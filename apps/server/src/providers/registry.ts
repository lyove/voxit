/**
 * Provider 工厂 —— 按 VxProvider 标识创建 Provider 实例
 * 注意：不再使用全局注册表，每次按凭证创建独立实例，
 * 避免并发请求间凭证互相覆盖。
 */
import {
  VxProvider,
  type TTSProvider,
} from '@voxit/core';
import { AliyunProvider } from './aliyun.provider.js';
import { DoubaoProvider } from './doubao.provider.js';

/** 根据凭证创建 Provider 实例（每次独立，不全局注册） */
export function initProvider(
  provider: VxProvider,
  config: { apiKey: string; workspaceId: string },
): TTSProvider {
  if (provider === VxProvider.ALIYUN) {
    return new AliyunProvider(config);
  }
  if (provider === VxProvider.DOUBAO) {
    return new DoubaoProvider(config);
  }
  throw new Error(`Provider ${provider} 暂未实现`);
}

/** 获取 Provider 的能力声明（静态，不依赖凭证） */
export function getCapabilities(provider: VxProvider) {
  if (provider === VxProvider.ALIYUN) {
    return new AliyunProvider({ apiKey: '', workspaceId: '' }).getCapabilities();
  }
  if (provider === VxProvider.DOUBAO) {
    return new DoubaoProvider({ apiKey: '', workspaceId: '' }).getCapabilities();
  }
  throw new Error(`Provider ${provider} 暂未实现`);
}