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

type BaseVoice = Omit<VxVoice, 'provider' | 'model'>;

/** CosyVoice-v3-Flash 官方音色（88 个） */
const V3_FLASH_VOICES: BaseVoice[] = [
  // 有声书 · 旁白（中文普通话）
  { id: 'longwanjun_v3', name: '龙婉君', gender: 'female', age: 'young', description: '细腻柔声女，适合有声书朗读', supportsInstruction: true },
  { id: 'longyichen_v3', name: '龙逸尘', gender: 'male', age: 'young', description: '洒脱活力男，适合角色旁白', supportsInstruction: true },
  { id: 'longlaobo_v3', name: '龙老伯', gender: 'male', age: 'senior', description: '沧桑岁月爷，适合长辈角色', supportsInstruction: true },
  { id: 'longlaoyi_v3', name: '龙老姨', gender: 'female', age: 'senior', description: '烟火从容阿姨，适合长辈角色', supportsInstruction: true },
  { id: 'longhao_v3', name: '龙浩', gender: 'male', age: 'middle', description: '多情忧郁男，磁性低沉', supportsInstruction: true },
  { id: 'longsanshu_v3', name: '龙三叔', gender: 'male', age: 'middle', description: '沉稳质感男，厚重有代入感', supportsInstruction: true },
  { id: 'longmiao_v3', name: '龙妙', gender: 'female', age: 'young', description: '抑扬顿挫女，朗诵感强', supportsInstruction: true },
  { id: 'longyuan_v3', name: '龙媛', gender: 'female', age: 'middle', description: '温暖治愈女，细腻情感', supportsInstruction: true },
  { id: 'longyue_v3', name: '龙悦', gender: 'female', age: 'middle', description: '温暖磁性女，评书腔调', supportsInstruction: true },
  { id: 'longxiu_v3', name: '龙修', gender: 'male', age: 'middle', description: '博才说书男，悬疑解说', supportsInstruction: true },
  { id: 'longnan_v3', name: '龙楠', gender: 'male', age: 'young', description: '睿智青年男，庄重有说服力', supportsInstruction: true },
  { id: 'longfei_v3', name: '龙飞', gender: 'male', age: 'middle', description: '热血磁性男，激情解说', supportsInstruction: true },
  { id: 'longdaiyu_v3', name: '龙黛玉', gender: 'female', age: 'teen', description: '娇率才女音，短视频配音', supportsInstruction: true },
  // 情感 · 陪伴闲聊
  { id: 'longxiaochun_v3', name: '龙小淳', gender: 'female', age: 'young', description: '知性积极女，温暖亲切', supportsInstruction: true },
  { id: 'longxiaoxia_v3', name: '龙小夏', gender: 'female', age: 'young', description: '沉稳权威女，温润磁性', supportsInstruction: true },
  { id: 'longyumi_v3', name: 'YUMI', gender: 'female', age: 'young', description: '正经青年女，活泼自然', supportsInstruction: true },
  { id: 'longanwen_v3', name: '龙安温', gender: 'female', age: 'middle', description: '优雅知性女，语音助手', supportsInstruction: true },
  { id: 'longanli_v3', name: '龙安莉', gender: 'female', age: 'middle', description: '利落从容女，日程播报', supportsInstruction: true },
  { id: 'longanlang_v3', name: '龙安朗', gender: 'male', age: 'young', description: '清爽利落男，语音助手', supportsInstruction: true },
  { id: 'longanyun_v3', name: '龙安昀', gender: 'male', age: 'middle', description: '居家暖男，温柔居家感', supportsInstruction: true },
  { id: 'longanrou_v3', name: '龙安柔', gender: 'female', age: 'young', description: '温柔闺蜜女', supportsInstruction: true },
  { id: 'longanzhi_v3', name: '龙安智', gender: 'male', age: 'middle', description: '睿智轻熟男，播客解说', supportsInstruction: true },
  { id: 'longanling_v3', name: '龙安灵', gender: 'female', age: 'young', description: '思维灵动女，职场话题', supportsInstruction: true },
  { id: 'longanya_v3', name: '龙安雅', gender: 'female', age: 'middle', description: '高雅气质女，优雅知性', supportsInstruction: true },
  { id: 'longanqin_v3', name: '龙安亲', gender: 'female', age: 'young', description: '亲和活泼女，接地气', supportsInstruction: true },
  { id: 'longhua_v3', name: '龙华', gender: 'female', age: 'young', description: '元气甜美女，糖分爆棚', supportsInstruction: true },
  { id: 'longcheng_v3', name: '龙橙', gender: 'male', age: 'young', description: '智慧青年男，沉稳通透', supportsInstruction: true },
  { id: 'longze_v3', name: '龙泽', gender: 'male', age: 'young', description: '温暖元气男，少年感', supportsInstruction: true },
  { id: 'longzhe_v3', name: '龙哲', gender: 'male', age: 'middle', description: '呆板大暖男，厚实温和', supportsInstruction: true },
  { id: 'longyan_v3', name: '龙颜', gender: 'female', age: 'middle', description: '温暖春风女，安抚感', supportsInstruction: true },
  { id: 'longxing_v3', name: '龙星', gender: 'female', age: 'young', description: '温婉邻家女，柔软细腻', supportsInstruction: true },
  { id: 'longtian_v3', name: '龙天', gender: 'male', age: 'middle', description: '磁性理智男，低沉有说服力', supportsInstruction: true },
  { id: 'longwan_v3', name: '龙婉', gender: 'female', age: 'young', description: '积极知性女，温柔细腻', supportsInstruction: true },
  { id: 'longqiang_v3', name: '龙嫱', gender: 'female', age: 'middle', description: '浪漫风情女，慵懒沙哑', supportsInstruction: true },
  { id: 'longfeifei_v3', name: '龙菲菲', gender: 'female', age: 'young', description: '甜美娇气女，清亮爽朗', supportsInstruction: true },
  { id: 'longhan_v3', name: '龙寒', gender: 'male', age: 'middle', description: '温暖痴情男，沉绵温润', supportsInstruction: true },
  { id: 'longanyang', name: '龙安洋', gender: 'male', age: 'young', description: '阳光大男孩（标准版）', supportsInstruction: true },
  { id: 'longanhuan', name: '龙安欢', gender: 'female', age: 'young', description: '欢脱元气女（标准版）', supportsInstruction: true },
  { id: 'longanhuan_v3', name: '龙安欢 V3', gender: 'female', age: 'young', description: '欢脱元气女，支持粤/东北/河南/湖南/陕西/山东/四川/安徽等多地方言', supportsInstruction: true },
  // 童声 · 角色音
  { id: 'longhuhu_v3', name: '龙呼呼', gender: 'female', age: 'child', description: '天真烂漫女童', supportsInstruction: true },
  { id: 'longpaopao_v3', name: '龙泡泡', gender: 'neutral', age: 'child', description: '飞天泡泡音', supportsInstruction: true },
  { id: 'longjielidou_v3', name: '龙杰力豆', gender: 'male', age: 'child', description: '阳光顽皮男童', supportsInstruction: true },
  { id: 'longxian_v3', name: '龙仙', gender: 'female', age: 'child', description: '豪放可爱女童', supportsInstruction: true },
  { id: 'longling_v3', name: '龙铃', gender: 'female', age: 'child', description: '稚气呆板女童', supportsInstruction: true },
  { id: 'longshanshan_v3', name: '龙闪闪', gender: 'neutral', age: 'child', description: '戏剧化童声', supportsInstruction: true },
  { id: 'longniuniu_v3', name: '龙牛牛', gender: 'male', age: 'child', description: '阳光男童声', supportsInstruction: true },
  { id: 'longjiqi_v3', name: '龙机器', gender: 'neutral', age: 'middle', description: '呆萌机器人', supportsInstruction: true },
  { id: 'longhouge_v3', name: '龙猴哥', gender: 'male', age: 'young', description: '经典猴哥', supportsInstruction: true },
  // 客服 · 销售
  { id: 'longyingxiao_v3', name: '龙应笑', gender: 'female', age: 'young', description: '清甜推销女', supportsInstruction: true },
  { id: 'longyingxun_v3', name: '龙应询', gender: 'male', age: 'young', description: '年轻青涩男，客服专员', supportsInstruction: true },
  { id: 'longyingmu_v3', name: '龙应沐', gender: 'female', age: 'young', description: '优雅知性女，电话助手', supportsInstruction: true },
  { id: 'longyingtao_v3', name: '龙应桃', gender: 'female', age: 'young', description: '温柔淡定女，客服', supportsInstruction: true },
  { id: 'longyingling_v3', name: '龙应聆', gender: 'female', age: 'young', description: '温和共情女，售后', supportsInstruction: true },
  { id: 'longyingjing_v3', name: '龙应静', gender: 'female', age: 'middle', description: '低调冷静女，催收售后', supportsInstruction: true },
  { id: 'longantai_v3', name: '龙安台', gender: 'female', age: 'young', description: '嗲甜台湾女', supportsInstruction: true },
  { id: 'longanran_v3', name: '龙安燃', gender: 'female', age: 'middle', description: '活泼质感女，直播带货', supportsInstruction: true },
  { id: 'longanxuan_v3', name: '龙安宣', gender: 'female', age: 'middle', description: '经典直播女', supportsInstruction: true },
  { id: 'longshu_v3', name: '龙书', gender: 'male', age: 'young', description: '沉稳青年男，新闻播报', supportsInstruction: true },
  { id: 'longshuo_v3', name: '龙硕', gender: 'male', age: 'young', description: '博才干练男，新闻播报', supportsInstruction: true },
  { id: 'loongbella_v3', name: 'Bella 3.0', gender: 'female', age: 'young', description: '精准干练女，新闻播报', supportsInstruction: true },
  // 方言
  { id: 'longshange_v3', name: '龙陕哥', gender: 'male', age: 'middle', description: '原味陕北男，陕西话', supportsInstruction: true },
  { id: 'longanyue_v3', name: '龙安粤', gender: 'male', age: 'middle', description: '欢脱粤语男', supportsInstruction: true },
  { id: 'longanmin_v3', name: '龙安闽', gender: 'female', age: 'young', description: '清纯萝莉女，闽南话', supportsInstruction: true },
  { id: 'longjiaxin_v3', name: '龙嘉欣', gender: 'female', age: 'middle', description: '优雅粤语女', supportsInstruction: true },
  { id: 'longjiayi_v3', name: '龙嘉怡', gender: 'female', age: 'young', description: '知性粤语女', supportsInstruction: true },
  { id: 'longlaotie_v3', name: '龙老铁', gender: 'male', age: 'young', description: '东北直率男，东北话', supportsInstruction: true },
  // 多语种
  { id: 'loongabby_v3', name: 'loongabby', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongannie_v3', name: 'loongannie', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongandy_v3', name: 'loongandy', gender: 'male', age: 'middle', description: '美式英文男声' },
  { id: 'loongava_v3', name: 'loongava', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongbeth_v3', name: 'loongbeth', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongbetty_v3', name: 'loongbetty', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongcally_v3', name: 'loongcally', gender: 'female', age: 'young', description: '美式英文女声' },
  { id: 'loongcindy_v3', name: 'loongcindy', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongdavid_v3', name: 'loongdavid', gender: 'male', age: 'middle', description: '美式英文男声' },
  { id: 'loongdonna_v3', name: 'loongdonna', gender: 'female', age: 'middle', description: '美式英文女声' },
  { id: 'loongemily_v3', name: 'loongemily', gender: 'female', age: 'middle', description: '英式英文女声' },
  { id: 'loongeric_v3', name: 'loongeric', gender: 'male', age: 'middle', description: '英式英文男声' },
  { id: 'loongluna_v3', name: 'loongluna', gender: 'female', age: 'middle', description: '英式英文女声' },
  { id: 'loongluca_v3', name: 'loongluca', gender: 'male', age: 'young', description: '英式英文男声' },
  { id: 'loongriko_v3', name: 'Riko', gender: 'female', age: 'young', description: '二次元霓虹女，日语' },
  { id: 'loongtomoka_v3', name: 'loongtomoka', gender: 'female', age: 'middle', description: '日语女声' },
  { id: 'loongtomoya_v3', name: 'loongtomoya', gender: 'male', age: 'middle', description: '日语男声' },
  { id: 'loongyuuna_v3', name: 'Yuuna', gender: 'female', age: 'young', description: '元气霓虹女，日语' },
  { id: 'loongyuuma_v3', name: 'Yuuma', gender: 'male', age: 'young', description: '干练霓虹男，日语' },
  { id: 'loongjihun_v3', name: 'Jihun', gender: 'male', age: 'young', description: '阳光韩国男，韩语' },
  { id: 'loongkyong_v3', name: 'loongkyong', gender: 'female', age: 'young', description: '韩语女声' },
  { id: 'loongindah_v3', name: 'loongindah', gender: 'female', age: 'young', description: '印尼语女声' },
];

/** CosyVoice-v3-Plus 官方音色（2 个） */
const V3_PLUS_VOICES: BaseVoice[] = [
  { id: 'longanyang', name: '龙安欢', gender: 'male', age: 'young', description: '阳光大男孩', supportsInstruction: true },
  { id: 'longanhuan', name: '龙安欢', gender: 'female', age: 'young', description: '欢脱元气女', supportsInstruction: true },
];

/** CosyVoice-v2 官方音色（106 个） */
const V2_VOICES: BaseVoice[] = [
  { id: 'longyingxiao', name: '龙应笑', gender: 'female', age: 'young', description: '清甜推销女', supportsInstruction: true },
  { id: 'longjiqi', name: '龙机器', gender: 'neutral', age: 'middle', description: '呆萌机器人', supportsInstruction: true },
  { id: 'longhouge', name: '龙猴哥', gender: 'male', age: 'young', description: '经典猴哥', supportsInstruction: true },
  { id: 'longjixin', name: '龙机心', gender: 'female', age: 'young', description: '毒舌心机女', supportsInstruction: true },
  { id: 'longanyue', name: '龙安粤', gender: 'male', age: 'middle', description: '欢脱粤语男', supportsInstruction: true },
  { id: 'longshange', name: '龙陕哥', gender: 'male', age: 'middle', description: '原味陕北男，陕西话', supportsInstruction: true },
  { id: 'longanmin', name: '龙安敏', gender: 'female', age: 'young', description: '甜美闽南女，闽南话', supportsInstruction: true },
  { id: 'longdaiyu', name: '龙黛玉', gender: 'female', age: 'young', description: '娇率才女音', supportsInstruction: true },
  { id: 'longgaoseng', name: '龙高僧', gender: 'male', age: 'middle', description: '得道高僧音', supportsInstruction: true },
  { id: 'longanli', name: '龙安莉', gender: 'female', age: 'middle', description: '利落从容女', supportsInstruction: true },
  { id: 'longanlang', name: '龙安朗', gender: 'male', age: 'young', description: '清爽利落男', supportsInstruction: true },
  { id: 'longanwen', name: '龙安温', gender: 'female', age: 'middle', description: '优雅知性女', supportsInstruction: true },
  { id: 'longanyun', name: '龙安昀', gender: 'male', age: 'middle', description: '居家暖男', supportsInstruction: true },
  { id: 'longyumi_v2', name: 'YUMI', gender: 'female', age: 'young', description: '正经青年女', supportsInstruction: true },
  { id: 'longxiaochun_v2', name: '龙小淳', gender: 'female', age: 'young', description: '知性积极女', supportsInstruction: true },
  { id: 'longxiaoxia_v2', name: '龙小夏', gender: 'female', age: 'young', description: '沉稳权威女', supportsInstruction: true },
  { id: 'longyichen', name: '龙逸尘', gender: 'male', age: 'young', description: '洒脱活力男', supportsInstruction: true },
  { id: 'longwanjun', name: '龙婉君', gender: 'female', age: 'young', description: '细腻柔声女', supportsInstruction: true },
  { id: 'longlaobo', name: '龙老伯', gender: 'male', age: 'senior', description: '沧桑岁月爷', supportsInstruction: true },
  { id: 'longlaoyi', name: '龙老姨', gender: 'female', age: 'senior', description: '烟火从容阿姨', supportsInstruction: true },
  { id: 'longbaizhi', name: '龙白芷', gender: 'female', age: 'middle', description: '睿气旁白女', supportsInstruction: true },
  { id: 'longsanshu', name: '龙三叔', gender: 'male', age: 'middle', description: '沉稳质感男', supportsInstruction: true },
  { id: 'longxiu_v2', name: '龙修', gender: 'male', age: 'middle', description: '博才说书男', supportsInstruction: true },
  { id: 'longmiao_v2', name: '龙妙', gender: 'female', age: 'young', description: '抑扬顿挫女', supportsInstruction: true },
  { id: 'longyue_v2', name: '龙悦', gender: 'female', age: 'middle', description: '温暖磁性女', supportsInstruction: true },
  { id: 'longnan_v2', name: '龙楠', gender: 'male', age: 'young', description: '睿智青年男', supportsInstruction: true },
  { id: 'longyuan_v2', name: '龙媛', gender: 'female', age: 'middle', description: '温暖治愈女', supportsInstruction: true },
  { id: 'longanqin', name: '龙安亲', gender: 'female', age: 'young', description: '亲和活泼女', supportsInstruction: true },
  { id: 'longanya', name: '龙安雅', gender: 'female', age: 'middle', description: '高雅气质女', supportsInstruction: true },
  { id: 'longanshuo', name: '龙安朔', gender: 'male', age: 'young', description: '干净清爽男', supportsInstruction: true },
  { id: 'longanling', name: '龙安灵', gender: 'female', age: 'young', description: '思维灵动女', supportsInstruction: true },
  { id: 'longanzhi', name: '龙安智', gender: 'male', age: 'middle', description: '睿智轻熟男', supportsInstruction: true },
  { id: 'longanrou', name: '龙安柔', gender: 'female', age: 'young', description: '温柔闺蜜女', supportsInstruction: true },
  { id: 'longqiang_v2', name: '龙嫱', gender: 'female', age: 'middle', description: '浪漫风情女', supportsInstruction: true },
  { id: 'longhan_v2', name: '龙寒', gender: 'male', age: 'middle', description: '温暖痴情男', supportsInstruction: true },
  { id: 'longxing_v2', name: '龙星', gender: 'female', age: 'young', description: '温婉邻家女', supportsInstruction: true },
  { id: 'longhua_v2', name: '龙华', gender: 'female', age: 'young', description: '元气甜美女', supportsInstruction: true },
  { id: 'longwan_v2', name: '龙婉', gender: 'female', age: 'young', description: '积极知性女', supportsInstruction: true },
  { id: 'longcheng_v2', name: '龙橙', gender: 'male', age: 'young', description: '智慧青年男', supportsInstruction: true },
  { id: 'longfeifei_v2', name: '龙菲菲', gender: 'female', age: 'young', description: '甜美娇气女', supportsInstruction: true },
  { id: 'longxiaocheng_v2', name: '龙小诚', gender: 'male', age: 'young', description: '磁性低音男', supportsInstruction: true },
  { id: 'longzhe_v2', name: '龙哲', gender: 'male', age: 'middle', description: '呆板大暖男', supportsInstruction: true },
  { id: 'longyan_v2', name: '龙颜', gender: 'female', age: 'middle', description: '温暖春风女', supportsInstruction: true },
  { id: 'longtian_v2', name: '龙天', gender: 'male', age: 'middle', description: '磁性理智男', supportsInstruction: true },
  { id: 'longze_v2', name: '龙泽', gender: 'male', age: 'young', description: '温暖元气男', supportsInstruction: true },
  { id: 'longshao_v2', name: '龙邵', gender: 'male', age: 'young', description: '积极向上男', supportsInstruction: true },
  { id: 'longhao_v2', name: '龙浩', gender: 'male', age: 'middle', description: '多情忧郁男', supportsInstruction: true },
  { id: 'kabuleshen_v2', name: '龙深', gender: 'male', age: 'middle', description: '实力歌手男', supportsInstruction: true },
  { id: 'longhuhu', name: '龙呼呼', gender: 'female', age: 'child', description: '天真烂漫女童', supportsInstruction: true },
  { id: 'longanpei', name: '龙安培', gender: 'female', age: 'middle', description: '青少年教师女', supportsInstruction: true },
  { id: 'longwangwang', name: '龙汪汪', gender: 'male', age: 'child', description: '台湾少年音', supportsInstruction: true },
  { id: 'longpaopao', name: '龙泡泡', gender: 'neutral', age: 'child', description: '飞天泡泡音', supportsInstruction: true },
  { id: 'longshanshan', name: '龙闪闪', gender: 'neutral', age: 'child', description: '戏剧化童声', supportsInstruction: true },
  { id: 'longniuniu', name: '龙牛牛', gender: 'male', age: 'child', description: '阳光男童声', supportsInstruction: true },
  { id: 'longyingmu', name: '龙应沐', gender: 'female', age: 'young', description: '优雅知性女', supportsInstruction: true },
  { id: 'longyingxun', name: '龙应询', gender: 'male', age: 'young', description: '年轻青涩男', supportsInstruction: true },
  { id: 'longyingcui', name: '龙应催', gender: 'male', age: 'middle', description: '严肃催收男', supportsInstruction: true },
  { id: 'longyingda', name: '龙应答', gender: 'female', age: 'young', description: '开朗高音女', supportsInstruction: true },
  { id: 'longyingjing', name: '龙应静', gender: 'female', age: 'middle', description: '低调冷静女', supportsInstruction: true },
  { id: 'longyingyan', name: '龙应严', gender: 'female', age: 'middle', description: '义正严辞女', supportsInstruction: true },
  { id: 'longyingtian', name: '龙应甜', gender: 'female', age: 'young', description: '温柔甜美女', supportsInstruction: true },
  { id: 'longyingbing', name: '龙应冰', gender: 'female', age: 'middle', description: '尖锐强势女', supportsInstruction: true },
  { id: 'longyingtao', name: '龙应桃', gender: 'female', age: 'middle', description: '温柔淡定女', supportsInstruction: true },
  { id: 'longyingling', name: '龙应聆', gender: 'female', age: 'young', description: '温和共情女', supportsInstruction: true },
  { id: 'longanran', name: '龙安燃', gender: 'female', age: 'middle', description: '活泼质感女', supportsInstruction: true },
  { id: 'longanxuan', name: '龙安宣', gender: 'female', age: 'middle', description: '经典直播女', supportsInstruction: true },
  { id: 'longanchong', name: '龙安冲', gender: 'male', age: 'middle', description: '激情推销男', supportsInstruction: true },
  { id: 'longanping', name: '龙安萍', gender: 'female', age: 'middle', description: '高亢直播女', supportsInstruction: true },
  { id: 'longjielidou_v2', name: '龙杰力豆', gender: 'male', age: 'child', description: '阳光顽皮男童', supportsInstruction: true },
  { id: 'longling_v2', name: '龙铃', gender: 'female', age: 'child', description: '稚气呆板女童', supportsInstruction: true },
  { id: 'longke_v2', name: '龙可', gender: 'female', age: 'child', description: '懵懂乖乖女', supportsInstruction: true },
  { id: 'longxian_v2', name: '龙仙', gender: 'female', age: 'child', description: '豪放可爱女童', supportsInstruction: true },
  { id: 'longlaotie_v2', name: '龙老铁', gender: 'male', age: 'young', description: '东北直率男，东北话', supportsInstruction: true },
  { id: 'longjiayi_v2', name: '龙嘉怡', gender: 'female', age: 'young', description: '知性粤语女，粤语', supportsInstruction: true },
  { id: 'longtao_v2', name: '龙桃', gender: 'female', age: 'young', description: '积极粤语女，粤语', supportsInstruction: true },
  { id: 'longfei_v2', name: '龙飞', gender: 'male', age: 'middle', description: '热血磁性男', supportsInstruction: true },
  { id: 'libai_v2', name: '李白', gender: 'male', age: 'middle', description: '古代诗仙男', supportsInstruction: true },
  { id: 'longjin_v2', name: '龙津', gender: 'male', age: 'middle', description: '优雅温润男', supportsInstruction: true },
  { id: 'longshu_v2', name: '龙书', gender: 'male', age: 'young', description: '沉稳青年男', supportsInstruction: true },
  { id: 'loongbella_v2', name: 'Bella 2.0', gender: 'female', age: 'young', description: '精准干练女', supportsInstruction: true },
  { id: 'longshuo_v2', name: '龙硕', gender: 'male', age: 'young', description: '博才干练男', supportsInstruction: true },
  { id: 'longxiaobai_v2', name: '龙小白', gender: 'female', age: 'young', description: '沉稳播报女', supportsInstruction: true },
  { id: 'longjing_v2', name: '龙婧', gender: 'female', age: 'young', description: '典型播音女', supportsInstruction: true },
  { id: 'loongstella_v2', name: 'loongstella', gender: 'female', age: 'young', description: '飒爽利落女', supportsInstruction: true },
  { id: 'loongyuuna_v2', name: 'loongyuuna', gender: 'female', age: 'young', description: '元气霓虹女，日语', supportsInstruction: true },
  { id: 'loongyuuma_v2', name: 'loongyuuma', gender: 'male', age: 'young', description: '干练霓虹男，日语', supportsInstruction: true },
  { id: 'loongjihun_v2', name: 'loongjihun', gender: 'male', age: 'young', description: '阳光韩国男，韩语', supportsInstruction: true },
  { id: 'loongeva_v2', name: 'loongeva', gender: 'female', age: 'middle', description: '知性英文女，英式', supportsInstruction: true },
  { id: 'loongbrian_v2', name: 'loongbrian', gender: 'male', age: 'middle', description: '沉稳英文男，英式', supportsInstruction: true },
  { id: 'loongluna_v2', name: 'loongluna', gender: 'female', age: 'middle', description: '英式英文女', supportsInstruction: true },
  { id: 'loongluca_v2', name: 'loongluca', gender: 'male', age: 'young', description: '英式英文男', supportsInstruction: true },
  { id: 'loongemily_v2', name: 'loongemily', gender: 'female', age: 'middle', description: '英式英文女', supportsInstruction: true },
  { id: 'loongeric_v2', name: 'loongeric', gender: 'male', age: 'middle', description: '英式英文男', supportsInstruction: true },
  { id: 'loongabby_v2', name: 'loongabby', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongannie_v2', name: 'loongannie', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongandy_v2', name: 'loongandy', gender: 'male', age: 'middle', description: '美式英文男', supportsInstruction: true },
  { id: 'loongava_v2', name: 'loongava', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongbeth_v2', name: 'loongbeth', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongbetty_v2', name: 'loongbetty', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongcally_v2', name: 'loongcally', gender: 'female', age: 'young', description: '美式英文女', supportsInstruction: true },
  { id: 'loongcindy_v2', name: 'loongcindy', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongdavid_v2', name: 'loongdavid', gender: 'male', age: 'middle', description: '美式英文男', supportsInstruction: true },
  { id: 'loongdonna_v2', name: 'loongdonna', gender: 'female', age: 'middle', description: '美式英文女', supportsInstruction: true },
  { id: 'loongkyong_v2', name: 'loongkyong', gender: 'female', age: 'young', description: '韩语女声', supportsInstruction: true },
  { id: 'loongtomoka_v2', name: 'loongtomoka', gender: 'female', age: 'middle', description: '日语女声', supportsInstruction: true },
  { id: 'loongtomoya_v2', name: 'loongtomoya', gender: 'male', age: 'middle', description: '日语男声', supportsInstruction: true },
];

/** 千问-TTS（qwen-tts）核心系统音色（4 个） */
const QWEN_TTS_VOICES: BaseVoice[] = [
  { id: 'Chelsie', name: '千雪', gender: 'female', age: 'young', description: '二次元虚拟女友，软糯娇俏' },
  { id: 'Cherry', name: '芊悦', gender: 'female', age: 'young', description: '阳光积极、亲切自然小姐姐' },
  { id: 'Ethan', name: '晨煦', gender: 'male', age: 'young', description: '标准普通话，阳光温暖' },
  { id: 'Serena', name: '苏瑶', gender: 'female', age: 'young', description: '温柔小姐姐' },
];

/**
 * 千问3-TTS-Flash / Instruct-Flash 官方系统音色（48 个）
 * 文档：https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list
 * 说明：部分音色（Jennifer/Ryan/Katerina、多语种、方言等）仅特定模型子集支持，
 *      在前端列表中均会展示，试听时若该模型不支持会返回明确错误。
 */
const QWEN3_FLASH_VOICES: BaseVoice[] = [
  // 通用中文
  { id: 'Cherry', name: '芊悦', gender: 'female', age: 'young', description: '阳光积极、亲切自然小姐姐' },
  { id: 'Serena', name: '苏瑶', gender: 'female', age: 'young', description: '温柔小姐姐' },
  { id: 'Ethan', name: '晨煦', gender: 'male', age: 'young', description: '标准普通话，带北方口音，阳光温暖' },
  { id: 'Chelsie', name: '千雪', gender: 'female', age: 'young', description: '二次元虚拟女友' },
  { id: 'Momo', name: '茉兔', gender: 'female', age: 'young', description: '撒娇搞怪，逗你开心' },
  { id: 'Vivian', name: '十三', gender: 'female', age: 'young', description: '拽拽的、可爱的小暴躁' },
  { id: 'Moon', name: '月白', gender: 'male', age: 'young', description: '率性帅气' },
  { id: 'Maia', name: '四月', gender: 'female', age: 'young', description: '知性与温柔的碰撞' },
  { id: 'Kai', name: '凯', gender: 'male', age: 'young', description: '耳朵的一场SPA' },
  { id: 'Nofish', name: '不吃鱼', gender: 'male', age: 'young', description: '不会翘舌音的设计师' },
  { id: 'Bella', name: '萌宝', gender: 'female', age: 'child', description: '小萝莉' },
  { id: 'Aiden', name: '艾登', gender: 'male', age: 'young', description: '精通厨艺的美语大男孩' },
  { id: 'Eldric Sage', name: '沧明子', gender: 'male', age: 'senior', description: '沉稳睿智的老者' },
  { id: 'Mia', name: '乖小妹', gender: 'female', age: 'young', description: '温顺乖巧' },
  { id: 'Mochi', name: '沙小弥', gender: 'male', age: 'child', description: '聪明伶俐的小大人' },
  { id: 'Bellona', name: '燕铮莺', gender: 'female', age: 'young', description: '声音洪亮、热血江湖感' },
  { id: 'Vincent', name: '田叔', gender: 'male', age: 'middle', description: '沙哑烟嗓、江湖豪情' },
  { id: 'Bunny', name: '萌小姬', gender: 'female', age: 'child', description: '萌属性爆棚的小萝莉' },
  { id: 'Neil', name: '阿闻', gender: 'male', age: 'middle', description: '专业新闻主持人' },
  { id: 'Elias', name: '墨讲师', gender: 'female', age: 'middle', description: '严谨又易懂的讲师' },
  { id: 'Arthur', name: '徐大爷', gender: 'male', age: 'senior', description: '质朴嗓音、乡村故事感' },
  { id: 'Nini', name: '邻家妹妹', gender: 'female', age: 'young', description: '软糯甜腻的妹妹音' },
  { id: 'Seren', name: '小婉', gender: 'female', age: 'young', description: '温和舒缓，助眠' },
  { id: 'Pip', name: '顽屁小孩', gender: 'male', age: 'child', description: '调皮捣蛋的童真小孩' },
  { id: 'Stella', name: '少女阿月', gender: 'female', age: 'young', description: '甜腻少女音，可变身正义感' },
  // 仅 qwen3-tts-flash（不含 Instruct 版本）
  { id: 'Jennifer', name: '詹妮弗', gender: 'female', age: 'middle', description: '品牌级、电影质感美语女声' },
  { id: 'Ryan', name: '甜茶', gender: 'male', age: 'young', description: '节奏感强、戏剧感足' },
  { id: 'Katerina', name: '卡捷琳娜', gender: 'female', age: 'middle', description: '御姐音色' },
  // 多语种（仅 qwen3-tts-flash）
  { id: 'Bodega', name: '博德加', gender: 'male', age: 'middle', description: '热情的西班牙大叔' },
  { id: 'Sonrisa', name: '索尼莎', gender: 'female', age: 'middle', description: '热情开朗的拉美大姐' },
  { id: 'Alek', name: '阿列克', gender: 'male', age: 'middle', description: '战斗民族的冷与暖' },
  { id: 'Dolce', name: '多尔切', gender: 'male', age: 'senior', description: '慵懒的意大利大叔' },
  { id: 'Sohee', name: '素熙', gender: 'female', age: 'young', description: '温柔开朗的韩国欧尼' },
  { id: 'Ono Anna', name: '小野杏', gender: 'female', age: 'young', description: '鬼灵精怪的青梅竹马' },
  { id: 'Lenn', name: '莱恩', gender: 'male', age: 'young', description: '理性底色、穿西装听后朋克的德国青年' },
  { id: 'Emilien', name: '埃米尔安', gender: 'male', age: 'young', description: '浪漫的法国大哥哥' },
  { id: 'Andre', name: '安德雷', gender: 'male', age: 'middle', description: '声音磁性、沉稳男生' },
  { id: 'Radio Gol', name: '拉迪奥·戈尔', gender: 'male', age: 'middle', description: '足球诗人风格解说' },
  // 方言
  { id: 'Jada', name: '上海-阿珍', gender: 'female', age: 'middle', description: '风风火火的沪上阿姐，上海话' },
  { id: 'Dylan', name: '北京-晓东', gender: 'male', age: 'young', description: '北京胡同里长大的少年，北京话' },
  { id: 'Li', name: '南京-老李', gender: 'male', age: 'middle', description: '耐心的瑜伽老师，南京话' },
  { id: 'Marcus', name: '陕西-秦川', gender: 'male', age: 'middle', description: '老陕味道，陕西话' },
  { id: 'Roy', name: '闽南-阿杰', gender: 'male', age: 'young', description: '诙谐直爽的台湾哥仔，闽南语' },
  { id: 'Peter', name: '天津-李彼得', gender: 'male', age: 'middle', description: '天津相声专业捧哏，天津话' },
  { id: 'Sunny', name: '四川-晴儿', gender: 'female', age: 'young', description: '甜的川妹子，四川话' },
  { id: 'Eric', name: '四川-程川', gender: 'male', age: 'young', description: '跳脱市井的成都男子，四川话' },
  { id: 'Rocky', name: '粤语-阿强', gender: 'male', age: 'young', description: '幽默风趣在线陪聊，粤语' },
  { id: 'Kiki', name: '粤语-阿清', gender: 'female', age: 'young', description: '甜美的港妹闺蜜，粤语' },
];

/** Qwen-Audio-3.0-TTS-Plus 音色（2 个） */
const QWEN3_PLUS_VOICES: BaseVoice[] = [
  { id: 'longanlingxin', name: '龙安灵心', gender: 'female', age: 'young', description: '知心温暖音，旗舰音色' },
  { id: 'longanlufeng', name: '龙安鲁风', gender: 'male', age: 'young', description: '明亮开朗音，旗舰音色' },
];

/** 模型配置：model ID → 显示名 + 音色列表 */
const ALIYUN_MODELS: Record<string, { displayName: string; voices: BaseVoice[] }> = {
  'cosyvoice-v3-flash': { displayName: 'CosyVoice v3 Flash', voices: V3_FLASH_VOICES },
  'cosyvoice-v3-plus': { displayName: 'CosyVoice v3 Plus', voices: V3_PLUS_VOICES },
  // v3.5 系列官方不支持系统音色（仅支持声音复刻/声音设计音色），故音色列表为空
  'cosyvoice-v3.5-flash': { displayName: 'CosyVoice v3.5 Flash（无系统音色）', voices: [] },
  'cosyvoice-v3.5-plus': { displayName: 'CosyVoice v3.5 Plus（无系统音色）', voices: [] },
  'cosyvoice-v2': { displayName: 'CosyVoice v2', voices: V2_VOICES },
  'qwen-tts': { displayName: '千问-TTS', voices: QWEN_TTS_VOICES },
  'qwen3-tts-flash': { displayName: '千问3-TTS Flash', voices: QWEN3_FLASH_VOICES },
  'qwen3-tts-flash-2025-11-27': { displayName: '千问3-TTS Flash 2025-11-27', voices: QWEN3_FLASH_VOICES },
  'qwen3-tts-flash-2025-09-18': { displayName: '千问3-TTS Flash 2025-09-18', voices: QWEN3_FLASH_VOICES },
  'qwen3-tts-instruct-flash': { displayName: '千问3-TTS Instruct Flash', voices: QWEN3_FLASH_VOICES },
  'qwen3-tts-instruct-flash-2026-01-26': { displayName: '千问3-TTS Instruct Flash 2026-01-26', voices: QWEN3_FLASH_VOICES },
  'qwen-audio-3.0-tts-plus': { displayName: 'Qwen-Audio 3.0 TTS Plus', voices: QWEN3_PLUS_VOICES },
};

/** 走百炼 MaaS SpeechSynthesizer 端点的模型（CosyVoice 系列） */
const MAAS_MODELS = new Set([
  'cosyvoice-v3-flash',
  'cosyvoice-v3-plus',
  'cosyvoice-v3.5-flash',
  'cosyvoice-v3.5-plus',
  'cosyvoice-v2',
]);

/** 走 DashScope 公共 SpeechSynthesizer 端点的模型（Qwen-Audio-3.0-TTS 系列） */
const DASHSCOPE_TTS_MODELS = new Set(['qwen-audio-3.0-tts-plus']);

/** 带 provider/model 的全量音色 */
const ALIYUN_VOICES: VxVoice[] = Object.entries(ALIYUN_MODELS).flatMap(([model, cfg]) =>
  cfg.voices.map((v) => ({ ...v, provider: VxProvider.ALIYUN, model }))
);

/** 当前可用音色集合（试听/合成前校验） */
const AVAILABLE_VOICE_IDS = new Set(ALIYUN_VOICES.map((v) => v.id));

/** voiceId → model 索引（同一个 ID 可能跨模型，取首次出现的模型作为回退） */
const VOICE_TO_MODEL = new Map<string, string>();
for (const v of ALIYUN_VOICES) {
  if (!VOICE_TO_MODEL.has(v.id)) VOICE_TO_MODEL.set(v.id, v.model!);
}

export interface AliyunProviderOptions {
  apiKey: string;
  workspaceId: string;
  /** 默认模型（旧数据/未指定模型时回退用） */
  defaultModel?: string;
}

export class AliyunProvider implements TTSProvider {
  readonly provider = VxProvider.ALIYUN;
  readonly displayName = '阿里云百炼';

  private apiKey: string;
  private workspaceId: string;
  private defaultModel: string;

  constructor(opts: AliyunProviderOptions) {
    this.apiKey = opts.apiKey;
    this.workspaceId = opts.workspaceId;
    this.defaultModel = opts.defaultModel ?? 'cosyvoice-v3-flash';
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
      availableModels: Object.keys(ALIYUN_MODELS),
    };
  }

  async listVoices(): Promise<VxVoice[]> {
    return ALIYUN_VOICES;
  }

  async synthesize(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    const { text, voiceId, voiceModel, voiceParams, format = 'wav', sampleRate = 24000 } = input;

    // 音色可用性校验：避免已绑定不可用音色的段落试听时收到晦涩的阿里云 400
    if (!AVAILABLE_VOICE_IDS.has(voiceId)) {
      throw new Error(`音色「${voiceId}」不可用：该音色不在阿里云百炼的音色列表中（可能为旧版本遗留数据或属于其他服务商，如豆包火山引擎），请在发音人列表中重新选择`);
    }

    // 优先使用输入指定的模型；未指定时按 voiceId 反查（兼容旧数据）
    const model = voiceModel ?? VOICE_TO_MODEL.get(voiceId) ?? this.defaultModel;

    // v3.5 系列官方不支持系统音色（仅声音复刻/声音设计音色），任何系统音色请求都会返回引擎 418
    if (model.startsWith('cosyvoice-v3.5')) {
      throw new Error(`模型 ${model} 不支持系统音色（官方限制：v3.5 仅支持声音复刻/声音设计音色）。请改用 cosyvoice-v3-flash / cosyvoice-v2 等模型，或使用声音复刻音色`);
    }

    // 音色与模型匹配校验：显式指定模型时，确保所选音色属于该模型
    const modelVoices = ALIYUN_MODELS[model]?.voices;
    if (modelVoices && !modelVoices.some((v) => v.id === voiceId)) {
      throw new Error(`音色「${voiceId}」不属于模型 ${model}，请在发音人列表中为该模型重新选择音色`);
    }

    // 三类端点：CosyVoice 走百炼 MaaS 专属 SpeechSynthesizer；
    // Qwen-Audio-3.0-TTS 走 DashScope 公共 SpeechSynthesizer（参数同 CosyVoice）；
    // 千问-TTS / 千问3-TTS 走 DashScope multimodal-generation。
    if (MAAS_MODELS.has(model)) {
      return this.synthesizeWithMaas({ text, voiceId, model, voiceParams, format, sampleRate });
    }
    if (DASHSCOPE_TTS_MODELS.has(model)) {
      return this.synthesizeWithMaas({
        text, voiceId, model, voiceParams, format, sampleRate,
        url: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
      });
    }
    return this.synthesizeWithDashScopeGeneration({ text, voiceId, model, voiceParams });
  }

  /**
   * CosyVoice 系列：百炼 MaaS SpeechSynthesizer
   * Qwen-Audio-3.0-TTS：DashScope 公共 SpeechSynthesizer（参数格式相同，host 不同）
   */
  private async synthesizeWithMaas(input: {
    text: string;
    voiceId: string;
    model: string;
    voiceParams?: VxSynthesizeInput['voiceParams'];
    format: VxAudioFormat;
    sampleRate: number;
    url?: string;
  }): Promise<VxSynthesizeResult> {
    const { text, voiceId, model, voiceParams, format, sampleRate } = input;
    const instruction = this.buildInstruction(voiceParams);

    const body = {
      model,
      input: {
        text,
        voice: voiceId,
        format,
        sample_rate: sampleRate,
        ...(voiceParams?.speed != null && { rate: voiceParams.speed }),
        ...(voiceParams?.pitch != null && { pitch: voiceParams.pitch }),
        ...(voiceParams?.volume != null && { volume: voiceParams.volume }),
        ...(instruction && { instruction }),
      },
    };

    const url = input.url ?? `https://${this.workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`;

    let resp;
    try {
      resp = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
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

  /**
   * 千问-TTS / 千问3-TTS 系列：DashScope multimodal-generation 端点（返回 WAV）
   * 文档：https://help.aliyun.com/zh/model-studio/qwen-tts-api
   */
  private async synthesizeWithDashScopeGeneration(input: {
    text: string;
    voiceId: string;
    model: string;
    voiceParams?: VxSynthesizeInput['voiceParams'];
  }): Promise<VxSynthesizeResult> {
    const { text, voiceId, model, voiceParams } = input;

    const isInstruct = model.startsWith('qwen3-tts-instruct-flash');
    const instruction = this.buildInstruction(voiceParams);

    const body: Record<string, unknown> = {
      model,
      input: {
        text,
        voice: voiceId,
        // 仅 instruct 模型支持指令控制；其它 Qwen-TTS 模型不传，避免 400
        ...(isInstruct && instruction ? { instructions: instruction, optimize_instructions: true } : {}),
      },
    };

    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

    let resp;
    try {
      resp = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
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
      format: 'wav' as VxAudioFormat,
      sampleRate: 24000,
      billedCharacters: resp.data?.usage?.characters,
      requestId: resp.data?.request_id,
    };
  }

  async preview(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
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
