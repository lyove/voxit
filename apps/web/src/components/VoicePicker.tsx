/**
 * 发音人选择器 —— 模型 + 音色两级选择，先试听后选择
 * 凭证由服务器 .env 统一提供，前端不接触 Key
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Select, Button, Space, message } from "antd";
import { PlayCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { VxProvider, type VxVoice } from "@voxit/core";
import { http, extractError, normalizeAudioUrl } from "../api.js";

interface Props {
  /** 选中的发音人 ID */
  voiceId?: string;
  /** 选中的合成模型 */
  voiceModel?: string;
  /** voiceId 可为 undefined：点击清除按钮时回调 undefined，用于清空发音人 */
  onChange?: (voiceId?: string, voiceModel?: string) => void;
  voices: VxVoice[];
  bookProvider?: VxProvider;
  sampleText?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  [VxProvider.ALIYUN]: "阿里云百炼",
  [VxProvider.DOUBAO]: "豆包火山引擎",
};

export function VoicePicker({
  voiceId,
  voiceModel,
  onChange,
  voices,
  bookProvider,
  sampleText,
}: Props) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 模型 → 音色列表分组
  const modelGroups = useMemo(() => {
    const map = new Map<string, VxVoice[]>();
    for (const v of voices) {
      const m = v.model ?? "";
      const list = map.get(m) ?? [];
      list.push(v);
      map.set(m, list);
    }
    const groups: { model: string; provider: VxProvider; voices: VxVoice[] }[] =
      [];
    for (const [model, list] of map) {
      groups.push({ model, provider: list[0].provider, voices: list });
    }
    // 排序：按 provider（书籍 provider 优先），再按 model 名字母序
    return groups.sort((a, b) => {
      const pa = a.provider === bookProvider ? -1 : 0;
      const pb = b.provider === bookProvider ? -1 : 0;
      if (pa !== pb) return pa - pb;
      return a.model.localeCompare(b.model);
    });
  }, [voices, bookProvider]);

  // 当前生效的模型：优先外部 voiceModel；否则按 voiceId 反查；否则默认第一个
  const effectiveModel = useMemo(() => {
    if (voiceModel) return voiceModel;
    if (voiceId) {
      const matched = voices.find((v) => v.id === voiceId);
      if (matched?.model) return matched.model;
    }
    return modelGroups[0]?.model ?? "";
  }, [voiceModel, voiceId, voices, modelGroups]);

  // 当前模型下可选音色
  const currentVoices = useMemo(
    () => modelGroups.find((g) => g.model === effectiveModel)?.voices ?? [],
    [modelGroups, effectiveModel],
  );

  // 组件卸载（关闭弹框/切换页面）时终止试听播放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handleModelChange = (model: string) => {
    // 切换模型时，若当前 voiceId 在新模型下也存在则保留，否则清空 voiceId
    const exists = voices.some((v) => v.id === voiceId && v.model === model);
    onChange?.(exists ? voiceId : undefined, model);
  };

  const handleVoiceChange = (id?: string) => {
    onChange?.(id, effectiveModel);
  };

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
        text:
          sampleText ||
          "夜幕降临，星光闪烁。他独自站在悬崖边，望着远方的城市灯火。",
        voiceId: voice.id,
        voiceModel: voice.model,
        format: "wav",
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
      message.error("试听失败：" + extractError(err));
    } finally {
      setPreviewingId(null);
    }
  };

  // 模型选择框选项：按 Provider 分组
  const modelOptions = useMemo(() => {
    const groups: {
      label: string;
      options: { label: string; value: string }[];
    }[] = [];
    for (const p of [VxProvider.ALIYUN, VxProvider.DOUBAO]) {
      const items = modelGroups
        .filter((g) => g.provider === p)
        .map((g) => ({ label: g.model, value: g.model }));
      if (items.length > 0) {
        groups.push({ label: PROVIDER_LABELS[p] ?? p, options: items });
      }
    }
    return groups;
  }, [modelGroups]);

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {modelGroups.length > 1 && (
        <>
          <label>AI音色</label>
          <Space.Compact block>
            <Select
              value={effectiveModel}
              onChange={handleModelChange}
              placeholder="选择合成模型"
              style={{ width: "50%", flex: 1 }}
              options={modelOptions}
            />
            <Select
              value={voiceId}
              onChange={handleVoiceChange}
              placeholder="选择发音人"
              showSearch
              allowClear
              optionFilterProp="label"
              style={{ width: "100%", flex: 1 }}
              options={currentVoices.map((v) => ({
                label: v.name,
                value: v.id,
                voice: v,
              }))}
              optionRender={(option) => {
                const voice = (option.data as any).voice as VxVoice | undefined;
                if (!voice)
                  return (
                    <span>{String((option.data as any).label ?? "")}</span>
                  );
                const isPlaying = playingId === voice.id;
                return (
                  <Space
                    style={{ width: "100%", justifyContent: "space-between" }}
                  >
                    <span>
                      {voice.name}（
                      {voice.gender === "male"
                        ? "男"
                        : voice.gender === "female"
                          ? "女"
                          : "中"}
                      ）{voice.description ? " · " + voice.description : ""}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={
                        isPlaying ? (
                          <PauseCircleOutlined />
                        ) : (
                          <PlayCircleOutlined />
                        )
                      }
                      loading={previewingId === voice.id}
                      onClick={(e) => handlePreview(voice, e)}
                    />
                  </Space>
                );
              }}
            />
          </Space.Compact>
        </>
      )}
    </Space>
  );
}
