/**
 * Voxit 核心数据模型（前后端共享）
 *
 * 命名约定：类型用 PascalCase，枚举前缀 Vx
 */

/** TTS 供应商标识 */
export enum VxProvider {
  ALIYUN = 'aliyun',
  DOUBAO = 'doubao',
}

/** 段落角色：旁白 / 角色 */
export enum VxRole {
  NARRATION = 'narration',
  CHARACTER = 'character',
}

/** 段落合成状态 */
export enum VxParagraphStatus {
  DRAFT = 'draft',
  SYNTHESIZING = 'synthesizing',
  DONE = 'done',
  FAILED = 'failed',
}

/** 音频格式 */
export type VxAudioFormat = 'mp3' | 'wav' | 'pcm' | 'opus';

/**
 * 发音人性格参数 —— 统一中间模型
 * 各 Provider 在调用时映射成自家参数名
 * （阿里云 rate/pitch/volume/instruction；豆包 speed_ratio/pitch_ratio/emotion）
 */
export interface VxVoiceParams {
  /** 语速，归一化范围，默认 1.0（具体范围见各 Provider capabilities） */
  speed?: number;
  /** 音调，归一化范围，默认 1.0（具体范围见各 Provider capabilities） */
  pitch?: number;
  /** 音量，百分比 [0, 100]，默认不设（各 Provider 用各自中性值） */
  volume?: number;
  /**
   * 情感/风格 —— 统一枚举，各 Provider 映射
   * 阿里云：通过 instruction 自然语言描述
   * 豆包：映射到 emotion 枚举值
   */
  emotion?: VxEmotion;
  /**
   * 自然语言指令（主要用于阿里云 CosyVoice/Qwen-TTS）
   * 如 "年轻活泼的女性，语速较快，上扬语调"
   */
  instruction?: string;
}

/** 情感枚举（取豆包 22 种风格的并集 + 通用） */
export enum VxEmotion {
  NEUTRAL = 'neutral',
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  SURPRISED = 'surprised',
  DISGUSTED = 'disgusted',
  FEARFUL = 'fearful',
  EXCITED = 'excited',
  RELAXED = 'relaxed',
  GENTLE = 'gentle',
  SERIOUS = 'serious',
  BORED = 'bored',
  TIRED = 'tired',
  SARCASTIC = 'sarcastic',
  CURIOUS = 'curious',
  EMPATHETIC = 'empathetic',
  WHISPER = 'whisper',
  CRYING = 'crying',
}

/** 发音人性别 */
export type VxVoiceGender = 'male' | 'female' | 'neutral';

/** 发音人年龄档 */
export type VxVoiceAge = 'child' | 'teen' | 'young' | 'middle' | 'senior';

/**
 * 发音人元数据 —— 统一描述，前端据此渲染选择列表
 * 各 Provider 把自家发音人转换成此结构
 */
export interface VxVoice {
  /** 发音人 ID（Provider 原生 ID，如阿里云 longanhuan_v3、豆包 zh_female_vv_...） */
  id: string;
  /** 显示名 */
  name: string;
  /** 所属 Provider */
  provider: VxProvider;
  /** 性别 */
  gender?: VxVoiceGender;
  /** 年龄档 */
  age?: VxVoiceAge;
  /** 风格描述（如"沉稳磁性"、"活泼清脆"） */
  description?: string;
  /** 支持的情感列表（部分音色仅支持子集） */
  supportedEmotions?: VxEmotion[];
  /** 是否支持自然语言指令控制 */
  supportsInstruction?: boolean;
  /** 试听示例句（可选） */
  sampleText?: string;
}

/** 段落 */
export interface VxParagraph {
  id: string;
  chapterId: string;
  /** 段落序号，从 0 开始 */
  index: number;
  /** 段落文本（可编辑） */
  text: string;
  /** 旁白 / 角色 */
  role: VxRole;
  /** 角色名（role=character 时填写，如"林黛玉"） */
  characterName?: string;
  /** 该段选用的发音人 ID */
  voiceId?: string;
  /** 性格参数 */
  voiceParams?: VxVoiceParams;
  /** 合成产物音频 URL（本地或远端） */
  audioUrl?: string;
  /** 合成状态 */
  status: VxParagraphStatus;
  /** 失败原因 */
  error?: string;
  /** 创建/更新时间戳（ms） */
  createdAt: number;
  updatedAt: number;
}

/** 章节 */
export interface VxChapter {
  id: string;
  projectId: string;
  index: number;
  title: string;
  paragraphs: VxParagraph[];
  createdAt: number;
  updatedAt: number;
}

/** 项目级 Provider 配置 */
export interface VxProviderConfig {
  provider: VxProvider;
  /** 阿里云：API Key；豆包：access_token */
  apiKey?: string;
  /** 阿里云：Workspace ID；豆包：appid */
  workspaceId?: string;
  /** 默认旁白发音人 ID */
  defaultNarrationVoiceId?: string;
  /** 默认音频格式 */
  audioFormat?: VxAudioFormat;
  /** 默认采样率 */
  sampleRate?: number;
}

/** 有声书项目 */
export interface VxProject {
  id: string;
  name: string;
  description?: string;
  providerConfig: VxProviderConfig;
  chapters: VxChapter[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 角色发音人模板 —— 项目级"角色名 → 发音人+参数"映射
 * 新增段落选角色名时自动套用模板配置
 */
export interface VxVoiceTemplate {
  id: string;
  projectId: string;
  /** 角色名（如"林黛玉"） */
  characterName: string;
  /** 发音人 ID */
  voiceId: string;
  /** 性格参数 */
  voiceParams?: VxVoiceParams;
  createdAt: number;
  updatedAt: number;
}