/**
 * 发音人选择器 —— 下拉每一项带试听按钮，先试听后选择
 * 凭证由服务器 .env 统一提供，前端不接触 Key
 */
import { useEffect, useRef, useState } from 'react';
import { Select, Button, Space, message } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { VxProvider, type VxVoice } from '@voxit/core';
import { http, extractError, normalizeAudioUrl } from '../api.js';

interface Props {
  value?: string;
  /** voiceId 可为 undefined：点击清除按钮时回调 undefined，用于清空发音人 */
  onChange?: (voiceId?: string) => void;
  voices: VxVoice[];
  bookProvider?: VxProvider;
  sampleText?: string;
}

export function VoicePicker({ value, onChange, voices, bookProvider, sampleText }: Props) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 组件卸载（关闭弹框/切换页面）时终止试听播放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handlePreview = async (voice: VxVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // 当前正在播放，点击则暂停
    if (playingId === voice.id) {
      audioRef.current?.pause();
      return;
    }

    // 切到新音频前，先停掉旧的
    audioRef.current?.pause();

    setPreviewingId(voice.id);
    try {
      const resp = await http.post(`/providers/${voice.provider}/preview`, {
        text: sampleText || '夜幕降临，星光闪烁。他独自站在悬崖边，望着远方的城市灯火。',
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
    } catch (err) {
      message.error('试听失败：' + extractError(err));
    } finally {
      setPreviewingId(null);
    }
  };

  return (
    <div>
      <Select
        value={value}
        onChange={onChange}
        placeholder="选择发音人"
        showSearch
        allowClear
        optionFilterProp="label"
        style={{ width: '100%' }}
        options={voices.map((v) => ({ label: v.name, value: v.id, voice: v }))}
        optionRender={(option) => {
          const voice = option.data.voice as VxVoice;
          const isPlaying = playingId === voice.id;
          return (
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <span>{voice.name}（{voice.gender === 'male' ? '男' : voice.gender === 'female' ? '女' : '中'}）{voice.description ? ' · ' + voice.description : ''}</span>
              <Button
                type="text"
                size="small"
                icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                loading={previewingId === voice.id}
                onClick={(e) => handlePreview(voice, e)}
              />
            </Space>
          );
        }}
      />
    </div>
  );
}
