/**
 * 火山引擎豆包 Provider（语音合成大模型 HTTP 非流式接口）
 *
 * 接口：POST https://openspeech.bytedance.com/api/v1/tts
 * 鉴权：Bearer Token（app.token）+ app.appid + app.cluster
 * 请求体嵌套：app / audio / request
 * 参数：voice_type / speed_ratio / pitch_ratio / volume_ratio / emotion
 * 文档：https://www.volcengine.com/docs/6561/79820（小模型HTTP非流式）
 *       https://www.volcengine.com/docs/6561/1257584（大模型HTTP非流式V1）
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

/** 豆包发音人列表（部分常用大模型音色，voice_type 来自官方音色列表） */
const DOUBAO_VOICES: VxVoice[] = [
  { id: 'zh_female_vv_qixian_mars_bigtts', name: 'Vivi 2.0', provider: VxProvider.DOUBAO, gender: 'female', age: 'young', description: '通用女声，自然亲切', supportedEmotions: [VxEmotion.HAPPY, VxEmotion.SAD, VxEmotion.ANGRY, VxEmotion.SURPRISED] },
  { id: 'zh_male_M392_conversation_wvae_bigtts', name: '沧桑男声', provider: VxProvider.DOUBAO, gender: 'male', age: 'middle', description: '沉稳磁性，适合旁白', supportedEmotions: [VxEmotion.SERIOUS, VxEmotion.SAD] },
  { id: 'zh_female_cancan_mars_bigtts', name: '灿灿 2.0', provider: VxProvider.DOUBAO, gender: 'female', age: 'young', description: '活泼清脆，22种情感', supportedEmotions: Object.values(VxEmotion) },
  { id: 'zh_male_shaohu_mars_bigtts', name: '少华', provider: VxProvider.DOUBAO, gender: 'male', age: 'young', description: '清爽少年音', supportedEmotions: [VxEmotion.HAPPY, VxEmotion.EXCITED] },
  { id: 'zh_female_wanxiang_mars_bigtts', name: '万象', provider: VxProvider.DOUBAO, gender: 'female', age: 'middle', description: '知性女声，适合有声书', supportedEmotions: [VxEmotion.GENTLE, VxEmotion.SERIOUS] },
  { id: 'zh_male_wennuanshizhong_mars_bigtts', name: '温暖时钟', provider: VxProvider.DOUBAO, gender: 'male', age: 'middle', description: '温暖沉稳，纪录片风格', supportedEmotions: [VxEmotion.GENTLE] },
  { id: 'zh_female_qingxin_mars_bigtts', name: '清新女声', provider: VxProvider.DOUBAO, gender: 'female', age: 'young', description: '清新自然', supportedEmotions: [VxEmotion.HAPPY, VxEmotion.RELAXED] },
];

/** 统一情感枚举 → 豆包 emotion 字符串映射（豆包用小写英文） */
const EMOTION_TO_DOUBAO: Partial<Record<VxEmotion, string>> = {
  [VxEmotion.NEUTRAL]: '',
  [VxEmotion.HAPPY]: 'happy',
  [VxEmotion.SAD]: 'sad',
  [VxEmotion.ANGRY]: 'angry',
  [VxEmotion.SURPRISED]: 'surprised',
  [VxEmotion.EXCITED]: 'excited',
  [VxEmotion.GENTLE]: 'gentle',
  [VxEmotion.SERIOUS]: 'serious',
  [VxEmotion.WHISPER]: 'whisper',
  [VxEmotion.DISGUSTED]: 'disgusted',
  [VxEmotion.FEARFUL]: 'fearful',
  [VxEmotion.RELAXED]: 'relaxed',
  [VxEmotion.BORED]: 'bored',
  [VxEmotion.TIRED]: 'tired',
  [VxEmotion.SARCASTIC]: 'sarcastic',
  [VxEmotion.CURIOUS]: 'curious',
  [VxEmotion.EMPATHETIC]: 'empathetic',
  [VxEmotion.CRYING]: 'crying',
};

/** 统一音频格式 → 豆包格式映射 */
const FORMAT_MAP: Record<string, string> = {
  mp3: 'mp3',
  wav: 'wav',
  pcm: 'pcm',
  opus: 'ogg',
};

