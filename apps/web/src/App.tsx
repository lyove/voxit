/**
 * Voxit 主应用组件
 * 两级导航：书籍列表首页 → 某书籍的章节+段落编辑页
 */
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Typography,
  Alert,
  message,
} from 'antd';
import { PlusOutlined, SettingOutlined, ArrowLeftOutlined, BookOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { VxProvider, type VxProject, type VxProviderCapabilities, type VxProviderConfig } from '@voxit/core';
import { useStore } from './store.js';
import { VxParagraphCard } from './components/VxParagraphCard.js';
import { VxVoicePanel } from './components/VxVoicePanel.js';
import { VxTemplatePanel } from './components/VxTemplatePanel.js';
import * as api from './api.js';

const { Title, Text } = Typography;

export default function App() {
  const { projects, currentProject, voices, loading, dirtyChapters, loadProjects, selectProject, addProject, editProject, removeProject, loadVoices, clearChapterDirty } =
    useStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<VxProject | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [view, setView] = useState<'books' | 'chapters'>('books'); // 两级导航
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<VxProviderCapabilities | undefined>(undefined);
  const [batchSynthesizing, setBatchSynthesizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ index: number; total: number; success: number; failed: number; skipped: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [renamingChapter, setRenamingChapter] = useState<{ id: string; oldName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importRole, setImportRole] = useState<'narration' | 'character'>('narration');
  const [importing, setImporting] = useState(false);
  const [longTextOpen, setLongTextOpen] = useState(false);
  const [longTextVoiceId, setLongTextVoiceId] = useState<string | undefined>(undefined);
  const [longTextProgress, setLongTextProgress] = useState<string | null>(null);
  const [longTextSynthesizing, setLongTextSynthesizing] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 切换项目时加载对应 Provider 的能力（前端表单动态渲染依据）
  useEffect(() => {
    if (!currentProject) {
      setCapabilities(undefined);
      return;
    }
    api.fetchCapabilities(currentProject.providerConfig.provider)
      .then(setCapabilities)
      .catch(() => setCapabilities(undefined));
  }, [currentProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 切换项目时重置章节选择；激活的章节不在当前项目时自动选首章
  useEffect(() => {
    if (!currentProject) {
      setActiveChapterId(null);
      return;
    }
    const exists = currentProject.chapters.some((c) => c.id === activeChapterId);
    if (!exists) {
      setActiveChapterId(currentProject.chapters.length ? currentProject.chapters[0].id : null);
    }
  }, [currentProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeChapter = currentProject?.chapters.find((c) => c.id === activeChapterId) ?? null;

  const handleCreateProject = async (values: {
    name: string;
    provider: VxProvider;
  }) => {
    const providerConfig: VxProviderConfig = {
      provider: values.provider,
      audioFormat: 'wav',
      sampleRate: 24000,
    };
    try {
      await addProject(values.name, providerConfig);
      setCreateOpen(false);
      form.resetFields();
      message.success('书籍已创建');
      setView('chapters'); // 新建后直接进入章节页
    } catch (e) {
      message.error('创建失败：' + (e as Error).message);
    }
  };

  /** 点击书籍：进入该书籍的章节页 */
  const handleOpenBook = async (id: string) => {
    await selectProject(id);
    setView('chapters');
  };

  /** 返回书籍列表 */
  const handleBackToBooks = () => {
    setView('books');
  };

  /** 打开编辑弹窗 */
  const handleEditBook = (book: VxProject) => {
    setEditingBook(book);
    setEditOpen(true);
  };

  /** 保存编辑 */
  const handleSaveEdit = async (values: {
    name: string;
    provider: VxProvider;
  }) => {
    if (!editingBook) return;
    try {
      await editProject(editingBook.id, {
        name: values.name,
        providerConfig: {
          ...editingBook.providerConfig,
          provider: values.provider,
        },
      });
      setEditOpen(false);
      setEditingBook(null);
      message.success('书籍已更新');
    } catch (e) {
      message.error('更新失败：' + api.extractError(e));
    }
  };

  /** 删除书籍 */
  const handleDeleteBook = async (id: string) => {
    try {
      await removeProject(id);
      message.success('书籍已删除');
      setView('books'); // 删除后返回书架，避免停留在空白章节页
    } catch (e) {
      message.error('删除失败：' + api.extractError(e));
    }
  };

  const handleLoadVoices = async () => {
    if (!currentProject) return;
    await loadVoices(currentProject.providerConfig.provider);
  };

  const handleAddChapter = () => {
    if (!currentProject) return;
    setNewChapterName(`第 ${currentProject.chapters.length + 1} 章`);
    setNewChapterOpen(true);
  };

  const handleConfirmAddChapter = async () => {
    if (!currentProject || !newChapterName.trim()) return;
    try {
      const newCh = await api.createChapter(currentProject.id, newChapterName.trim());
      await selectProject(currentProject.id);
      setActiveChapterId(newCh.id);
      setNewChapterOpen(false);
    } catch (e) {
      message.error('新增章节失败：' + api.extractError(e));
    }
  };

  /** 打开章节重命名弹框 */
  const handleStartRename = (chapterId: string, oldName: string) => {
    setRenamingChapter({ id: chapterId, oldName });
    setRenameValue(oldName);
  };

  /** 确认重命名 */
  const handleConfirmRename = async () => {
    if (!renamingChapter || !renameValue.trim()) return;
    try {
      await api.renameChapter(renamingChapter.id, renameValue.trim());
      await selectProject(currentProject!.id);
      setRenamingChapter(null);
    } catch (e) {
      message.error('重命名失败：' + api.extractError(e));
    }
  };

  /** 切换章节（当前章有改动时弹确认提示） */
  const handleSelectChapter = (chapterId: string) => {
    if (chapterId === activeChapterId) return;
    // 检查当前章是否有未保存改动
    if (activeChapterId && dirtyChapters.has(activeChapterId)) {
      Modal.confirm({
        title: '当前章节有未保存的改动',
        content: '切换章节将丢失未保存的修改（段落文本、发音人、参数等）。确定切换吗？',
        okText: '切换',
        cancelText: '取消',
        onOk: () => {
          if (activeChapterId) clearChapterDirty(activeChapterId);
          setActiveChapterId(chapterId);
        },
      });
    } else {
      setActiveChapterId(chapterId);
    }
  };

  /** 批量导入文本：按空行/换行拆分成段落 */
  const handleImportText = async () => {
    if (!activeChapter || !importText.trim()) return;
    setImporting(true);
    try {
      // 若文本含空行，按空行分段（每段可含多行）；否则按单换行分段
      const finalSegments = importText.includes('\n\n')
        ? importText.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0)
        : importText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);

      let count = 0;
      for (const seg of finalSegments) {
        await useStore.getState().addParagraph(activeChapter.id, seg, importRole as any, importRole === 'character' ? '新角色' : undefined);
        count++;
      }
      message.success(`已导入 ${count} 个段落`);
      setImportOpen(false);
      setImportText('');
    } catch (e) {
      message.error('导入失败：' + api.extractError(e));
    } finally {
      setImporting(false);
    }
  };

  /** 整章长文本合成（豆包，整章一次性合成） */
  const handleSynthesizeLong = async () => {
    if (!activeChapter || !longTextVoiceId) {
      message.warning('请先选择发音人');
      return;
    }
    setLongTextSynthesizing(true);
    setLongTextProgress('提交合成任务...');
    try {
      const audioUrl = await api.synthesizeLongStream(
        activeChapter.id,
        longTextVoiceId,
        (stage) => setLongTextProgress(stage),
      );
      if (audioUrl) {
        message.success('整章长文本合成完成');
        setLongTextOpen(false);
        // 在新窗口播放/下载
        window.open(audioUrl, '_blank');
      }
    } catch (e) {
      message.error('长文本合成失败：' + api.extractError(e));
    } finally {
      setLongTextSynthesizing(false);
      setLongTextProgress(null);
    }
  };

  const handleAddParagraph = async (role: 'narration' | 'character') => {
    if (!activeChapter) return;
    try {
      await useStore.getState().addParagraph(activeChapter.id, '', role as any, role === 'character' ? '新角色' : undefined);
    } catch (e) {
      message.error('新增段落失败：' + (e as Error).message);
    }
  };

  const handleSynthesizeAll = async () => {
    if (!activeChapter) return;
    setBatchSynthesizing(true);
    setBatchProgress({ index: 0, total: activeChapter.paragraphs.length, success: 0, failed: 0, skipped: 0 });
    try {
      await api.synthesizeAllStream(
        activeChapter.id,
        (e) => {
          setBatchProgress({ index: e.index, total: e.total, success: e.success, failed: e.failed, skipped: e.skipped });
          if (e.type === 'done' && e.result) {
            message.success(`批量合成完成：成功 ${e.result.success}，失败 ${e.result.failed}，跳过 ${e.result.skipped}`);
          }
        },
      );
      await selectProject(currentProject!.id); // 刷新段落状态
    } catch (e) {
      message.error('批量合成失败：' + api.extractError(e));
    } finally {
      setBatchSynthesizing(false);
      setBatchProgress(null);
    }
  };

  const handleExportChapter = async () => {
    if (!activeChapter) return;
    const doneCount = activeChapter.paragraphs.filter((p) => p.status === 'done').length;
    if (doneCount === 0) {
      message.warning('章节内没有已合成的段落，请先合成');
      return;
    }
    setExporting(true);
    setExportProgress('准备导出...');
    try {
      const fileName = await api.exportChapterStream(
        activeChapter.id,
        (e) => {
          if (e.stage === 'error') {
            message.error('导出失败：' + e.message);
          } else {
            setExportProgress(e.message);
          }
        },
      );
      if (fileName) {
        await api.downloadExport(fileName, `${activeChapter.title}.mp3`);
        message.success('整章音频已导出');
      }
    } catch (e) {
      message.error('导出失败：' + api.extractError(e));
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <Layout className="vx-app">
      <div className="vx-header">
        <div className="vx-logo">
          🐯 Voxit <span>唯声 - AI有声书制作平台</span>
        </div>
        <Space>
          {view === 'chapters' && currentProject && (
            <>
              <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
                发音人试听台
              </Button>
              <Button onClick={() => setTemplateOpen(true)}>角色模板</Button>
            </>
          )}
          {view === 'books' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建书籍
            </Button>
          )}
        </Space>
      </div>

      {view === 'books' ? (
        /* ===== 首页：书籍列表 ===== */
        <Card title="我的书架" size="small" loading={loading}>
          {projects.length === 0 && <Text type="secondary">书架空空如也，点击右上角「新建书籍」开始制作</Text>}
          <Row gutter={[16, 16]}>
            {projects.map((p) => (
              <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  size="small"
                  onClick={() => handleOpenBook(p.id)}
                  style={{ height: '100%' }}
                  actions={[
                    <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); handleEditBook(p); }} />,
                    <Popconfirm
                      key="delete"
                      title="确定删除该书籍？"
                      description="将级联删除所有章节、段落和角色模板，不可恢复。"
                      onConfirm={(e) => { e?.stopPropagation(); handleDeleteBook(p.id); }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    avatar={<BookOutlined style={{ fontSize: 28, color: '#1677ff' }} />}
                    title={p.name}
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{p.chapters.length} 章</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {p.providerConfig.provider === 'aliyun' ? '阿里云百炼' : '火山引擎豆包'}
                        </Text>
                      </Space>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      ) : (
        /* ===== 章节页：某书籍的章节列表 + 段落编辑 ===== */
        <>
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={handleBackToBooks}>返回书架</Button>
              <Text strong style={{ fontSize: 16 }}>{currentProject?.name}</Text>
            </Space>
          </div>
          <Row gutter={16}>
            {/* 左侧：章节列表 */}
            <Col span={6}>
              <Card
                title="章节"
                size="small"
                extra={<Button size="small" onClick={handleAddChapter}>+ 新章</Button>}
              >
                {currentProject && currentProject.chapters.length === 0 && (
                  <Text type="secondary">暂无章节，点击右上角新增</Text>
                )}
                {currentProject?.chapters.map((ch, i) => (
                  <div
                    key={ch.id}
                    onClick={() => handleSelectChapter(ch.id)}
                    onDoubleClick={() => handleStartRename(ch.id, ch.title)}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      borderRadius: 6,
                      background: activeChapterId === ch.id ? '#e6f4ff' : 'transparent',
                      marginBottom: 2,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{i + 1}. {ch.title} <Text type="secondary" style={{ fontSize: 12 }}>({ch.paragraphs.length})</Text></span>
                    <EditOutlined
                      style={{ fontSize: 12, color: '#999', opacity: 0.5 }}
                      onClick={(e) => { e.stopPropagation(); handleStartRename(ch.id, ch.title); }}
                    />
                  </div>
                ))}
              </Card>
            </Col>

            {/* 右侧：段落编辑区 */}
            <Col span={18}>
              {activeChapter ? (
                <Card
                  title={
                    <Space>
                      <span>{activeChapter.title} · 段落编辑</span>
                      {activeChapterId && dirtyChapters.has(activeChapterId) && (
                        <Text type="warning" style={{ fontSize: 12 }}>● 有改动</Text>
                      )}
                    </Space>
                  }
                  size="small"
                  extra={
                    <Space>
                      <Button size="small" onClick={() => setImportOpen(true)}>导入文本</Button>
                      <Button size="small" onClick={() => handleAddParagraph('narration')}>+ 旁白段</Button>
                      <Button size="small" onClick={() => handleAddParagraph('character')}>+ 角色段</Button>
                      <Button size="small" onClick={handleLoadVoices}>加载发音人</Button>
                      <Button size="small" loading={batchSynthesizing} onClick={handleSynthesizeAll}>一键合成</Button>
                      {currentProject?.providerConfig.provider === 'doubao' && (
                        <Button size="small" onClick={() => { setLongTextVoiceId(undefined); setLongTextOpen(true); }}>整章长文本</Button>
                      )}
                      <Button size="small" loading={exporting} onClick={handleExportChapter}>导出整章</Button>
                      {exportProgress && <Text type="secondary" style={{ fontSize: 12 }}>{exportProgress}</Text>}
                    </Space>
                  }
                >
                  {batchProgress && (
                    <div style={{ marginBottom: 12 }}>
                      <Progress
                        percent={batchProgress.total ? Math.round((batchProgress.index / batchProgress.total) * 100) : 0}
                        status={batchSynthesizing ? 'active' : 'normal'}
                        format={() => `${batchProgress.index}/${batchProgress.total} · 成功${batchProgress.success} 失败${batchProgress.failed} 跳过${batchProgress.skipped}`}
                      />
                    </div>
                  )}
                  {activeChapter.paragraphs.length === 0 && (
                    <Text type="secondary">暂无段落，点击右上角添加旁白段或角色段</Text>
                  )}
                  {activeChapter.paragraphs.map((p, i) => (
                    <VxParagraphCard key={p.id} paragraph={p} voices={voices} index={i} capabilities={capabilities} />
                  ))}
                </Card>
              ) : (
                <Card>
                  <Text type="secondary">请选择或创建一个章节开始制作</Text>
                </Card>
              )}
            </Col>
          </Row>
        </>
      )}

      {/* 新建书籍弹窗 */}
      <Modal
        title="新建有声书"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateProject}>
          <Form.Item name="name" label="书籍名称" rules={[{ required: true }]}>
            <Input placeholder="如：三体有声书" />
          </Form.Item>
          <Form.Item name="provider" label="AI 供应商" initialValue={VxProvider.ALIYUN} rules={[{ required: true }]}>
            <Select
              options={[
                { label: '阿里云百炼（CosyVoice/Qwen-TTS）', value: VxProvider.ALIYUN },
                { label: '火山引擎豆包（Seed-TTS）', value: VxProvider.DOUBAO },
              ]}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="凭证由服务器 .env 统一配置"
            description="AI 大模型的 API Key 在服务器端配置，此处无需填写。"
          />
        </Form>
      </Modal>

      {/* 编辑书籍弹窗 */}
      <Modal
        title="编辑书籍"
        open={editOpen}
        onCancel={() => { setEditOpen(false); setEditingBook(null); }}
        onOk={() => {
          // 复用 form 提交，但编辑用单独的 form 实例需动态设置
          const formEl = document.getElementById('vx-edit-form') as HTMLFormElement | null;
          formEl?.requestSubmit();
        }}
        destroyOnHidden
      >
        {editingBook && (
          <EditBookForm
            book={editingBook}
            onSubmit={handleSaveEdit}
          />
        )}
      </Modal>

      {/* 新增章节弹窗 */}
      <Modal
        title="新增章节"
        open={newChapterOpen}
        onCancel={() => setNewChapterOpen(false)}
        onOk={handleConfirmAddChapter}
      >
        <Input
          placeholder="输入章节名称，如：第一章 风起"
          value={newChapterName}
          onChange={(e) => setNewChapterName(e.target.value)}
          onPressEnter={handleConfirmAddChapter}
          autoFocus
        />
      </Modal>

      {/* 章节重命名弹窗 */}
      <Modal
        title="重命名章节"
        open={!!renamingChapter}
        onCancel={() => setRenamingChapter(null)}
        onOk={handleConfirmRename}
      >
        <Input
          placeholder="输入新的章节名称"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleConfirmRename}
          autoFocus
        />
      </Modal>

      {/* 导入文本弹窗 */}
      <Modal
        title="批量导入段落文本"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={handleImportText}
        okText="导入"
        confirmLoading={importing}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              粘贴整章文本，将自动拆分为段落。含空行的按空行分段，无空行的按换行分段。
            </Text>
          </div>
          <div>
            <Text style={{ marginRight: 8 }}>默认角色：</Text>
            <Select
              size="small"
              value={importRole}
              onChange={(v) => setImportRole(v)}
              style={{ width: 120 }}
              options={[
                { label: '旁白', value: 'narration' },
                { label: '角色', value: 'character' },
              ]}
            />
          </div>
          <Input.TextArea
            placeholder="粘贴整章文本内容..."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            autoSize={{ minRows: 8, maxRows: 20 }}
          />
        </Space>
      </Modal>

      {/* 整章长文本合成弹窗（仅豆包） */}
      <Modal
        title="整章长文本合成"
        open={longTextOpen}
        onCancel={() => setLongTextOpen(false)}
        onOk={handleSynthesizeLong}
        okText="开始合成"
        confirmLoading={longTextSynthesizing}
        okButtonProps={{ disabled: !longTextVoiceId }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="整章文本一次性合成（豆包异步长文本）"
            description="将本章所有段落文本拼接后一次性提交豆包合成，省调用次数。合成耗时较长，请耐心等待。"
          />
          <div>
            <Text style={{ marginRight: 8 }}>选择发音人：</Text>
            <Select
              placeholder="选择发音人"
              value={longTextVoiceId}
              onChange={setLongTextVoiceId}
              style={{ minWidth: 240 }}
              showSearch
              optionFilterProp="label"
              onDropdownVisibleChange={(open) => { if (open && voices.length === 0) handleLoadVoices(); }}
              options={voices.map((v) => ({
                label: `${v.name}（${v.gender === 'male' ? '男' : v.gender === 'female' ? '女' : '中'}）`,
                value: v.id,
              }))}
            />
          </div>
          {longTextProgress && (
            <Text type="secondary" style={{ fontSize: 12 }}>{longTextProgress}</Text>
          )}
        </Space>
      </Modal>

      {/* 发音人试听台抽屉 */}
      <Drawer
        title="发音人试听台"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={520}
      >
        {currentProject ? (
          <VxVoicePanel provider={currentProject.providerConfig.provider} />
        ) : (
          <Text type="secondary">请先选择一本书籍</Text>
        )}
      </Drawer>

      {/* 角色模板抽屉 */}
      <Drawer
        title="角色发音人模板"
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        width={520}
      >
        {currentProject ? (
          <VxTemplatePanel
            projectId={currentProject.id}
            voices={voices}
            onRefreshVoices={handleLoadVoices}
          />
        ) : (
          <Text type="secondary">请先选择一本书籍</Text>
        )}
      </Drawer>
    </Layout>
  );
}

/** 编辑书籍表单（预填值 + 供应商切换警告） */
function EditBookForm({ book, onSubmit }: { book: VxProject; onSubmit: (v: { name: string; provider: VxProvider; apiKey: string; workspaceId: string }) => void }) {
  const [form] = Form.useForm();
  const [provider, setProvider] = useState<VxProvider>(book.providerConfig.provider);
  const isDoubao = provider === VxProvider.DOUBAO;
  const originalProvider = book.providerConfig.provider;
  const hasChapters = book.chapters.length > 0;
  const providerChanged = provider !== originalProvider;

  return (
    <Form
      id="vx-edit-form"
      form={form}
      layout="vertical"
      initialValues={{
        name: book.name,
        provider: book.providerConfig.provider,
      }}
      onFinish={onSubmit}
    >
      <Form.Item name="name" label="书籍名称" rules={[{ required: true }]}>
        <Input placeholder="如：三体有声书" />
      </Form.Item>
      <Form.Item name="provider" label="AI 供应商" rules={[{ required: true }]}>
        <Select
          onChange={(v: VxProvider) => setProvider(v)}
          options={[
            { label: '阿里云百炼（CosyVoice/Qwen-TTS）', value: VxProvider.ALIYUN },
            { label: '火山引擎豆包（Seed-TTS）', value: VxProvider.DOUBAO },
          ]}
        />
      </Form.Item>

      {providerChanged && hasChapters && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="切换 AI 供应商将带来以下影响"
          description="已选发音人需重新选择（两家发音人 ID 不兼容）；已合成段落的音频将失效（URL 24h 过期），需重新合成。段落文本会保留。"
        />
      )}

      <Alert
        type="info"
        showIcon
        message="凭证由服务器 .env 统一配置，此处无需填写。"
      />
    </Form>
  );
}