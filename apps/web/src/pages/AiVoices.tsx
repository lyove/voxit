/**
 * AI音色页
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Empty, Input, Row, Select, Spin, Tag, message } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { VxProvider, type VxVoice } from '@voxit/core';
import { fetchCapabilities, fetchVoices, http, extractError, normalizeAudioUrl } from '../api.js';

/** 随机小说段落示例 */
const SAMPLE_TEXTS = [
  '夜幕降临，星光闪烁。他独自站在悬崖边，望着远方的城市灯火，心中涌起一股莫名的惆怅。',
  '她推开门，一股陈旧的气息扑面而来。房间里摆满了落灰的书架，最深处透出一丝微弱的光。',
  '风雨交加的夜晚，雷声轰鸣。他紧了紧衣领，加快脚步穿过无人的街巷，身后似乎有什么在跟随。',
  '清晨的阳光透过窗帘洒进来，她睁开眼，看见窗台上停着一只蓝色的蝴蝶，翅膀轻轻颤动。',
  '他缓缓拔出长剑，剑身在月光下泛着冷光。对面的黑影动了，一场宿命之战即将开始。',
];

/** 板块主题色：不同 AI 大模型用不同颜色区分 */
interface SectionTheme {
  /** 主色（标题色块、标题文字） */
  color: string;
  /** 板块背景色 */
  bg: string;
  /** 板块边框色 */
  border: string;
}

/** 阿里云百炼：蓝色系 */
const ALIYUN_THEME: SectionTheme = { color: '#1677ff', bg: '#f0f7ff', border: '#91caff' };
/** 豆包火山引擎：紫色系 */
const DOUBAO_THEME: SectionTheme = { color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7' };

export default function AiVoices() {
  const [aliyunVoices, setAliyunVoices] = useState<VxVoice[]>([]);
  const [doubaoVoices, setDoubaoVoices] = useState<VxVoice[]>([]);
  // 模型列表来自 capabilities.availableModels（音色列表中可能缺无系统音色的模型，如 v3.5）
  const [aliyunModels, setAliyunModels] = useState<string[]>([]);
  const [doubaoModels, setDoubaoModels] = useState<string[]>([]);
  const [aliyunModel, setAliyunModel] = useState<string>('');
  const [doubaoModel, setDoubaoModel] = useState<string>('');
  // 每个大模型板块独立的音色搜索关键词
  const [aliyunKeyword, setAliyunKeyword] = useState('');
  const [doubaoKeyword, setDoubaoKeyword] = useState('');
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
      fetchCapabilities(VxProvider.ALIYUN).then((c) => c.availableModels ?? []).catch(() => []),
      fetchCapabilities(VxProvider.DOUBAO).then((c) => c.availableModels ?? []).catch(() => []),
      fetchVoices(VxProvider.ALIYUN).catch(() => []),
      fetchVoices(VxProvider.DOUBAO).catch(() => []),
    ]).then(([am, dm, a, d]) => {
      // 模型列表以 capabilities 为准，并兜底并入音色中出现的模型
      const amSet = new Set([...am, ...a.map((v) => v.model).filter((m): m is string => !!m)]);
      const dmSet = new Set([...dm, ...d.map((v) => v.model).filter((m): m is string => !!m)]);
      setAliyunModels([...amSet]);
      setDoubaoModels([...dmSet]);
      setAliyunVoices(a);
      setDoubaoVoices(d);
      // 默认选择 cosyvoice-v3-flash（v3.5 官方无系统音色，无法试听，故不作为默认）
      setAliyunModel((prev) =>
        prev || (amSet.has('cosyvoice-v3-flash') ? 'cosyvoice-v3-flash' : [...amSet][0] || '')
      );
      setDoubaoModel((prev) => prev || [...dmSet][0] || '');
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
        voiceModel: voice.model,
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

  /** 按关键词过滤音色（匹配名称 / ID / 描述） */
  const filterByKeyword = (voices: VxVoice[], keyword: string) => {
    const k = keyword.trim().toLowerCase();
    if (!k) return voices;
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(k) ||
        v.id.toLowerCase().includes(k) ||
        (v.description ?? '').toLowerCase().includes(k),
    );
  };

  /** 模型无音色时的提示（如 v3.5 官方不支持系统音色） */
  const renderNoSystemVoice = (model: string) => (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={model.startsWith('cosyvoice-v3.5')
        ? '该模型不支持系统音色（官方限制：v3.5 仅支持声音复刻/声音设计音色），请切换其他模型'
        : '该模型暂无可用的系统音色'}
      style={{ marginTop: 24 }}
    />
  );

  // 各板块：先按合成模型过滤，再按各自的关键词过滤
  const aliyunModelVoices = aliyunModel ? aliyunVoices.filter((v) => v.model === aliyunModel) : aliyunVoices;
  const filteredAliyun = filterByKeyword(aliyunModelVoices, aliyunKeyword);
  const doubaoModelVoices = doubaoModel ? doubaoVoices.filter((v) => v.model === doubaoModel) : doubaoVoices;
  const filteredDoubao = filterByKeyword(doubaoModelVoices, doubaoKeyword);

  const noVoice = aliyunVoices.length === 0 && doubaoVoices.length === 0;

  /** 渲染单个 AI 大模型板块（主题色 + 模型下拉 + 独立音色搜索） */
  const renderSection = (props: {
    title: string;
    theme: SectionTheme;
    model: string;
    models: string[];
    onModelChange: (m: string) => void;
    keyword: string;
    onKeywordChange: (k: string) => void;
    modelVoices: VxVoice[];
    filteredVoices: VxVoice[];
  }) => {
    const { title, theme, model, models, onModelChange, keyword, onKeywordChange, modelVoices, filteredVoices } = props;
    const keywordEmpty = filteredVoices.length === 0 && modelVoices.length > 0;
    return (
      <div style={{
        padding: 16,
        borderRadius: 8,
        border: `1px solid ${theme.border}`,
        background: theme.bg,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: theme.color }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 16,
              borderRadius: 2,
              background: theme.color,
              marginRight: 8,
              verticalAlign: -2,
            }} />
            {title}（{filteredVoices.length}）
          </h3>
          <Select
            style={{ minWidth: 200 }}
            placeholder="选择合成模型"
            value={model || undefined}
            onChange={onModelChange}
            options={models.map((m) => ({ label: m, value: m }))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#999' }} />}
            placeholder="搜索音色"
            style={{ width: 200 }}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
          />
        </div>
        {filteredVoices.length > 0
          ? <Row gutter={16}>{filteredVoices.map(renderVoice)}</Row>
          : keywordEmpty
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的音色" style={{ marginTop: 24 }} />
            : renderNoSystemVoice(model)}
      </div>
    );
  };

  return (
    <div>
      <h2>AI音色</h2>

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
        {aliyunVoices.length > 0 && renderSection({
          title: '阿里云百炼',
          theme: ALIYUN_THEME,
          model: aliyunModel,
          models: aliyunModels,
          onModelChange: setAliyunModel,
          keyword: aliyunKeyword,
          onKeywordChange: setAliyunKeyword,
          modelVoices: aliyunModelVoices,
          filteredVoices: filteredAliyun,
        })}
        {doubaoVoices.length > 0 && renderSection({
          title: '豆包火山引擎',
          theme: DOUBAO_THEME,
          model: doubaoModel,
          models: doubaoModels,
          onModelChange: setDoubaoModel,
          keyword: doubaoKeyword,
          onKeywordChange: setDoubaoKeyword,
          modelVoices: doubaoModelVoices,
          filteredVoices: filteredDoubao,
        })}
      </Spin>
    </div>
  );
}