export interface DoubaoProviderOptions {
  /** appid（火山引擎应用标识） */
  apiKey: string; // 复用统一字段名：实际是 access_token
  /** access_token，作为 Bearer Token */
  workspaceId: string; // 复用统一字段名：实际是 appid
  /** 集群，默认 volcano_tts */
  cluster?: string;
}

export class DoubaoProvider implements TTSProvider {
  readonly provider = VxProvider.DOUBAO;
  readonly displayName = '火山引擎豆包';

  private accessToken: string;
  private appid: string;
  private cluster: string;

  constructor(opts: DoubaoProviderOptions) {
    // 注意：为复用 VxProviderConfig 的 apiKey/workspaceId 字段，这里做语义映射
    // apiKey → access_token；workspaceId → appid
    this.accessToken = opts.apiKey;
    this.appid = opts.workspaceId;
    this.cluster = opts.cluster ?? 'volcano_tts';
  }

  getCapabilities(): VxProviderCapabilities {
    return {
      supportsInstruction: false, // 豆包用 emotion 枚举，不支持自然语言指令
      supportsEmotion: true,
      availableEmotions: Object.values(VxEmotion),
      speedRange: { min: 0.2, max: 3.0, default: 1.0 },
      pitchRange: { min: 0.1, max: 3.0, default: 1.0 },
      volumeRange: { min: 0, max: 100, default: 100 }, // 百分比 [0,100]，映射时 /100 → volume_ratio [0,1.0]，与 core 一致
      audioFormats: ['mp3', 'wav', 'pcm', 'opus'],
      supportsStreaming: true,
      supportsLongText: true, // 豆包有异步长文本接口（10万字）
    };
  }

  async listVoices(): Promise<VxVoice[]> {
    return DOUBAO_VOICES;
  }

