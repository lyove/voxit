/**
 * 段落编辑卡片 —— 最核心的交互单元
 * 含：文本编辑、旁白/角色标记、发音人选择、性格参数、试听、合成
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Slider, Space, Tag, Tooltip, message } from 'antd';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  SoundOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { VxEmotion } from '@voxit/core';
import type { VxParagraph, VxProviderCapabilities, VxRole, VxVoice, VxVoiceParams } from '@voxit/core';
import * as api from '../api.js';
import { useStore } from '../store.js';

const { TextArea } = Input;

/** 全部情感标签映射（按 capabilities.availableEmotions 过滤后渲染） */
const EMOTION_LABELS: Record<VxEmotion, string> = {
  [VxEmotion.NEUTRAL]: '中立',
  [VxEmotion.HAPPY]: '开心',
  [VxEmotion.SAD]: '悲伤',
  [VxEmotion.ANGRY]: '愤怒',
  [VxEmotion.SURPRISED]: '惊讶',
  [VxEmotion.DISGUSTED]: '厌恶',
  [VxEmotion.FEARFUL]: '恐惧',
  [VxEmotion.EXCITED]: '兴奋',
  [VxEmotion.RELAXED]: '放松',
  [VxEmotion.GENTLE]: '温柔',
  [VxEmotion.SERIOUS]: '严肃',
  [VxEmotion.BORED]: '无聊',
  [VxEmotion.TIRED]: '疲惫',
  [VxEmotion.SARCASTIC]: '讽刺',
  [VxEmotion.CURIOUS]: '好奇',
  [VxEmotion.EMPATHETIC]: '共情',
  [VxEmotion.WHISPER]: '耳语',
  [VxEmotion.CRYING]: '哭泣',
};

interface Props {
  paragraph: VxParagraph;
  voices: VxVoice[];
  index: number;
  capabilities?: VxProviderCapabilities;
}

