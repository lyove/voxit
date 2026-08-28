/**
 * TTS Provider 抽象接口
 *
 * 每个 AI 供应商（阿里云、豆包等）实现此接口，
 * 把鉴权、协议、参数名的差异封装在各自实现里。
 * 后端通过此接口统一调用，前端通过此接口获取能力元数据。
 */
import type {
  VxAudioFormat,
  VxEmotion,
  VxParagraph,
  VxProvider,
  VxVoice,
  VxVoiceParams,
} from './models.js';

/** 合成请求参数 */
export interface VxSynthesizeInput {
  /** 待合成文本 */
  text: string;
  /** 发音人 ID（Provider 原生） */
  voiceId: string;
  /** 性格参数（统一模型） */
  voiceParams?: VxVoiceParams;
  /** 音频格式 */
  format?: VxAudioFormat;
  /** 采样率 */
  sampleRate?: number;
}

/** 合成结果 */
export interface VxSynthesizeResult {
  /** 音频数据（Base64，二进制流时用） */
  audioData?: string;
  /** 音频 URL（非流式返回，可能有效期限制） */
  audioUrl?: string;
  /** 音频格式 */
  format: VxAudioFormat;
  /** 采样率 */
  sampleRate: number;
  /** 计费字符数 */
  billedCharacters?: number;
  /** Provider 原始 request_id */
  requestId?: string;
}

/** Provider 能力声明 —— 前端据此动态渲染表单 */
export interface VxProviderCapabilities {
  /** 是否支持自然语言指令控制情感 */
  supportsInstruction: boolean;
  /** 是否支持情感枚举 */
  supportsEmotion: boolean;
  /** 支持的情感列表 */
  availableEmotions: VxEmotion[];
  /** 语速范围 */
  speedRange: { min: number; max: number; default: number };
  /** 音调范围 */
  pitchRange: { min: number; max: number; default: number };
  /** 音量范围 */
  volumeRange: { min: number; max: number; default: number };
  /** 支持的音频格式 */
  audioFormats: VxAudioFormat[];
  /** 是否支持流式输出 */
  supportsStreaming: boolean;
  /** 是否支持异步长文本（整章一次性） */
  supportsLongText: boolean;
}

/**
 * TTS Provider 抽象接口
 */
export interface TTSProvider {
  /** Provider 标识 */
  readonly provider: VxProvider;

  /** 显示名 */
  readonly displayName: string;

  /** 获取能力声明（前端据此渲染表单） */
  getCapabilities(): VxProviderCapabilities;

  /** 获取可用发音人列表 */
  listVoices(): Promise<VxVoice[]>;

  /**
   * 合成语音（段落级，非流式优先，适合有声书制作）
   * @returns 合成结果，含音频 URL 或 Base64 数据
   */
  synthesize(input: VxSynthesizeInput): Promise<VxSynthesizeResult>;

  /**
   * 试听 —— 短文本快速合成
   * 默认实现复用 synthesize，子类可覆写以走更快的试听通道
   */
  preview(input: VxSynthesizeInput): Promise<VxSynthesizeResult>;
}

/**
 * Provider 工厂注册表
 * 后端通过 provider 标识拿到对应实现
 */
export interface VxProviderRegistry {
  get(provider: VxProvider): TTSProvider;
  register(provider: TTSProvider): void;
  list(): VxProvider[];
}