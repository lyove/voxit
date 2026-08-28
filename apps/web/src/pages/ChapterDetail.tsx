/**
 * 章节详情页
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
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
  VxRole,
  type VxVoice,
  type VxVoiceParams,
  type VxProviderCapabilities,
} from "@voxit/core";
import * as api from "../api.js";
import { VoicePicker } from "../components/VoicePicker.js";
import { useStore } from "../store.js";

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

export default function ChapterDetail() {
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  const { currentProject, voices, loadVoices } = useStore.getState();
  const [chapter, setChapter] = useState<VxChapter | null>(null);
  const [book, setBook] = useState(currentProject);
  const [capabilities, setCapabilities] = useState<
    VxProviderCapabilities | undefined
  >(undefined);
  const [bookRoles, setBookRoles] = useState<string[]>([]);
  const [bookTemplates, setBookTemplates] = useState<any[]>([]);
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [editingRoleName, setEditingRoleName] = useState<string>("");
  const [editRoleVoiceId, setEditRoleVoiceId] = useState<string | undefined>();
  const [rolePreviewing, setRolePreviewing] = useState(false);
  const [rolePreviewUrl, setRolePreviewUrl] = useState<string | undefined>();
  // 各段落试听/勾选状态（由 ParagraphRow 上报），用于控制合成按钮可用性
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
  const [narrationEditOpen, setNarrationEditOpen] = useState(false);
  const [narrationEditParaId, setNarrationEditParaId] = useState<string | null>(
    null,
  );
  const [narrationVoiceId, setNarrationVoiceId] = useState<
    string | undefined
  >();

  const load = async () => {
    if (!bookId) return;
    const proj = await api.fetchProject(bookId);
    setBook(proj);
    useStore.setState({ currentProject: proj });
    const ch = proj.chapters.find((c) => c.id === chapterId);
    setChapter(ch ?? null);
    // 加载 Provider 能力
    api
      .fetchCapabilities(proj.providerConfig.provider)
      .then(setCapabilities)
      .catch(() => {});
    // 自动加载发音人（凭证由服务器 .env 提供）
    try {
      await loadVoices(proj.providerConfig.provider);
    } catch {
      /* 未配置凭证则空 */
    }
    // 加载书籍角色模板（角色 tab 里新增的角色），供段落角色下拉使用
    // 默认确保"旁白"角色存在：即使尚未设置旁白发音人，下拉里也始终有"旁白"可选项
    try {
      const tpls = await api.fetchTemplates(bookId);
      const withNarration = tpls.some((t) => t.characterName === "旁白")
        ? tpls
        : [
            { id: "__narration__", characterName: "旁白", voiceId: undefined },
            ...tpls,
          ];
      setBookTemplates(withNarration);
      setBookRoles(withNarration.map((t) => t.characterName));
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

  if (!chapter || !book) return <div>加载中...</div>;

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

  /** 打开旁白发音人编辑弹框 */
  const handleEditNarration = () => {
    setNarrationEditParaId(
      chapter?.paragraphs.find((p) => p.role === "narration")?.id ?? null,
    );
    // 回填：优先从角色模板取，其次取当前章节第一个已设置发音人的旁白段落
    const narrationTpl = bookTemplates.find((t) => t.characterName === "旁白");
    const narrationParaWithVoice = chapter?.paragraphs.find(
      (p) => p.role === "narration" && p.voiceId,
    );
    setNarrationVoiceId(
      narrationTpl?.voiceId ?? narrationParaWithVoice?.voiceId ?? undefined,
    );
    setNarrationEditOpen(true);
  };

  /** 保存旁白发音人（允许清空：不校验是否为空） */
  const handleSaveNarrationVoice = async () => {
    // 允许清空：voiceId 为空时保存空字符串，段落发音人清空为 undefined
    const finalVoiceId = narrationVoiceId ?? "";
    // 更新当前章节所有旁白段落的发音人
    for (const p of chapter.paragraphs.filter(
      (p: any) => p.role === "narration",
    )) {
      updateLocal(p.id, { voiceId: finalVoiceId || undefined });
    }
    // 同步到 templates（角色名="旁白"），与书籍详情页角色 tab 统一
    if (bookId) {
      try {
        await api.saveTemplate(bookId, "旁白", finalVoiceId);
        const tpls = await api.fetchTemplates(bookId);
        setBookTemplates(tpls);
        setBookRoles(tpls.map((t) => t.characterName));
      } catch {
        /* ignore */
      }
    }
    message.success("编辑成功");
    setNarrationEditOpen(false);
  };

  /** 打开编辑角色弹框（从段落旁的编辑图标触发） */
  const handleEditRole = (roleName: string) => {
    const tpl = bookTemplates.find((t) => t.characterName === roleName);
    setEditingRoleName(roleName);
    setEditRoleVoiceId(tpl?.voiceId);
    setRolePreviewUrl(undefined);
    setEditRoleOpen(true);
  };

  /** 保存编辑角色（同步到 templates，允许清空发音人） */
  const handleSaveEditRole = async () => {
    if (!bookId || !editingRoleName) {
      message.warning("请填写角色名");
      return;
    }
    try {
      // 清空时传空字符串，服务端保存后模板 voiceId 为空，段落不再套用该角色发音人
      await api.saveTemplate(bookId, editingRoleName, editRoleVoiceId ?? "");
      message.success("编辑成功");
      setEditRoleOpen(false);
      // 刷新 templates
      const tpls = await api.fetchTemplates(bookId);
      setBookTemplates(tpls);
      setBookRoles(tpls.map((t) => t.characterName));
    } catch (e) {
      message.error("编辑失败：" + api.extractError(e));
    }
  };

  /** 试听编辑角色弹框里的发音人 */
  const handlePreviewEditRole = async () => {
    if (!editRoleVoiceId || !book) return;
    setRolePreviewing(true);
    try {
      const resp = await api.http.post(
        `/providers/${book.providerConfig.provider}/preview`,
        {
          text: "夜幕降临，星光闪烁。他独自站在悬崖边，望着远方的城市灯火。",
          voiceId: editRoleVoiceId,
          format: "wav",
          sampleRate: 24000,
        },
      );
      if (resp.data.audioUrl) setRolePreviewUrl(resp.data.audioUrl);
      else if (resp.data.audioData)
        setRolePreviewUrl(`data:audio/wav;base64,${resp.data.audioData}`);
    } catch (e) {
      message.error("试听失败：" + api.extractError(e));
    } finally {
      setRolePreviewing(false);
    }
  };

  const handleAddParagraph = async (role: VxRole) => {
    try {
      await useStore
        .getState()
        .addParagraph(
          chapter.id,
          "",
          role,
          role === "character" ? "新角色" : undefined,
        );
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
        <Button size="small" onClick={() => message.info("导入文本开发中")}>
          导入文本
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => handleAddParagraph(VxRole.NARRATION)}
        >
          新增段落
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
          capabilities={capabilities}
          bookRoles={bookRoles}
          bookTemplates={bookTemplates}
          provider={book.providerConfig.provider}
          onUpdate={(patch) => updateLocal(p.id, patch)}
          onEditRole={handleEditRole}
          onEditNarration={handleEditNarration}
          onPreviewStateChange={handlePreviewStateChange}
        />
      ))}

      {/* 编辑角色弹框（从段落旁编辑图标触发） */}
      <Modal
        title={`编辑角色：${editingRoleName}`}
        open={editRoleOpen}
        onCancel={() => setEditRoleOpen(false)}
        onOk={handleSaveEditRole}
        okText="保存"
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>角色名</label>
            <Input value={editingRoleName} disabled />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>
              发音人（点试听后选择）
            </label>
            <VoicePicker
              value={editRoleVoiceId}
              onChange={setEditRoleVoiceId}
              voices={voices}
              bookProvider={book?.providerConfig.provider}
            />
          </div>
        </Space>
      </Modal>

      {/* 旁白编辑弹框（和角色编辑一样的交互） */}
      <Modal
        title="编辑角色：旁白"
        open={narrationEditOpen}
        onCancel={() => setNarrationEditOpen(false)}
        onOk={handleSaveNarrationVoice}
        okText="保存"
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>角色名</label>
            <Input value="旁白" disabled />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>
              发音人（点试听后选择）
            </label>
            <VoicePicker
              value={narrationVoiceId}
              onChange={setNarrationVoiceId}
              voices={voices}
              bookProvider={book?.providerConfig.provider}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}

