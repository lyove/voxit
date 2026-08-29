/**
 * 章节详情页
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Slider,
  Space,
  Tag,
  Tooltip,
  message,
  Progress,
} from "antd";
import {
  ArrowLeftOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import {
  VxEmotion,
  VxProvider,
  type VxChapter,
  type VxParagraph,
  type VxVoice,
  type VxVoiceParams,
  type VxProviderCapabilities,
} from "@voxit/core";
import * as api from "../api";
import { VoicePicker } from "../components/VoicePicker";
import { useStore } from "../store";
import { getRoleColor } from "../utils/roleColors";

const { TextArea } = Input;

const EMOTION_LABELS: Record<VxEmotion, string> = {
  [VxEmotion.NEUTRAL]: "中立",
  [VxEmotion.HAPPY]: "开心",
  [VxEmotion.SAD]: "悲伤",
  [VxEmotion.ANGRY]: "愤怒",
  [VxEmotion.SURPRISED]: "惊讶",
  [VxEmotion.DISGUSTED]: "厌恶",
  [VxEmotion.FEARFUL]: "恐惧",
  [VxEmotion.EXCITED]: "兴奋",
  [VxEmotion.RELAXED]: "放松",
  [VxEmotion.GENTLE]: "温柔",
  [VxEmotion.SERIOUS]: "严肃",
  [VxEmotion.BORED]: "无聊",
  [VxEmotion.TIRED]: "疲惫",
  [VxEmotion.SARCASTIC]: "讽刺",
  [VxEmotion.CURIOUS]: "好奇",
  [VxEmotion.EMPATHETIC]: "共情",
  [VxEmotion.WHISPER]: "耳语",
  [VxEmotion.CRYING]: "哭泣",
};

/** 段落行：左右布局 */
const ParagraphRow = ({
  paragraph,
  voices,
  capabilitiesByProvider,
  bookRoles,
  bookTemplates,
  provider,
  onUpdate,
  onEditRole,
  onPreviewStateChange,
}: {
  paragraph: any;
  index?: number;
  voices: VxVoice[];
  capabilitiesByProvider?: Partial<Record<VxProvider, VxProviderCapabilities>>;
  bookRoles: string[];
  bookTemplates: any[];
  provider: VxProvider;
  onUpdate: (patch: any) => void;
  onEditRole: (paragraph: VxParagraph) => void;
  onPreviewStateChange: (
    paragraphId: string,
    state: { hasPreview: boolean; hasSelected: boolean },
  ) => void;
}) => {
  const [previewing, setPreviewing] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [previewList, setPreviewList] = useState<{ id: string; url: string; time: number }[]>([]);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const roleColor = getRoleColor(paragraph.characterName);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    onPreviewStateChange(paragraph.id, {
      hasPreview: previewList.length > 0,
      hasSelected: selectedPreviewId != null,
    });
  }, [onPreviewStateChange, paragraph.id, previewList, selectedPreviewId]);

  const playById = (id: string, url: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audio.onpause = () => setPlayingId(null);
    audioRef.current = audio;
    audio.play().catch(() => message.warning("自动播放被浏览器阻止"));
    setPlayingId(id);
  };

  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const updateVoiceParams = (patch: Partial<VxVoiceParams>) => {
    onUpdate({ voiceParams: { ...paragraph.voiceParams, ...patch } });
  };

  const voiceProvider =
    voices.find((v) => v.id === paragraph.voiceId)?.provider ?? provider;
  const voiceCapabilities = capabilitiesByProvider?.[voiceProvider];

  const handlePreview = async () => {
    if (!paragraph.voiceId) {
      message.warning("请先选择发音人");
      return;
    }
    if (!paragraph.text?.trim()) {
      message.warning("段落文本为空");
      return;
    }
    setPreviewing(true);
    try {
      const resp = await api.http.post(`/providers/${voiceProvider}/preview`, {
        text: paragraph.text,
        voiceId: paragraph.voiceId,
        voiceModel: paragraph.voiceModel,
        voiceParams: paragraph.voiceParams,
        format: "wav",
        sampleRate: 24000,
      });
      const audioUrl = resp.data.audioUrl
        ? api.normalizeAudioUrl(resp.data.audioUrl)
        : resp.data.audioData
          ? `data:audio/wav;base64,${resp.data.audioData}`
          : undefined;
      if (audioUrl) {
        const item = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: audioUrl,
          time: Date.now(),
        };
        setPreviewList((prev) => [...prev, item]);
        setSelectedPreviewId(item.id);
        playById(item.id, audioUrl);
      }
    } catch (e) {
      message.error("试听失败：" + api.extractError(e));
    } finally {
      setPreviewing(false);
    }
  };

  const handleReplay = (item: { id: string; url: string; time: number }) => {
    playById(item.id, item.url);
  };

  const handleSynthesize = async () => {
    message.info("合成功能开发中");
    // if (!paragraph.voiceId) {
    //   message.warning("请先选择发音人");
    //   return;
    // }
    // const selected = previewList.find((it) => it.id === selectedPreviewId);
    // if (!selected) {
    //   message.warning("请先试听，勾选要合成的音频");
    //   return;
    // }
    // setSynthesizing(true);
    // try {
    //   await api.updateParagraph(paragraph.id, {
    //     voiceId: paragraph.voiceId,
    //     voiceParams: paragraph.voiceParams,
    //   });
    //   // 用勾选的那条试听音频作为合成结果
    //   const updated = await api.synthesizeParagraph(paragraph.id, { audioUrl: selected.url });
    //   onUpdate({ audioUrl: updated.audioUrl, status: updated.status });
    //   message.success("合成完成");
    // } catch (e) {
    //   message.error("合成失败：" + api.extractError(e));
    // } finally {
    //   setSynthesizing(false);
    // }
  };

  const emotionList = (() => {
    const sv = voices.find((v) => v.id === paragraph.voiceId);
    return (
      sv?.supportedEmotions ??
      voiceCapabilities?.availableEmotions ??
      Object.values(VxEmotion)
    );
  })();

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: 16,
        marginBottom: 12,
        background: roleColor.bg,
        borderLeft: `4px solid ${roleColor.color}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: 120,
          flexShrink: 0,
          paddingRight: 8,
          borderRight: "1px solid #f0f0f0",
        }}
      >
        {/* <div style={{ color: '#999', marginBottom: 4 }}>#{index + 1}</div> */}
        <Space.Compact style={{ width: "100%", marginBottom: 8 }}>
          <Select
            size="small"
            style={{ flex: 1 }}
            value={paragraph.characterName || "旁白"}
            onChange={(v: string) => {
              // 切换角色立即停止当前试听播放；角色名不存在于模板时保留段落原发音人
              stopPreview();
              const tpl = bookTemplates.find((t: any) => t.characterName === v);
              onUpdate({
                characterName: v,
                ...(tpl?.voiceId
                  ? { voiceId: tpl.voiceId, voiceModel: tpl.voiceModel }
                  : {}),
              });
            }}
            options={bookRoles.map((r) => ({ label: r, value: r }))}
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEditRole(paragraph)}
          />
        </Space.Compact>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <TextArea
          value={paragraph.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder="输入段落文本..."
          style={{ marginBottom: 8 }}
        />
        <Space wrap style={{ marginBottom: 8 }}>
          <Tooltip title="语速">
            <div style={{ width: 100 }}>
              <small>
                语速 {(paragraph.voiceParams?.speed ?? 1).toFixed(1)}
              </small>
              <Slider
                min={voiceCapabilities?.speedRange.min ?? 0.5}
                max={voiceCapabilities?.speedRange.max ?? 2}
                step={0.1}
                value={paragraph.voiceParams?.speed ?? 1}
                onChange={(v) => updateVoiceParams({ speed: v })}
              />
            </div>
          </Tooltip>
          <Tooltip title="音调">
            <div style={{ width: 100 }}>
              <small>
                音调 {(paragraph.voiceParams?.pitch ?? 1).toFixed(1)}
              </small>
              <Slider
                min={voiceCapabilities?.pitchRange.min ?? 0.5}
                max={voiceCapabilities?.pitchRange.max ?? 2}
                step={0.1}
                value={paragraph.voiceParams?.pitch ?? 1}
                onChange={(v) => updateVoiceParams({ pitch: v })}
              />
            </div>
          </Tooltip>
          <Select
            size="small"
            value={paragraph.voiceParams?.emotion ?? VxEmotion.NEUTRAL}
            style={{ width: 100 }}
            onChange={(v: VxEmotion) => updateVoiceParams({ emotion: v })}
            options={emotionList.map((e) => ({
              label: EMOTION_LABELS[e] ?? e,
              value: e,
            }))}
          />
          {voiceCapabilities?.supportsInstruction !== false && (
            <Input
              size="small"
              placeholder="自然语言指令"
              value={paragraph.voiceParams?.instruction ?? ""}
              onChange={(e) =>
                updateVoiceParams({ instruction: e.target.value })
              }
              style={{ flex: 1, minWidth: 160 }}
            />
          )}
        </Space>
        <Space>
          <Tooltip
            title={!paragraph.voiceId ? "当前段落没有选择AI发音人" : undefined}
          >
            <Button
              size="small"
              icon={
                previewList.length > 0 &&
                playingId === previewList[previewList.length - 1].id ? (
                  <PauseCircleOutlined />
                ) : (
                  <PlayCircleOutlined />
                )
              }
              loading={previewing}
              disabled={!paragraph.voiceId}
              onClick={handlePreview}
            >
              {previewList.length > 0 &&
              playingId === previewList[previewList.length - 1].id
                ? "暂停"
                : "试听"}
            </Button>
          </Tooltip>
          <Tooltip
            title={
              !paragraph.voiceId
                ? "当前段落没有选择AI发音人"
                : !selectedPreviewId
                  ? "请先试听并勾选要合成的音频"
                  : undefined
            }
          >
            <Button
              size="small"
              type="primary"
              loading={synthesizing}
              disabled={!paragraph.voiceId || !selectedPreviewId}
              onClick={handleSynthesize}
            >
              合成
            </Button>
          </Tooltip>
        </Space>
        {previewList.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Radio.Group
              value={selectedPreviewId}
              onChange={(e) => setSelectedPreviewId(e.target.value)}
              style={{ width: "100%" }}
            >
              <List
                size="small"
                header={
                  <div style={{ color: "#999", fontSize: 12 }}>
                    试听记录（合成将使用勾选的音频）
                  </div>
                }
                dataSource={previewList}
                renderItem={(item, idx) => (
                  <List.Item
                    actions={[
                      <Button
                        key="replay"
                        size="small"
                        type="text"
                        icon={
                          playingId === item.id ? (
                            <PauseCircleOutlined />
                          ) : (
                            <PlayCircleOutlined />
                          )
                        }
                        onClick={() => handleReplay(item)}
                      >
                        {playingId === item.id ? "暂停" : "试听"}
                      </Button>,
                    ]}
                  >
                    <Radio value={item.id}>
                      #{previewList.length - idx} ·{" "}
                      {new Date(item.time).toLocaleTimeString()}
                    </Radio>
                  </List.Item>
                )}
              />
            </Radio.Group>
          </div>
        )}
      </div>
      {/* 段落状态列：试听/合成 */}
      <div
        style={{
          width: 96,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          paddingLeft: 12,
          borderLeft: "1px solid #f0f0f0",
        }}
      >
        <Tag color={previewList.length > 0 ? "green" : "default"}>
          {previewList.length > 0 ? "已试听" : "未试听"}
        </Tag>
        {/* 合成功能开发中：暂未实现，统一显示未合成 */}
        <Tag color="default">未合成</Tag>
      </div>
    </div>
  );
}

export default function ChapterDetail() {
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  const { currentProject, voices, loadAllVoices } = useStore.getState();
  const [chapter, setChapter] = useState<VxChapter | null>(null);
  const [book, setBook] = useState(currentProject);
  const [capabilitiesByProvider, setCapabilitiesByProvider] = useState<
    Partial<Record<VxProvider, VxProviderCapabilities>>
  >({});
  const [bookRoles, setBookRoles] = useState<string[]>([]);
  const [bookTemplates, setBookTemplates] = useState<any[]>([]);
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [editingParagraphInfo, setEditingParagraphInfo] = useState<VxParagraph | undefined>(undefined);
  const [editRoleVoiceId, setEditRoleVoiceId] = useState<string | undefined>();
  const [editRoleVoiceModel, setEditRoleVoiceModel] = useState<string | undefined>();
  const [previewStates, setPreviewStates] = useState<
    Record<string, { hasPreview: boolean; hasSelected: boolean }>
  >({});
  const [batchSynthesizing, setBatchSynthesizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    index: number;
    total: number;
    success: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const [editingChapterName, setEditingChapterName] = useState(false);
  const [chapterNameValue, setChapterNameValue] = useState("");

  const load = async () => {
    if (!bookId) return;
    const proj = await api.fetchProject(bookId);
    setBook(proj);
    useStore.setState({ currentProject: proj });
    const ch = proj.chapters.find((c) => c.id === chapterId);
    setChapter(ch ?? null);
    // 加载全部 Provider 能力（混用时按发音人所属 Provider 取对应能力）
    const caps: Partial<Record<VxProvider, VxProviderCapabilities>> = {};
    await Promise.all(
      [VxProvider.ALIYUN, VxProvider.DOUBAO].map(async (p) => {
        try {
          caps[p] = await api.fetchCapabilities(p);
        } catch {
          /* 未配置凭证则空 */
        }
      }),
    );
    setCapabilitiesByProvider(caps);
    // 自动加载全部 Provider 发音人（凭证由服务器 .env 提供）
    try {
      await loadAllVoices();
    } catch {
      /* 未配置凭证则空 */
    }
    try {
      const tpls = await api.fetchVoiceTemplates(bookId);
      setBookTemplates(tpls);
      setBookRoles(tpls.map((t) => t.characterName));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, [bookId, chapterId]);

  /** 收集段落行上报的试听/勾选状态（引用相同则不更新，避免多余渲染） */
  const handlePreviewStateChange = useCallback(
    (
      paragraphId: string,
      state: { hasPreview: boolean; hasSelected: boolean },
    ) => {
      setPreviewStates((prev) => {
        const cur = prev[paragraphId];
        if (
          cur &&
          cur.hasPreview === state.hasPreview &&
          cur.hasSelected === state.hasSelected
        ) {
          return prev;
        }
        return { ...prev, [paragraphId]: state };
      });
    },
    [],
  );

  if (!chapter || !book) {
    return <div>加载中...</div>;
  }

  const chapters = book.chapters;
  const curIdx = chapters.findIndex((c) => c.id === chapterId);
  const prevCh = curIdx > 0 ? chapters[curIdx - 1] : null;
  const nextCh = curIdx < chapters.length - 1 ? chapters[curIdx + 1] : null;

  const handleSaveAll = async () => {
    for (const p of chapter.paragraphs) {
      try {
        await api.updateParagraph(p.id, {
          text: p.text,
          role: p.role,
          characterName: p.characterName,
          voiceId: p.voiceId,
          voiceParams: p.voiceParams,
        });
      } catch (e) {
        message.error("保存失败：" + api.extractError(e));
        return;
      }
    }
    message.success("整章已保存");
    useStore.getState().clearChapterDirty(chapter.id);
  };

  /** 双击章节名称编辑 */
  const handleStartRenameChapter = () => {
    setChapterNameValue(chapter.title);
    setEditingChapterName(true);
  };

  const handleConfirmRenameChapter = async () => {
    if (!chapterId || !chapterNameValue.trim()) return;
    try {
      await api.renameChapter(chapterId, chapterNameValue.trim());
      setEditingChapterName(false);
      load();
    } catch (e) {
      message.error("重命名失败：" + api.extractError(e));
    }
  };

  /** 打开编辑角色弹框（从段落旁的编辑图标触发，旁白也是普通角色，同样可编辑） */
  const handleEditRole = (paragraph: any) => {
    setEditingParagraphInfo(paragraph)
    const tpl = bookTemplates.find((t) => t.characterName === paragraph?.characterName);
    setEditRoleVoiceId(tpl?.voiceId);
    setEditRoleVoiceModel(tpl?.voiceModel);
    setEditRoleOpen(true);
  };

  /** 保存编辑角色（同步到 templates，允许清空发音人） */
  const handleSaveEditRole = async () => {
    const { characterName } = editingParagraphInfo || {};
    if (!bookId || !characterName) {
      message.warning("请填写角色名");
      return;
    }
    try {
      await api.saveTemplate(bookId, characterName, editRoleVoiceId ?? "", editRoleVoiceModel);

      // 编辑角色模板后，把新声音同步到当前段落，避免“角色选择框/编辑弹窗”与“试听”发音人不一致
      if (editingParagraphInfo?.id) {
        const patch = { voiceId: editRoleVoiceId, voiceModel: editRoleVoiceModel };
        await api.updateParagraph(editingParagraphInfo.id, patch);
        updateLocal(editingParagraphInfo.id, patch);
      }

      message.success("编辑成功");
      setEditRoleOpen(false);
      const tpls = await api.fetchVoiceTemplates(bookId);
      setBookTemplates(tpls);
      setBookRoles(tpls.map((t) => t.characterName));
    } catch (e) {
      message.error("编辑失败：" + api.extractError(e));
    }
  };

  const handleAddParagraph = async () => {
    try {
      // 新增段落默认角色为"旁白"（书籍默认角色）
      await useStore.getState().addParagraph(chapter.id, "", "旁白");
      load();
    } catch (e) {
      message.error("新增失败：" + api.extractError(e));
    }
  };

  const handleSynthesizeAll = async () => {
    message.info("一键合成功能开发中")
    // setBatchSynthesizing(true);
    // setBatchProgress({
    //   index: 0,
    //   total: chapter.paragraphs.length,
    //   success: 0,
    //   failed: 0,
    //   skipped: 0,
    // });
    // try {
    //   await api.synthesizeAllStream(chapter.id, (e) => {
    //     setBatchProgress({
    //       index: e.index,
    //       total: e.total,
    //       success: e.success,
    //       failed: e.failed,
    //       skipped: e.skipped,
    //     });
    //     if (e.type === "done" && e.result)
    //       message.success(
    //         `合成完成：成功${e.result.success} 失败${e.result.failed} 跳过${e.result.skipped}`,
    //       );
    //   });
    //   load();
    // } catch (e) {
    //   message.error("合成失败：" + api.extractError(e));
    // } finally {
    //   setBatchSynthesizing(false);
    //   setBatchProgress(null);
    // }
  };

  const updateLocal = (
    id: string,
    patch: Partial<(typeof chapter.paragraphs)[0]>,
  ) => {
    setChapter((ch) =>
      ch
        ? {
            ...ch,
            paragraphs: ch.paragraphs.map((p) =>
              p.id === id ? { ...p, ...patch } : p,
            ),
          }
        : null,
    );
    useStore.getState().markChapterDirty(chapter.id);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Space>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/books/${bookId}`)}
          />
          <span style={{ color: "#999" }}>{book.name}</span>
        </Space>
        <Space>
          {editingChapterName ? (
            <Input
              size="small"
              style={{ width: 200 }}
              value={chapterNameValue}
              onChange={(e) => setChapterNameValue(e.target.value)}
              onPressEnter={handleConfirmRenameChapter}
              onBlur={handleConfirmRenameChapter}
              autoFocus
            />
          ) : (
            <span
              style={{ fontSize: 18, fontWeight: 600, cursor: "pointer" }}
              onDoubleClick={handleStartRenameChapter}
              title="双击编辑章节名称"
            >
              {chapter.title}
            </span>
          )}
        </Space>
        <Space>
          <Button type="primary" onClick={handleSaveAll}>
            保存
          </Button>
          <Button
            disabled={!prevCh}
            onClick={() =>
              prevCh && navigate(`/books/${bookId}/chapters/${prevCh.id}`)
            }
          >
            上一章
          </Button>
          <Button
            disabled={!nextCh}
            onClick={() =>
              nextCh && navigate(`/books/${bookId}/chapters/${nextCh.id}`)
            }
          >
            下一章
          </Button>
        </Space>
      </div>

      {/* 按钮行 */}
      <Space style={{ marginBottom: 16 }}>
        <Button
          size="small"
          type="primary"
          onClick={handleAddParagraph}
          title="新增段落（默认角色：旁白）"
        >
          新增段落
        </Button>
        <Button size="small" onClick={() => message.info("批量导入段落开发中")}>
          批量导入段落
        </Button>
        <Tooltip
          title={
            chapter.paragraphs.length === 0 ||
            chapter.paragraphs.every((p) => {
              const st = previewStates[p.id];
              return st?.hasPreview && st?.hasSelected;
            })
              ? undefined
              : "所有段落都需先试听并勾选各自的音频"
          }
        >
          <Button
            size="small"
            loading={batchSynthesizing}
            disabled={
              chapter.paragraphs.length === 0 ||
              !chapter.paragraphs.every((p) => {
                const st = previewStates[p.id];
                return st?.hasPreview && st?.hasSelected;
              })
            }
            onClick={handleSynthesizeAll}
          >
            一键合成
          </Button>
        </Tooltip>
        <Button size="small" onClick={() => message.info("导出成品开发中")}>
          导出成品
        </Button>
      </Space>

      {batchProgress && (
        <Progress
          percent={
            batchProgress.total
              ? Math.round((batchProgress.index / batchProgress.total) * 100)
              : 0
          }
          status={batchSynthesizing ? "active" : "normal"}
          format={() =>
            `${batchProgress.index}/${batchProgress.total} · 成功${batchProgress.success} 失败${batchProgress.failed} 跳过${batchProgress.skipped}`
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 段落列表：左右布局 */}
      {chapter.paragraphs.length === 0 && (
        <div style={{ color: "#999" }}>暂无段落，点击上方按钮添加</div>
      )}
      {chapter.paragraphs.map((p, i) => (
        <ParagraphRow
          key={p.id}
          paragraph={p}
          index={i}
          voices={voices}
          capabilitiesByProvider={capabilitiesByProvider}
          bookRoles={bookRoles}
          bookTemplates={bookTemplates}
          provider={book.providerConfig.provider}
          onUpdate={(patch) => updateLocal(p.id, patch)}
          onEditRole={handleEditRole}
          onPreviewStateChange={handlePreviewStateChange}
        />
      ))}

      {/* 编辑角色弹框（从段落旁编辑图标触发） */}
      <Modal
        title={`编辑角色：${editingParagraphInfo?.characterName}`}
        open={editRoleOpen}
        onCancel={() => setEditRoleOpen(false)}
        onOk={handleSaveEditRole}
        okText="保存"
        width={680}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>角色名</label>
            <Input value={editingParagraphInfo?.characterName} disabled />
          </div>
          <div>
            <VoicePicker
              voiceId={editRoleVoiceId}
              voiceModel={editRoleVoiceModel}
              onChange={(id, model) => { setEditRoleVoiceId(id); setEditRoleVoiceModel(model); }}
              voices={voices}
              bookProvider={book?.providerConfig.provider}
              sampleText={editingParagraphInfo?.text}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
