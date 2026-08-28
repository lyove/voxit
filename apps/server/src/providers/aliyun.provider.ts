/**
 * 阿里云百炼 Provider（CosyVoice / Qwen-TTS 非实时合成）
 *
 * 接口：POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
 * 鉴权：Authorization: Bearer <API Key>
 * 文档：https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api
 */
import axios from 'axios';
import { formatAxiosError } from './errors.js';
import {
  VxAudioFormat,
  VxEmotion,
  VxProvider,
  type TTSProvider,
  type VxProviderCapabilities,
  type VxSynthesizeInput,
  type VxSynthesizeResult,
  type VxVoice,
} from '@voxit/core';

/**
 * 阿里云发音人列表 —— 仅保留实测当前账号 + cosyvoice-v3-flash 可合成的音色
 * （曾包含 Ethan/Cherry（Qwen-TTS 音色）、longchuan_v3、longxiao_v3，
 *  实测在 /api/v1/services/audio/tts/SpeechSynthesizer 接口下均返回 400，
 *  选中后试听/合成必然失败，故移除）
 */
const ALIYUN_VOICES: VxVoice[] = [
  { id: 'longhao_v3', name: '龙皓轩', provider: VxProvider.ALIYUN, gender: 'male', age: 'middle', description: '沉稳磁性，适合旁白解说', supportsInstruction: true, sampleText: '我家的后面有一个很大的花园。' },
  { id: 'longwanjun_v3', name: '龙婉清', provider: VxProvider.ALIYUN, gender: 'female', age: 'young', description: '温柔知性，适合有声书朗读', supportsInstruction: true },
  { id: 'longshange_v3', name: '龙山歌', provider: VxProvider.ALIYUN, gender: 'male', age: 'middle', description: '方言支持，陕西话', supportsInstruction: true },
];

/** 当前模型下可合成的音色集合（试听/合成前校验） */
const AVAILABLE_VOICE_IDS = new Set(ALIYUN_VOICES.map((v) => v.id));

/**
 * 旧/错误音色 ID → 官方 v3 音色兼容映射
 * 历史数据（段落/模板）中可能存有此前错误绑定的 ID：
 *  - longanhuan_v3 官方实为「龙安欢（女）」，此前误用作「龙皓轩」→ 归一到男声 longhao_v3（龙浩）
 *  - longanyang / longanyang_v3 官方为「龙安洋（男）」/ 不存在，此前误用作「龙婉清」→ 归一到女声 longwanjun_v3（龙婉君）
 * 否则在 cosyvoice-v3 模型下会回退默认音色导致"选男声出女声"
 */
const VOICE_ID_ALIASES: Record<string, string> = {
  longanhuan_v3: 'longhao_v3',
  longanyang: 'longwanjun_v3',
  longanyang_v3: 'longwanjun_v3',
};

/** 情感枚举 → 阿里云自然语言指令映射 */
const EMOTION_TO_INSTRUCTION: Partial<Record<VxEmotion, string>> = {
  [VxEmotion.HAPPY]: '语调轻快，带愉悦感',
  [VxEmotion.SAD]: '语调低沉，带悲伤感',
  [VxEmotion.ANGRY]: '语气严厉，带愤怒感',
  [VxEmotion.EXCITED]: '语调上扬，带兴奋感',
  [VxEmotion.GENTLE]: '语气温和，带温柔感',
  [VxEmotion.SERIOUS]: '语气沉稳，带严肃感',
  [VxEmotion.WHISPER]: '轻声耳语',
  [VxEmotion.CRYING]: '带哭腔',
  [VxEmotion.SURPRISED]: '语调上扬，带惊讶感',
  [VxEmotion.DISGUSTED]: '语气嫌恶，带厌恶感',
  [VxEmotion.FEARFUL]: '语调颤抖，带恐惧感',
  [VxEmotion.RELAXED]: '语调舒缓，带放松感',
  [VxEmotion.BORED]: '语气平淡，带无聊感',
  [VxEmotion.TIRED]: '语速缓慢，带疲惫感',
  [VxEmotion.SARCASTIC]: '语气戏谑，带讽刺感',
  [VxEmotion.CURIOUS]: '语调上扬，带好奇感',
  [VxEmotion.EMPATHETIC]: '语气温和，带共情',
};