/** 段落行：左右布局 */
function ParagraphRow({
  paragraph,
  index,
  voices,
  capabilities,
  bookRoles,
  bookTemplates,
  provider,
  onUpdate,
  onEditRole,
  onEditNarration,
  onPreviewStateChange,
}: {
  paragraph: any;
  index: number;
  voices: VxVoice[];
  capabilities?: VxProviderCapabilities;
  bookRoles: string[];
  bookTemplates: any[];
  provider: VxProvider;
  onUpdate: (patch: any) => void;
  onEditRole: (name: string) => void;
  onEditNarration: () => void;
  onPreviewStateChange: (
    paragraphId: string,
    state: { hasPreview: boolean; hasSelected: boolean },
  ) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  // 试听记录：每次试听生成一条，合成使用勾选的那一条
  const [previewList, setPreviewList] = useState<{ id: string; url: string; time: number }[]>([]);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isCharacter = paragraph.role === "character";

  // 切换页面/卸载时终止试听播放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // 向父级上报本段落的试听/勾选状态（用于控制一键合成可用性）
  useEffect(() => {
    onPreviewStateChange(paragraph.id, {
      hasPreview: previewList.length > 0,
      hasSelected: selectedPreviewId != null,
    });
  }, [onPreviewStateChange, paragraph.id, previewList, selectedPreviewId]);

  const playById = (id: string, url: string) => {
    // 正在播放当前音频则暂停
    if (playingId === id) {
      audioRef.current?.pause();
      return;
    }
    // 切到新音频前先停掉旧的
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audio.onpause = () => setPlayingId(null);
    audioRef.current = audio;
    audio.play().catch(() => message.warning("自动播放被浏览器阻止"));
    setPlayingId(id);
  };

  /** 停止当前试听播放 */
  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const updateVoiceParams = (patch: Partial<VxVoiceParams>) => {
    onUpdate({ voiceParams: { ...paragraph.voiceParams, ...patch } });
  };

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
      // 与发音人（AI 角色）试听同款逻辑：直调 /providers/:provider/preview，文本用当前段落内容
      const resp = await api.http.post(`/providers/${provider}/preview`, {
        text: paragraph.text,
        voiceId: paragraph.voiceId,
        format: "wav",
        sampleRate: 24000,
      });
      const audioUrl = resp.data.audioUrl
        ? api.normalizeAudioUrl(resp.data.audioUrl)
        : resp.data.audioData
          ? `data:audio/wav;base64,${resp.data.audioData}`
          : undefined;
      if (audioUrl) {
        // 每次试听生成一条记录，默认勾选最新一条用于合成
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

  /** 重新播放列表中的某条试听记录 */
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
      capabilities?.availableEmotions ??
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
        background: isCharacter ? "#f6f9ff" : "#f6fff8",
        borderLeft: `4px solid ${isCharacter ? "#1677ff" : "#52c41a"}`,
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
            value={
              paragraph.role === "character" ? paragraph.characterName : "旁白"
            }
            onChange={(v: string) => {
              // 切换角色立即停止当前试听播放
              stopPreview();
              if (v === "旁白") {
                onUpdate({ role: "narration", characterName: undefined });
              } else {
                const tpl = bookTemplates.find(
                  (t: any) => t.characterName === v,
                );
                onUpdate({
                  role: "character",
                  characterName: v,
                  voiceId: tpl?.voiceId,
                });
              }
            }}
            options={bookRoles.map((r) => ({ label: r, value: r }))}
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              if (paragraph.role === "character" && paragraph.characterName) {
                onEditRole(paragraph.characterName);
              } else {
                onEditNarration();
              }
            }}
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
                min={capabilities?.speedRange.min ?? 0.5}
                max={capabilities?.speedRange.max ?? 2}
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
                min={capabilities?.pitchRange.min ?? 0.5}
                max={capabilities?.pitchRange.max ?? 2}
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
          {capabilities?.supportsInstruction !== false && (
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
