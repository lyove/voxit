/**
 * 豆包火山引擎 Provider（V3 豆包语音合成 2.0 / HTTP 单向流式接口）
 *
 * 接口：POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
 * 鉴权：请求头 X-Api-Key（新版控制台「API管理」获取）+ X-Api-Resource-Id（模型资源 ID）
 *       注意：新版鉴权已不需要 APP ID / Access Token / Bearer Token
 * 请求体：user + req_params（speaker / audio_params）
 * 响应：HTTP Chunked JSON 流，每个对象 { code, message, data(base64 音频分片) }
 *       成功：code=0 的帧携带音频分片；code=20000000 是正常结束标记（data=null），不是错误
 * 长文本：POST /api/v3/tts/submit 提交任务 → POST /api/v3/tts/query 轮询结果
 * 文档：https://www.volcengine.com/docs/6561/2528925（单向流式语音合成HTTP）
 *       https://www.volcengine.com/docs/6561/1598757（HTTP Chunked/SSE 单向流式-V3）
 */
import { randomUUID } from 'node:crypto';
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
 * 豆包发音人列表 —— 全部为豆包语音合成 2.0（seed-tts-2.0）在线音色，
 * voice_type 来自新版控制台官方音色列表（以 _uranus_bigtts 结尾）。
 * 注：不含声音复刻 2.0 音色（ICL_ 前缀，需 seed-icl-2.0 资源）与端到端实时音色（saturn_、jupiter_ 前缀）。
 */