export function VxParagraphCard({ paragraph, voices, index, capabilities }: Props) {
  const updateLocal = useStore((s) => s.updateParagraphLocal);
  const [synthesizing, setSynthesizing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 切换页面/卸载时终止试听播放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const isCharacter = paragraph.role === 'character';

  const updateField = <K extends keyof VxParagraph>(key: K, value: VxParagraph[K]) => {
    updateLocal(paragraph.id, { [key]: value } as Partial<VxParagraph>);
  };

  const updateVoiceParams = (patch: Partial<VxVoiceParams>) => {
    const next: VxVoiceParams = { ...paragraph.voiceParams, ...patch };
    updateLocal(paragraph.id, { voiceParams: next });
  };

  const handleSave = async () => {
    try {
      await api.updateParagraph(paragraph.id, {
        text: paragraph.text,
        role: paragraph.role,
        characterName: paragraph.characterName,
        voiceId: paragraph.voiceId,
        voiceParams: paragraph.voiceParams,
      });
      message.success('已保存');
      // 保存成功后清除该章脏标记（若该章所有段落都已保存则清除）
      // 简化：单段保存即清除该章脏标记（因为最新内容已持久化）
      useStore.getState().clearChapterDirty(paragraph.chapterId);
    } catch (e) {
      message.error('保存失败：' + api.extractError(e));
    }
  };

  const handlePreview = async () => {
    // 正在播放当前段落音频则暂停
    if (playingId === paragraph.id) {
      audioRef.current?.pause();
      return;
    }
    // 切到新音频前先停掉旧的
    audioRef.current?.pause();

    if (!paragraph.voiceId) {
      message.warning('请先选择发音人');
      return;
    }
    setPreviewing(true);
    try {
      await api.updateParagraph(paragraph.id, {
        voiceId: paragraph.voiceId,
        voiceParams: paragraph.voiceParams,
      });
      const res = await api.previewParagraph(paragraph.id);
      const url = res.audioUrl
        ? api.normalizeAudioUrl(res.audioUrl)
        : res.audioData
          ? `data:audio/wav;base64,${res.audioData}`
          : undefined;
      if (url) {
        const audio = new Audio(url);
        audio.onended = () => setPlayingId(null);
        audio.onpause = () => setPlayingId(null);
        audioRef.current = audio;
        await audio.play();
        setPlayingId(paragraph.id);
      }
      message.success('试听已生成');
    } catch (e) {
      message.error('试听失败：' + api.extractError(e));
    } finally {
      setPreviewing(false);
    }
  };

  const handleSynthesize = async () => {
    if (!paragraph.voiceId) {
      message.warning('请先选择发音人');
      return;
    }
    setSynthesizing(true);
    try {
      await api.updateParagraph(paragraph.id, {
        voiceId: paragraph.voiceId,
        voiceParams: paragraph.voiceParams,
      });
      const updated = await api.synthesizeParagraph(paragraph.id);
      updateLocal(paragraph.id, { audioUrl: updated.audioUrl, status: updated.status });
      message.success('合成完成');
    } catch (e) {
      message.error('合成失败：' + api.extractError(e));
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <div className={`vx-paragraph-card ${isCharacter ? 'is-character' : 'is-narration'}`}>
      <div className="vx-para-row">
        <div className="vx-para-index">#{index + 1}</div>
        <div className="vx-para-body">
          {/* 角色 + 发音人选择行 */}
          <div className="vx-para-controls">
            <Select
              size="small"
              value={paragraph.role}
              onChange={(v: VxRole) => updateField('role', v)}
              style={{ width: 100 }}
              options={[
                { label: '旁白', value: 'narration' },
                { label: '角色', value: 'character' },
              ]}
            />
            {isCharacter && (
              <Input
                size="small"
                placeholder="角色名"
                value={paragraph.characterName ?? ''}
                onChange={(e) => updateField('characterName', e.target.value)}
                style={{ width: 120 }}
              />
            )}
            <Select
              size="small"
              placeholder="选择发音人"
              value={paragraph.voiceId}
              onChange={(v) => updateField('voiceId', v)}
              style={{ minWidth: 180 }}
              showSearch
              optionFilterProp="label"
              options={voices.map((v) => ({
                label: `${v.name}（${v.gender === 'male' ? '男' : v.gender === 'female' ? '女' : '中'}·${v.description ?? ''}）`,
                value: v.id,
              }))}
            />
            {isCharacter && paragraph.characterName && (
              <Tag color="blue" icon={<CustomerServiceOutlined />}>
                {paragraph.characterName}
              </Tag>
            )}
            {!isCharacter && <Tag color="green" icon={<SoundOutlined />}>旁白</Tag>}
          </div>

          {/* 文本编辑 */}
          <TextArea
            value={paragraph.text}
            onChange={(e) => updateField('text', e.target.value)}
            autoSize={{ minRows: 2, maxRows: 8 }}
            placeholder="输入这一段的文本内容..."
          />

          {/* 性格参数：语速 / 音调 / 音量 / 情感 / 指令 */}
          <div className="vx-para-controls">
            <div style={{ display: 'flex', flexDirection: 'column', width: 120 }}>
              <small>语速 {(paragraph.voiceParams?.speed ?? capabilities?.speedRange.default ?? 1).toFixed(1)}</small>
              <Slider
                min={capabilities?.speedRange.min ?? 0.5}
                max={capabilities?.speedRange.max ?? 2}
                step={0.1}
                value={paragraph.voiceParams?.speed ?? capabilities?.speedRange.default ?? 1}
                onChange={(v) => updateVoiceParams({ speed: v })}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: 120 }}>
              <small>音调 {(paragraph.voiceParams?.pitch ?? capabilities?.pitchRange.default ?? 1).toFixed(1)}</small>
              <Slider
                min={capabilities?.pitchRange.min ?? 0.5}
                max={capabilities?.pitchRange.max ?? 2}
                step={0.1}
                value={paragraph.voiceParams?.pitch ?? capabilities?.pitchRange.default ?? 1}
                onChange={(v) => updateVoiceParams({ pitch: v })}
              />
            </div>
            {/* 按当前发音人的 supportedEmotions 过滤情感，无则用 capabilities 全集 */}
              {(() => {
                const selectedVoice = voices.find((v) => v.id === paragraph.voiceId);
                const emotionList = selectedVoice?.supportedEmotions ?? capabilities?.availableEmotions ?? Object.values(VxEmotion);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', width: 120 }}>
                    <small>情感</small>
                    <Select
                      size="small"
                      placeholder="情感"
                      value={paragraph.voiceParams?.emotion ?? VxEmotion.NEUTRAL}
                      onChange={(v: VxEmotion) => updateVoiceParams({ emotion: v })}
                      style={{ width: 100 }}
                      options={emotionList.map((e) => ({ label: EMOTION_LABELS[e] ?? e, value: e }))}
                    />
                  </div>
                );
              })()}
            {capabilities?.supportsInstruction !== false && (
              <Input
                size="small"
                placeholder="自然语言指令（如：年轻活泼，上扬语调）"
                value={paragraph.voiceParams?.instruction ?? ''}
                onChange={(e) => updateVoiceParams({ instruction: e.target.value })}
                style={{ flex: 1, minWidth: 200 }}
              />
            )}
          </div>

          {/* 操作按钮 */}
          <Space>
            <Button size="small" onClick={handleSave}>保存</Button>
            <Button
              size="small"
              icon={playingId === paragraph.id ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              loading={previewing}
              disabled={!paragraph.voiceId}
              onClick={handlePreview}
            >
              {playingId === paragraph.id ? '暂停' : '试听'}
            </Button>
            <Button
              size="small"
              type="primary"
              loading={synthesizing}
              disabled={!paragraph.voiceId}
              onClick={handleSynthesize}
            >
              合成
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
}