export interface AliyunProviderOptions {
  apiKey: string;
  workspaceId: string;
  /** 模型，默认 cosyvoice-v3-flash */
  model?: string;
}

export class AliyunProvider implements TTSProvider {
  readonly provider = VxProvider.ALIYUN;
  readonly displayName = '阿里云百炼';

  private apiKey: string;
  private workspaceId: string;
  private model: string;

  constructor(opts: AliyunProviderOptions) {
    this.apiKey = opts.apiKey;
    this.workspaceId = opts.workspaceId;
    this.model = opts.model ?? 'cosyvoice-v3-flash';
  }

  getCapabilities(): VxProviderCapabilities {
    return {
      supportsInstruction: true,
      supportsEmotion: true,
      availableEmotions: Object.values(VxEmotion),
      speedRange: { min: 0.5, max: 2.0, default: 1.0 },
      pitchRange: { min: 0.5, max: 2.0, default: 1.0 },
      volumeRange: { min: 0, max: 100, default: 50 },
      audioFormats: ['mp3', 'wav', 'pcm', 'opus'],
      supportsStreaming: true,
      supportsLongText: false,
    };
  }

  async listVoices(): Promise<VxVoice[]> {
    return ALIYUN_VOICES;
  }

  async synthesize(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    const { text, voiceId, voiceParams, format = 'wav', sampleRate = 24000 } = input;

    // 旧 ID → 官方 v3 ID 归一化（兼容历史数据）
    const finalVoiceId = VOICE_ID_ALIASES[voiceId] ?? voiceId;

    // 音色可用性校验：避免已绑定不可用音色的段落试听时收到晦涩的阿里云 400
    if (!AVAILABLE_VOICE_IDS.has(finalVoiceId)) {
      throw new Error(`音色「${finalVoiceId}」不可用：当前模型 ${this.model} 不支持该音色，请在发音人列表中重新选择`);
    }

    // 统一参数 → 阿里云参数
    const instruction = this.buildInstruction(voiceParams);

    const body = {
      model: this.model,
      input: {
        text,
        voice: finalVoiceId,
        format,
        sample_rate: sampleRate,
        ...(voiceParams?.speed != null && { rate: voiceParams.speed }),
        ...(voiceParams?.pitch != null && { pitch: voiceParams.pitch }),
        ...(voiceParams?.volume != null && { volume: voiceParams.volume }),
        ...(instruction && { instruction }),
      },
    };

    const url = `https://${this.workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`;

    let resp;
    try {
      resp = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });
    } catch (e) {
      throw new Error(formatAxiosError('阿里云合成', e));
    }

    const audioUrl: string | undefined = resp.data?.output?.audio?.url;
    if (!audioUrl) {
      throw new Error(`阿里云合成失败：${JSON.stringify(resp.data)}`);
    }

    return {
      audioUrl,
      format,
      sampleRate,
      billedCharacters: resp.data?.usage?.characters,
      requestId: resp.data?.request_id,
    };
  }

  async preview(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    // 试听走同一接口（短文本）
    return this.synthesize(input);
  }

  /** 把统一 voiceParams 编译成阿里云 instruction 自然语言指令 */
  private buildInstruction(params?: VxSynthesizeInput['voiceParams']): string {
    if (!params) return '';
    const parts: string[] = [];
    if (params.emotion && params.emotion !== VxEmotion.NEUTRAL) {
      const emo = EMOTION_TO_INSTRUCTION[params.emotion];
      if (emo) parts.push(emo);
    }
    if (params.instruction) parts.push(params.instruction);
    return parts.join('。');
  }
}