const DOUBAO_VOICES: VxVoice[] = [
  // ===== 通用场景 · 中文 =====
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '标准女声，通用场景' },
  { id: 'zh_female_xiaohe_uranus_bigtts', name: '小何 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '亲切知性女声' },
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '沉稳男声，适合旁白' },
  { id: 'zh_male_taocheng_uranus_bigtts', name: '小天 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '活力青年男声' },
  { id: 'zh_male_liufei_uranus_bigtts', name: '刘飞 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '成熟男声' },
  { id: 'zh_female_sophie_uranus_bigtts', name: '魅力苏菲 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '魅力女声' },
  { id: 'zh_female_qingxinnvsheng_uranus_bigtts', name: '清新女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '清新自然女声' },
  { id: 'zh_female_tianmeixiaoyuan_uranus_bigtts', name: '甜美小源 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '甜美女声' },
  { id: 'zh_female_tianmeitaozi_uranus_bigtts', name: '甜美桃子 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '甜美俏皮女声' },
  { id: 'zh_female_shuangkuaisisi_uranus_bigtts', name: '爽快思思 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '爽朗女声' },
  { id: 'zh_female_linjianvhai_uranus_bigtts', name: '邻家女孩 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '邻家女孩女声' },
  { id: 'zh_male_shaonianzixin_uranus_bigtts', name: '少年梓辛 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'teen', description: '少年男声' },
  { id: 'zh_female_meilinvyou_uranus_bigtts', name: '魅力女友 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '温柔魅力女声' },
  { id: 'zh_female_wenroumama_uranus_bigtts', name: '温柔妈妈 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'middle', description: '温柔女声，适合亲子内容' },
  { id: 'zh_male_jieshuoxiaoming_uranus_bigtts', name: '解说小明 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '解说风格男声' },
  { id: 'zh_female_tvbnv_uranus_bigtts', name: 'TVB 女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'middle', description: '港剧女声' },
  { id: 'zh_male_yizhipiannan_uranus_bigtts', name: '译制片男 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '译制片腔调男声' },
  { id: 'zh_female_qiaopinv_uranus_bigtts', name: '俏皮女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '俏皮活泼女声' },
  { id: 'zh_male_linjiananhai_uranus_bigtts', name: '邻家男孩 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '邻家男孩男声' },
  { id: 'zh_male_ruyaqingnian_uranus_bigtts', name: '儒雅青年 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '儒雅男声' },
  { id: 'zh_male_wennuanahu_uranus_bigtts', name: '温暖阿虎 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '温暖男声' },
  { id: 'zh_male_naiqimengwa_uranus_bigtts', name: '奶气萌娃 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'child', description: '奶萌童声' },
  { id: 'zh_female_popo_uranus_bigtts', name: '婆婆 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'senior', description: '慈祥老年女声' },
  { id: 'zh_female_gaolengyujie_uranus_bigtts', name: '高冷御姐 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '高冷御姐女声' },
  { id: 'zh_male_aojiaobazong_uranus_bigtts', name: '傲娇霸总 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '傲娇霸总男声' },
  { id: 'zh_male_lanyinmianbao_uranus_bigtts', name: '懒音绵宝 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '慵懒绵软男声' },
  { id: 'zh_male_fanjuanqingnian_uranus_bigtts', name: '反卷青年 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '轻松青年男声' },
  { id: 'zh_female_wenroushunv_uranus_bigtts', name: '温柔淑女 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '温柔淑女女声' },
  { id: 'zh_male_huolixiaoge_uranus_bigtts', name: '活力小哥 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '阳光活力男声' },
  { id: 'zh_male_cixingjieshuonan_uranus_bigtts', name: '磁性解说男声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '磁性解说男声' },
  { id: 'zh_male_liangsangmengzai_uranus_bigtts', name: '亮嗓萌仔 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'child', description: '明亮童声' },
  { id: 'zh_female_kailangjiejie_uranus_bigtts', name: '开朗姐姐 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '开朗女声' },
  { id: 'zh_male_gaolengchenwen_uranus_bigtts', name: '高冷沉稳 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '高冷沉稳男声' },
  { id: 'zh_male_shengyeboke_uranus_bigtts', name: '深夜播客 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '深夜播客男声' },
  { id: 'zh_female_qinqienv_uranus_bigtts', name: '亲切女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '亲切女声' },
  { id: 'zh_male_kuailexiaodong_uranus_bigtts', name: '快乐小东 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '快乐男声' },
  { id: 'zh_male_kailangxuezhang_uranus_bigtts', name: '开朗学长 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '开朗学长男声' },
  { id: 'zh_male_youyoujunzi_uranus_bigtts', name: '悠悠君子 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '温文尔雅男声' },
  { id: 'zh_female_wenjingmaomao_uranus_bigtts', name: '文静毛毛 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '文静女声' },
  { id: 'zh_female_zhixingnv_uranus_bigtts', name: '知性女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'middle', description: '知性女声' },
  { id: 'zh_male_qingshuangnanda_uranus_bigtts', name: '清爽男大 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '清爽青年男声' },
  { id: 'zh_male_yuanboxiaoshu_uranus_bigtts', name: '渊博小叔 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '渊博大叔男声' },
  { id: 'zh_male_yangguangqingnian_uranus_bigtts', name: '阳光青年 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '阳光青年男声' },
  { id: 'zh_female_qingchezizi_uranus_bigtts', name: '清澈梓梓 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'child', description: '清澈童声' },
  { id: 'zh_female_tianmeiyueyue_uranus_bigtts', name: '甜美悦悦 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '甜美悦耳女声' },
  { id: 'zh_female_xinlingjitang_uranus_bigtts', name: '心灵鸡汤 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '治愈鸡汤女声' },
  { id: 'zh_male_wenrouxiaoge_uranus_bigtts', name: '温柔小哥 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '温柔男声' },
  { id: 'zh_female_roumeinvyou_uranus_bigtts', name: '柔美女友 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '柔美女声' },
  { id: 'zh_male_dongfanghaoran_uranus_bigtts', name: '东方浩然 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '浩然正气男声' },
  { id: 'zh_female_wenrouxiaoya_uranus_bigtts', name: '温柔小雅 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '温柔婉约女声' },
  { id: 'zh_male_tiancaitongsheng_uranus_bigtts', name: '天才童声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'child', description: '聪慧童声' },
  { id: 'zh_male_baqiqingshu_uranus_bigtts', name: '霸气青叔 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '霸气男声' },
  { id: 'zh_male_xuanyijieshuo_uranus_bigtts', name: '悬疑解说 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '悬疑解说男声' },
  { id: 'zh_female_mengyatou_uranus_bigtts', name: '萌丫头 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'child', description: '可爱童声' },
  { id: 'zh_female_tiexinnvsheng_uranus_bigtts', name: '贴心女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '贴心女声' },
  { id: 'zh_female_jitangmei_uranus_bigtts', name: '鸡汤妹妹 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '元气鸡汤女声' },
  { id: 'zh_female_gufengshaoyu_uranus_bigtts', name: '古风少御 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '古风女声' },
  // ===== 角色扮演 · 中文 =====
  { id: 'zh_female_cancan_uranus_bigtts', name: '知性灿灿 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '知性女声，适合角色演绎' },
  { id: 'zh_female_sajiaoxuemei_uranus_bigtts', name: '撒娇学妹 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '撒娇学妹女声' },
  { id: 'zh_female_zhishuaiyingzi_uranus_bigtts', name: '直率英子 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '直率女声' },
  { id: 'zh_male_silang_uranus_bigtts', name: '四郎 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '帝王气男声' },
  { id: 'zh_male_qingcang_uranus_bigtts', name: '擎苍 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '仙侠气质男声' },
  { id: 'zh_male_xionger_uranus_bigtts', name: '熊二 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'child', description: '憨厚童声' },
  { id: 'zh_female_yingtaowanzi_uranus_bigtts', name: '樱桃丸子 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'child', description: '俏皮童声' },
  { id: 'zh_male_lubanqihao_uranus_bigtts', name: '鲁班七号 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'teen', description: '机械少年音' },
  { id: 'zh_female_linxiao_uranus_bigtts', name: '林潇 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '清冷女声' },
  { id: 'zh_female_lingling_uranus_bigtts', name: '玲玲姐姐 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '温柔姐姐音' },
  { id: 'zh_female_chunribu_uranus_bigtts', name: '春日部姐姐 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '元气姐姐音' },
  { id: 'zh_male_tangseng_uranus_bigtts', name: '唐僧 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '温吞斯文男声' },
  { id: 'zh_male_zhuangzhou_uranus_bigtts', name: '庄周 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '悠然哲思男声' },
  { id: 'zh_male_zhubajie_uranus_bigtts', name: '猪八戒 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '憨憨男声' },
  { id: 'zh_female_ganmaodianyin_uranus_bigtts', name: '感冒电音姐姐 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '电音效果女声' },
  { id: 'zh_female_nvleishen_uranus_bigtts', name: '女雷神 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '霸气女声' },
  // ===== 视频配音 · 中文 =====
  { id: 'zh_female_peiqi_uranus_bigtts', name: '佩奇猪 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'child', description: '卡通女声' },
  { id: 'zh_male_sunwukong_uranus_bigtts', name: '猴哥 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '孙悟空风格男声' },
  { id: 'zh_male_dayi_uranus_bigtts', name: '大壹 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '自然男声' },
  { id: 'zh_female_mizai_uranus_bigtts', name: '黑猫侦探社咪仔 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '猫咪风格女声' },
  { id: 'zh_female_jitangnv_uranus_bigtts', name: '鸡汤女 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '鸡汤励志女声' },
  { id: 'zh_female_liuchangnv_uranus_bigtts', name: '流畅女声 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '流畅自然女声' },
  { id: 'zh_male_ruyayichen_uranus_bigtts', name: '儒雅逸辰 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '儒雅男声，适合解说' },
  { id: 'zh_male_guanggaojieshuo_uranus_bigtts', name: '广告解说 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '广告解说男声' },
  { id: 'zh_female_shaoergushi_uranus_bigtts', name: '少儿故事 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '少儿故事女声' },
  { id: 'zh_female_wuzetian_uranus_bigtts', name: '武则天 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'middle', description: '威严女声' },
  { id: 'zh_female_gujie_uranus_bigtts', name: '顾姐 2.0', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'middle', description: '干练女声' },
  // ===== 多语种 · 英文（美式）=====
  { id: 'en_male_tim_uranus_bigtts', name: 'Tim', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '美式英语男声' },
  { id: 'en_female_dacey_uranus_bigtts', name: 'Dacey', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '美式英语女声' },
  { id: 'en_female_stokie_uranus_bigtts', name: 'Stokie', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '美式英语女声' },
  // ===== 多语种 · 其他 =====
  { id: 'ar_female_dina_uranus_bigtts', name: 'Dina', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '阿拉伯语女声' },
  { id: 'de_female_bv081_uranus_bigtts', name: 'Stella', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '德语女声' },
  { id: 'de_male_sven_uranus_bigtts', name: 'Sven', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '德语男声' },
  { id: 'ja_female_bv024_uranus_bigtts', name: 'Bonnie', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '日语女声' },
  { id: 'ja_male_bv524_uranus_bigtts', name: 'Ken', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '日语男声' },
  { id: 'ko_male_bv545_uranus_bigtts', name: 'Jay', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'middle', description: '韩语男声' },
  { id: 'ko_female_bv546_uranus_bigtts', name: 'Momo', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '韩语女声' },
  { id: 'es_female_bv084_uranus_bigtts', name: 'Gracie', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '西班牙语女声' },
  { id: 'ms_male_ham_uranus_bigtts', name: 'Ham', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'male', age: 'young', description: '马来语男声' },
  { id: 'vi_female_hong_uranus_bigtts', name: 'Hong', provider: VxProvider.DOUBAO, model: 'seed-tts-2.0', gender: 'female', age: 'young', description: '越南语女声' },
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

/** 统一音频格式 → 豆包 V3 audio_params.format 映射 */
const FORMAT_MAP: Record<string, string> = {
  mp3: 'mp3',
  wav: 'wav',
  pcm: 'pcm',
  opus: 'ogg_opus',
};

export interface DoubaoProviderOptions {
  /** 新版 API Key（控制台 > API管理 获取），作为请求头 X-Api-Key */
  apiKey: string;
  /** 语音模型资源 ID（X-Api-Resource-Id），默认 seed-tts-2.0（豆包语音合成 2.0） */
  resourceId?: string;
}

export class DoubaoProvider implements TTSProvider {
  readonly provider = VxProvider.DOUBAO;
  readonly displayName = '豆包火山引擎';

  private apiKey: string;
  private resourceId: string;

  constructor(opts: DoubaoProviderOptions) {
    this.apiKey = opts.apiKey;
    this.resourceId = opts.resourceId ?? 'seed-tts-2.0';
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
      supportsLongText: true, // V3 有 submit/query 异步长文本接口
      availableModels: ['seed-tts-2.0'],
    };
  }

  async listVoices(): Promise<VxVoice[]> {
    return DOUBAO_VOICES;
  }

  /** 新版鉴权请求头：X-Api-Key + X-Api-Resource-Id + X-Api-Request-Id（无需 APP ID / Access Token） */
  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
      'X-Api-Resource-Id': this.resourceId,
      // V3 接口要求每次请求携带唯一请求 ID（UUID）
      'X-Api-Request-Id': randomUUID(),
    };
  }

  /** 构造 V3 请求体（user + req_params） */
  private buildBody(input: VxSynthesizeInput) {
    const { text, voiceId, voiceParams, format = 'mp3', sampleRate = 24000 } = input;
    const speedRatio = voiceParams?.speed ?? 1.0;
    const pitchRatio = voiceParams?.pitch ?? 1.0;
    const volumeRatio = voiceParams?.volume != null ? voiceParams.volume / 100 : 1.0;
    const emotion = voiceParams?.emotion ? EMOTION_TO_DOUBAO[voiceParams.emotion] ?? '' : '';
    return {
      user: { uid: randomUUID() },
      req_params: {
        text,
        speaker: voiceId,
        audio_params: {
          format: FORMAT_MAP[format],
          sample_rate: sampleRate,
          speed_ratio: speedRatio,
          pitch_ratio: pitchRatio,
          volume_ratio: volumeRatio,
          ...(emotion && { emotion }),
        },
      },
    };
  }

  /** 从字符串头部提取第一个完整 JSON 对象；没有完整对象时返回 null */
  private static tryExtractJson(raw: string): { obj: Record<string, any> | null; rest: string } | null {
    const start = raw.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          const text = raw.slice(start, i + 1);
          const rest = raw.slice(i + 1);
          try {
            return { obj: JSON.parse(text) as Record<string, any>, rest };
          } catch {
            return { obj: null, rest }; // 单个对象解析失败则跳过
          }
        }
      }
    }
    return null;
  }

  /** 发送 V3 单向流式请求，解析 JSON 流并拼接 base64 音频分片 */
  private async requestAudioStream(body: Record<string, any>, onChunk?: (obj: Record<string, any>) => void): Promise<Buffer> {
    const url = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
    let resp;
    try {
      resp = await axios.post(url, body, {
        headers: this.buildHeaders(),
        responseType: 'stream',
        timeout: 120000,
      });
    } catch (e) {
      throw new Error(formatAxiosError('豆包合成', e));
    }

    const parts: Buffer[] = [];
    let raw = '';
    let errorMsg = '';

    const stream = resp.data as NodeJS.ReadableStream;
    stream.on('data', (chunk: Buffer | string) => {
      raw += chunk.toString('utf8');
      let r;
      while ((r = DoubaoProvider.tryExtractJson(raw))) {
        raw = r.rest;
        const obj = r.obj;
        if (!obj) continue;
        onChunk?.(obj);
        if (obj.code && obj.code !== 0) {
          // V3 流式接口：code=20000000 是正常结束标记（data=null），表示合成成功结束，不是错误
          if (obj.code === 20000000) {
            continue;
          }
          errorMsg = obj.message ? `${obj.message}（code=${obj.code}）` : `code=${obj.code}`;
          continue;
        }
        if (obj.data) {
          try {
            parts.push(Buffer.from(obj.data as string, 'base64'));
          } catch {
            // 忽略无效 base64 分片
          }
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', (err) => reject(new Error(`豆包合成流中断：${err}`)));
    });

    if (errorMsg) {
      throw new Error(`豆包合成失败：${errorMsg}`);
    }
    if (parts.length === 0) {
      throw new Error('豆包合成返回空音频');
    }
    return Buffer.concat(parts);
  }

  async synthesize(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    const { format = 'mp3', sampleRate = 24000 } = input;
    const audio = await this.requestAudioStream(this.buildBody(input));
    const playableUrl = `data:audio/${format};base64,${audio.toString('base64')}`;
    return { audioUrl: playableUrl, format, sampleRate };
  }

  async preview(input: VxSynthesizeInput): Promise<VxSynthesizeResult> {
    return this.synthesize(input);
  }

  /**
   * V3 异步长文本合成（submit 创建任务 → 轮询 query 拿音频 URL）
   */
  async synthesizeLongText(
    input: VxSynthesizeInput,
    onProgress?: (stage: string) => void,
  ): Promise<VxSynthesizeResult> {
    const { format = 'mp3', sampleRate = 24000 } = input;
    const body = this.buildBody(input);

    // 1. submit 创建任务
    onProgress?.('提交长文本合成任务...');
    let submitResp;
    try {
      submitResp = await axios.post('https://openspeech.bytedance.com/api/v3/tts/submit', body, {
        headers: this.buildHeaders(),
        timeout: 30000,
      });
    } catch (e) {
      throw new Error(formatAxiosError('豆包长文本提交', e));
    }

    const taskId: string | undefined = submitResp.data?.data?.task_id;
    const submitCode = submitResp.data?.code;
    if (submitCode !== 0 && submitCode !== 20000000) {
      throw new Error(`豆包长文本提交失败：code=${submitCode} message=${submitResp.data?.message ?? ''}`);
    }
    if (!taskId) {
      throw new Error(`豆包长文本提交失败：未返回 task_id（code=${submitCode}）`);
    }

    // 2. 轮询 query（每 2 秒，最多 60 次 = 2 分钟）
    onProgress?.('合成中，轮询查询结果...');
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      onProgress?.(`合成中... (${i + 1}/60)`);

      let queryResp;
      try {
        queryResp = await axios.post('https://openspeech.bytedance.com/api/v3/tts/query', { task_id: taskId }, {
          headers: this.buildHeaders(),
          timeout: 30000,
        });
      } catch (e) {
        throw new Error(formatAxiosError('豆包长文本查询', e));
      }

      const status: number | undefined = queryResp.data?.data?.task_status;
      const queryCode = queryResp.data?.code;
      // task_status: 1=Running 2=Success 3=Failure
      if (status === 2) {
        const audioUrl: string | undefined = queryResp.data?.data?.audio_url;
        if (!audioUrl) {
          throw new Error('豆包长文本合成完成但未返回音频 URL');
        }
        return { audioUrl, format, sampleRate, requestId: taskId };
      }
      if (status === 3) {
        throw new Error(`豆包长文本合成失败：${queryResp.data?.message ?? '未知错误'}`);
      }
      if (queryCode !== 0 && queryCode !== 20000000) {
        throw new Error(`豆包长文本查询失败：code=${queryCode} message=${queryResp.data?.message ?? ''}`);
      }
      // status=1（或缺失）且 code 正常 → 继续轮询
    }
    throw new Error('豆包长文本合成超时（2 分钟未完成）');
  }
}
