/**
 * AI角色页
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Empty, Input, Row, Spin, Tag, message } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { VxProvider, type VxVoice } from '@voxit/core';
import { fetchVoices, http, extractError, normalizeAudioUrl } from '../api.js';

/** 随机小说段落示例 */
const SAMPLE_TEXTS = [
  '夜幕降临，星光闪烁。他独自站在悬崖边，望着远方的城市灯火，心中涌起一股莫名的惆怅。',
  '她推开门，一股陈旧的气息扑面而来。房间里摆满了落灰的书架，最深处透出一丝微弱的光。',
  '风雨交加的夜晚，雷声轰鸣。他紧了紧衣领，加快脚步穿过无人的街巷，身后似乎有什么在跟随。',
  '清晨的阳光透过窗帘洒进来，她睁开眼，看见窗台上停着一只蓝色的蝴蝶，翅膀轻轻颤动。',
  '他缓缓拔出长剑，剑身在月光下泛着冷光。对面的黑影动了，一场宿命之战即将开始。',
];

export default function AiVoices() {
  const [aliyunVoices, setAliyunVoices] = useState<VxVoice[]>([]);
  const [doubaoVoices, setDoubaoVoices] = useState<VxVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [sampleText, setSampleText] = useState(SAMPLE_TEXTS[0]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 切换页面/卸载时终止试听播放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    setSampleText(SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)]);
    setLoading(true);
    Promise.all([
      fetchVoices(VxProvider.ALIYUN).catch(() => []),
      fetchVoices(VxProvider.DOUBAO).catch(() => []),
    ]).then(([a, d]) => {
      setAliyunVoices(a);
      setDoubaoVoices(d);
    }).finally(() => setLoading(false));
  }, []);

  /** 试听某个发音人（直接静默播放，不显示播放器） */
  const handlePreview = async (voice: VxVoice) => {
    // 正在播放当前音频则暂停
    if (playingId === voice.id) {
      audioRef.current?.pause();
      return;
    }
    // 切到新音频前先停掉旧的
    audioRef.current?.pause();

    setPreviewingId(voice.id);
    try {
      const resp = await http.post(`/providers/${voice.provider}/preview`, {
        text: sampleText,
        voiceId: voice.id,
        format: 'wav',
        sampleRate: 24000,
      });
      const url = resp.data.audioUrl
        ? normalizeAudioUrl(resp.data.audioUrl)
        : resp.data.audioData
          ? `data:audio/wav;base64,${resp.data.audioData}`
          : undefined;
      if (url) {
        const audio = new Audio(url);
        audio.onended = () => setPlayingId(null);
        audio.onpause = () => setPlayingId(null);
        audioRef.current = audio;
        await audio.play();
        setPlayingId(voice.id);
      }
    } catch (e) {
      message.error('试听失败：' + extractError(e));
    } finally {
      setPreviewingId(null);
    }
  };

  const renderVoice = (v: VxVoice) => {
    const isLoading = previewingId === v.id;
    const isPlaying = playingId === v.id;
    return (
    <Col key={v.id} xs={24} sm={12} md={8} lg={6}>
      <Card size="small" style={{ marginBottom: 12 }}
        actions={[
          <Button
            key="preview" size="small" type="link"
            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            loading={isLoading}
            onClick={() => handlePreview(v)}
          >{isLoading ? '' : (isPlaying ? '暂停' : '试听')}</Button>,
        ]}
      >
        <div style={{ fontWeight: 600 }}>{v.name}</div>
        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
          <Tag>{v.gender === 'male' ? '男' : v.gender === 'female' ? '女' : '中'}</Tag>
          {v.age && <Tag>{v.age}</Tag>}
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{v.description}</div>
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 4, wordBreak: 'break-all' }}>ID: {v.id}</div>
      </Card>
    </Col>
  );
  };

  const noVoice = aliyunVoices.length === 0 && doubaoVoices.length === 0;

  return (
    <div>
      <h2>AI角色</h2>

      {/* 试听文本输入框 */}
      <Input.TextArea
        value={sampleText}
        onChange={(e) => setSampleText(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder="试听文本（可编辑）"
        style={{ marginBottom: 16 }}
      />

      {!loading && noVoice && <Empty description="未能拉取到发音人，请检查服务器 .env 中的凭证配置" />}

      <Spin spinning={loading}>
        {aliyunVoices.length > 0 && (
          <>
            <h3>阿里云百炼（{aliyunVoices.length}）</h3>
            <Row gutter={16}>{aliyunVoices.map(renderVoice)}</Row>
          </>
        )}
        {doubaoVoices.length > 0 && (
          <>
            <h3 style={{ marginTop: 24 }}>火山引擎豆包（{doubaoVoices.length}）</h3>
            <Row gutter={16}>{doubaoVoices.map(renderVoice)}</Row>
          </>
        )}
      </Spin>
    </div>
  );
}
