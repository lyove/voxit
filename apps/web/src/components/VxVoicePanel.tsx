/**
 * 发音人试听台 —— 列出发音人，点击试听固定示例句
 */
import { useState } from 'react';
import { Card, List, Button, Tag, Space, message, Spin, Input } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import type { VxProvider, VxVoice } from '@voxit/core';
import { fetchVoices } from '../api.js';

interface Props {
  provider: VxProvider;
  apiKey: string;
  workspaceId: string;
}

export function VxVoicePanel({ provider, apiKey, workspaceId }: Props) {
  const [voices, setVoices] = useState<VxVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [sampleText, setSampleText] = useState('我家的后面有一个很大的花园，那里有我童年所有的回忆。');

  const load = async () => {
    setLoading(true);
    try {
      const v = await fetchVoices(provider, apiKey, workspaceId);
      setVoices(v);
    } catch (e) {
      message.error('加载发音人失败：' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const previewVoice = async (voice: VxVoice) => {
    setPreviewingId(voice.id);
    try {
      const res = await axios.post(`/api/providers/${provider}/preview`, {
        text: voice.sampleText ?? sampleText,
        voiceId: voice.id,
        apiKey,
        workspaceId,
        format: 'wav',
        sampleRate: 24000,
      });
      if (res.data.audioUrl) setAudioUrl(res.data.audioUrl);
      else if (res.data.audioData) setAudioUrl(`data:audio/wav;base64,${res.data.audioData}`);
    } catch (e) {
      message.error(`试听 ${voice.name} 失败：` + (e as Error).message);
    } finally {
      setPreviewingId(null);
    }
  };

  return (
    <Card title="发音人试听台" size="small" style={{ marginBottom: 16 }}>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" onClick={load} loading={loading}>加载发音人</Button>
        <Input
          style={{ width: 360 }}
          value={sampleText}
          onChange={(e) => setSampleText(e.target.value)}
          placeholder="试听示例句"
        />
      </Space>
      <Spin spinning={loading}>
        <List
          size="small"
          dataSource={voices}
          renderItem={(v) => (
            <List.Item
              actions={[
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  loading={previewingId === v.id}
                  onClick={() => previewVoice(v)}
                >
                  试听
                </Button>,
              ]}
            >
              <Space>
                <strong>{v.name}</strong>
                {v.gender && <Tag>{v.gender === 'male' ? '男' : v.gender === 'female' ? '女' : '中'}</Tag>}
                <span style={{ color: '#999' }}>{v.description}</span>
              </Space>
            </List.Item>
          )}
        />
      </Spin>
      {audioUrl && <audio src={audioUrl} controls style={{ width: '100%', marginTop: 12 }} />}
    </Card>
  );
}