  async synthesize(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    const { text, voiceId, voiceParams, format = 'mp3', sampleRate = 24000 } = input;

    // 统一参数 → 豆包参数
    const speedRatio = voiceParams?.speed ?? 1.0;
    const pitchRatio = voiceParams?.pitch ?? 1.0;
    const volumeRatio = (voiceParams?.volume != null ? voiceParams.volume / 100 : 1.0); // 百分比 → 比率
    const emotion = voiceParams?.emotion ? EMOTION_TO_DOUBAO[voiceParams.emotion] ?? '' : '';

    const body = {
      app: {
        appid: this.appid,
        token: this.accessToken,
        cluster: this.cluster,
      },
      user: { uid: 'voxit' },
      audio: {
        voice_type: voiceId,
        encoding: FORMAT_MAP[format],
        rate: sampleRate,
        speed_ratio: speedRatio,
        pitch_ratio: pitchRatio,
        volume_ratio: volumeRatio,
        ...(emotion && { emotion }),
      },
      request: {
        reqid: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        text,
        text_type: 'plain',
        operation: 'query', // 非流式：query；流式：submit
      },
    };

    const url = 'https://openspeech.bytedance.com/api/v1/tts';
    let resp;
    try {
      resp = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer; ${this.accessToken}`, // 豆包鉴权格式：Bearer; <token>（注意分号空格）
        },
        timeout: 60000,
      });
    } catch (e) {
      throw new Error(formatAxiosError('豆包合成', e));
    }

    // 豆包返回：{ code, message, data(base64), duration, audio_url? }
    const audioData: string | undefined = resp.data?.data;
    const audioUrl: string | undefined = resp.data?.audio_url;

    // 成功判定：code 必须为 3000，且至少有音频数据或 URL
    if (resp.data?.code !== 3000) {
      throw new Error(`豆包合成失败：code=${resp.data?.code} message=${resp.data?.message}`);
    }
    if (!audioData && !audioUrl) {
      throw new Error(`豆包合成返回空音频：code=3000 但无 data/audio_url`);
    }

    // 豆包非流式返回 base64 音频数据（无 URL），转成 data URL 便于前端直接播放
    const playableUrl = audioUrl ?? (audioData ? `data:audio/${format};base64,${audioData}` : undefined);

    return {
      audioUrl: playableUrl,
      format,
      sampleRate,
      requestId: resp.data?.reqid,
    };
  }

  async preview(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    return this.synthesize(input);
  }

  /**
   * 异步长文本合成（整章一次性，最多 10 万字符）
   * submit 创建任务 → 轮询 query 拿音频 URL
   * 适用于有声书整章合成，省调用次数
   */
  async synthesizeLongText(
    input: VxSynthesizeInput,
    onProgress?: (stage: string) => void,
  ): Promise<VxSynthesizeResult> {
    const { text, voiceId, voiceParams, format = 'mp3', sampleRate = 24000 } = input;
    const speedRatio = voiceParams?.speed ?? 1.0;
    const pitchRatio = voiceParams?.pitch ?? 1.0;
    const volumeRatio = voiceParams?.volume != null ? voiceParams.volume / 100 : 1.0;
    const emotion = voiceParams?.emotion ? EMOTION_TO_DOUBAO[voiceParams.emotion] ?? '' : '';

    // 1. submit 创建合成任务
    onProgress?.('提交长文本合成任务...');
    const submitBody = {
      app: { appid: this.appid, token: this.accessToken, cluster: this.cluster },
      user: { uid: 'voxit' },
      audio: {
        voice_type: voiceId,
        encoding: FORMAT_MAP[format],
        rate: sampleRate,
        speed_ratio: speedRatio,
        pitch_ratio: pitchRatio,
        volume_ratio: volumeRatio,
        ...(emotion && { emotion }),
      },
      request: {
        reqid: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        text,
        text_type: 'plain',
        operation: 'submit',
      },
    };

    let submitResp;
    try {
      submitResp = await axios.post('https://openspeech.bytedance.com/api/v1/tts', submitBody, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer; ${this.accessToken}` },
        timeout: 30000,
      });
    } catch (e) {
      throw new Error(formatAxiosError('豆包长文本提交', e));
    }

    // submit 返回中可能直接带 data（短文本），也可能需要轮询
    if (submitResp.data?.code === 3000 && (submitResp.data?.data || submitResp.data?.audio_url)) {
      const audioData = submitResp.data?.data;
      const audioUrl = submitResp.data?.audio_url;
      return {
        audioUrl: audioUrl ?? (audioData ? `data:audio/${format};base64,${audioData}` : undefined),
        format, sampleRate, requestId: submitResp.data?.reqid,
      };
    }

    // 2. 轮询 query（每 2 秒，最多 60 次 = 2 分钟）
    const reqid = submitBody.request.reqid;
    onProgress?.('合成中，轮询查询结果...');
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      onProgress?.(`合成中... (${i + 1}/60)`);

      const queryBody = {
        app: { appid: this.appid, token: this.accessToken, cluster: this.cluster },
        user: { uid: 'voxit' },
        audio: { voice_type: voiceId },
        request: { reqid, text: '', text_type: 'plain', operation: 'query' },
      };

      let queryResp;
      try {
        queryResp = await axios.post('https://openspeech.bytedance.com/api/v1/tts', queryBody, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer; ${this.accessToken}` },
          timeout: 30000,
        });
      } catch (e) {
        throw new Error(formatAxiosError('豆包长文本查询', e));
      }

      // code=3000 且有音频 = 完成
      if (queryResp.data?.code === 3000 && (queryResp.data?.data || queryResp.data?.audio_url)) {
        const audioData = queryResp.data?.data;
        const audioUrl = queryResp.data?.audio_url;
        return {
          audioUrl: audioUrl ?? (audioData ? `data:audio/${format};base64,${audioData}` : undefined),
          format, sampleRate, requestId: reqid,
        };
      }
      // 非 3000 且非"处理中" = 失败
      if (queryResp.data?.code && queryResp.data.code !== 3001 && queryResp.data.code !== 3002) {
        throw new Error(`豆包长文本合成失败：code=${queryResp.data.code} message=${queryResp.data.message}`);
      }
      // 3001/3002 = 处理中，继续轮询
    }
    throw new Error('豆包长文本合成超时（2 分钟未完成）');
  }
}