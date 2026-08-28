/**
 * 书籍详情页
 */
import { useEffect, useRef, useState } from 'react';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  DownOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { VxChapter, VxProject, VxVoiceTemplate } from '@voxit/core';
import * as api from '../api.js';
import { VoicePicker } from '../components/VoicePicker.js';

function chapterStatus(ch: VxChapter): { label: string; color: string } {
  if (ch.paragraphs.length === 0) return { label: '初始化', color: 'default' };
  const allDone = ch.paragraphs.every((p) => p.status === 'done');
  if (allDone) return { label: '已合成', color: 'green' };
  const anyConfigured = ch.paragraphs.some((p) => p.voiceId || p.voiceParams);
  return { label: anyConfigured ? '编辑中' : '初始化', color: anyConfigured ? 'blue' : 'default' };
}

function measureTextWidth(text: string): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 14;
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  return Math.ceil(ctx.measureText(text).width);
}

export default function BookDetail() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<VxProject | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'roles' ? 'roles' : 'chapters');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<VxVoiceTemplate[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addChapterOpen, setAddChapterOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [renamingChapter, setRenamingChapter] = useState<{ id: string; oldName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameWidth, setRenameWidth] = useState(0);
  const [editingRole, setEditingRole] = useState<VxVoiceTemplate | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [roleForm] = Form.useForm();
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 切换页面/卸载时终止试听播放
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  /** 试听某个发音人（凭证由服务器 .env 提供） */
  const handlePreviewVoice = async (voiceId: string) => {
    // 正在播放当前音频则暂停
    if (playingVoiceId === voiceId) {
      audioRef.current?.pause();
      return;
    }
    // 切到新音频前先停掉旧的
    audioRef.current?.pause();

    setPreviewingVoiceId(voiceId);
    try {
      const provider = book?.providerConfig.provider;
      if (!provider) { message.warning('请先选择书籍'); return; }
      const resp = await api.http.post(`/providers/${provider}/preview`, {
        text: '夜幕降临，星光闪烁。他独自站在悬崖边，望着远方的城市灯火。',
        voiceId, format: 'wav', sampleRate: 24000,
      });
      const url = resp.data.audioUrl
        ? api.normalizeAudioUrl(resp.data.audioUrl)
        : resp.data.audioData
          ? `data:audio/wav;base64,${resp.data.audioData}`
          : undefined;
      if (url) {
        const audio = new Audio(url);
        audio.onended = () => setPlayingVoiceId(null);
        audio.onpause = () => setPlayingVoiceId(null);
        audioRef.current = audio;
        await audio.play();
        setPlayingVoiceId(voiceId);
      }
    } catch (e) {
      message.error('试听失败：' + api.extractError(e));
    } finally {
      setPreviewingVoiceId(null);
    }
  };

  const load = async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const proj = await api.fetchProject(bookId);
      setBook(proj);
      setTemplates(await api.fetchTemplates(bookId));
      // 加载发音人（凭证由服务器 .env 提供）
      try { setVoices(await api.fetchVoices(proj.providerConfig.provider)); } catch { /* 未配置凭证则空 */ }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [bookId]);

  const handleAddChapter = () => {
    if (!book) return;
    setNewChapterName(`第 ${book.chapters.length + 1} 章`);
    setAddChapterOpen(true);
  };

  const handleConfirmAddChapter = async () => {
    if (!book || !newChapterName.trim()) return;
    try {
      await api.createChapter(book.id, newChapterName.trim());
      setAddChapterOpen(false);
      load();
    } catch (e) {
      message.error('新增章节失败：' + api.extractError(e));
    }
  };

  /** 双击章节名称编辑 */
  const handleStartRenameChapter = (id: string, oldName: string) => {
    setRenamingChapter({ id, oldName });
    setRenameValue(oldName);
    setRenameWidth(measureTextWidth(oldName));
  };

  const handleConfirmRenameChapter = async () => {
    if (!renamingChapter || !renameValue.trim()) return;
    try {
      await api.renameChapter(renamingChapter.id, renameValue.trim());
      setRenamingChapter(null);
      load();
    } catch (e) {
      message.error('重命名失败：' + api.extractError(e));
    }
  };

  /** 失焦保存；输入为空则直接退出编辑 */
  const handleRenameBlur = () => {
    if (!renamingChapter) return;
    if (!renameValue.trim()) {
      setRenamingChapter(null);
      return;
    }
    handleConfirmRenameChapter();
  };

  /** 新增/编辑角色（保存为角色模板，upsert；发音人允许清空） */
  const handleAddRole = async (values: { characterName: string; voiceId?: string }) => {
    if (!bookId) return;
    try {
      await api.saveTemplate(bookId, values.characterName, values.voiceId ?? "");
      message.success(editingRole ? '角色已更新' : '角色已添加');
      setAddRoleOpen(false);
      setEditingRole(null);
      roleForm.resetFields();
      setTemplates(await api.fetchTemplates(bookId));
    } catch (e) {
      message.error(editingRole ? '更新失败：' + api.extractError(e) : '添加失败：' + api.extractError(e));
    }
  };

  /** 批量删除角色 */
  const handleBatchDeleteRoles = async () => {
    if (selectedRoleIds.length === 0) { message.warning('请先勾选要删除的角色'); return; }
    Modal.confirm({
      title: `确认删除 ${selectedRoleIds.length} 个角色？`,
      content: '删除后，已套用该角色的段落发音人配置不受影响，但新建段落将无法自动套用。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await Promise.all(selectedRoleIds.map((id) => api.deleteTemplate(id)));
          message.success('已删除');
          setSelectedRoleIds([]);
          setTemplates(await api.fetchTemplates(bookId!));
        } catch (e) {
          message.error('删除失败：' + api.extractError(e));
        }
      },
    });
  };

  const chapterColumns = [
    { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    {
      title: '章节名称', dataIndex: 'title', key: 'title',
      render: (title: string, r: VxChapter) =>
        renamingChapter?.id === r.id ? (
          <Input
            size="small"
            value={renameValue}
            autoFocus
            onChange={(e) => {
              setRenameValue(e.target.value);
              setRenameWidth(measureTextWidth(e.target.value));
            }}
            onPressEnter={handleConfirmRenameChapter}
            onBlur={handleRenameBlur}
            style={{ width: renameWidth + 24 }}
          />
        ) : (
          <span onDoubleClick={() => handleStartRenameChapter(r.id, title)} style={{ cursor: 'pointer' }}>
            {title}
          </span>
        ),
    },
    {
      title: '章节字数', key: 'wordCount',
      render: (_: any, r: VxChapter) => r.paragraphs.reduce((s, p) => s + p.text.length, 0),
    },
    {
      title: '状态', key: 'status',
      render: (_: any, r: VxChapter) => {
        const st = chapterStatus(r);
        return <Tag color={st.color}>{st.label}</Tag>;
      },
    },
    {
      title: '编辑时间', key: 'updatedAt',
      render: (_: any, r: VxChapter) => new Date(r.updatedAt).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: '操作', key: 'action', width: 240,
      render: (_: any, r: VxChapter) => (
        <Space>
          <Button size="small" type="link" onClick={() => navigate(`/books/${bookId}/chapters/${r.id}`)}>进入</Button>
          <Button size="small" type="link" onClick={() => message.info('导出画本功能开发中')}>导出画本</Button>
          <Button size="small" type="link" onClick={() => message.info('导出成品功能开发中')}>导出成品</Button>
        </Space>
      ),
    },
  ];

  const batchMenu = {
    items: [
      { key: 'export-script', label: '批量导出画本', onClick: () => message.info('开发中') },
      { key: 'export-audio', label: '批量导出成品', onClick: () => message.info('开发中') },
    ],
  };

  /** 角色列表：默认始终显示"旁白"角色（可编辑、不可删除） */
  const roleRows: VxVoiceTemplate[] = (() => {
    const rows = [...templates];
    if (!rows.some((t) => t.characterName === '旁白')) {
      rows.unshift({ id: '__narration__', projectId: bookId ?? '', characterName: '旁白', voiceId: '', voiceParams: undefined, createdAt: 0, updatedAt: 0 });
    }
    return rows;
  })();

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/books')} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>{book?.name}</span>
        </Space>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarExtraContent={
          activeTab === 'chapters' ? (
            <Space>
              <Dropdown menu={batchMenu}>
                <Button>批量操作 <DownOutlined /></Button>
              </Dropdown>
              <Button onClick={() => message.info('画本导入开发中')}>画本导入</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddChapter}>新建章节</Button>
            </Space>
          ) : (
            <Space>
              <Button onClick={handleBatchDeleteRoles} disabled={selectedRoleIds.length === 0}>批量删除</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { roleForm.resetFields(); setEditingRole(null); setAddRoleOpen(true); }}>新增角色</Button>
            </Space>
          )
        }
        items={[
          {
            key: 'chapters',
            label: '章节',
            children: (
              <Table
                rowKey="id"
                columns={chapterColumns}
                dataSource={book?.chapters ?? []}
                loading={loading}
                pagination={false}
                rowSelection={{ type: 'checkbox' }}
              />
            ),
          },
          {
            key: 'roles',
            label: '角色',
            children: (
              <Table
                rowKey="id"
                pagination={false}
                dataSource={roleRows}
                rowSelection={{
                  selectedRowKeys: selectedRoleIds,
                  onChange: (keys) => setSelectedRoleIds(keys as string[]),
                  getCheckboxProps: (r: VxVoiceTemplate) => ({ disabled: r.characterName === '旁白' }),
                }}
                columns={[
                  { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
                  { title: '角色名', dataIndex: 'characterName', key: 'characterName' },
                  {
                    title: '发音人', key: 'voice',
                    render: (_: any, r: VxVoiceTemplate) => {
                      const v = voices.find((vv) => vv.id === r.voiceId);
                      return v ? v.name : (r.voiceId || '未设置');
                    },
                  },
                  {
                    title: '操作', key: 'action',
                    render: (_: any, r: VxVoiceTemplate) => (
                      <Space>
                        <Button size="small" type="link"
                          onClick={() => {
                            setEditingRole(r);
                            roleForm.setFieldsValue({ characterName: r.characterName, voiceId: r.voiceId });
                            setAddRoleOpen(true);
                          }}>编辑</Button>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />}
                          disabled={r.characterName === '旁白'}
                          title={r.characterName === '旁白' ? '旁白角色不可删除' : undefined}
                          onClick={() => {
                            Modal.confirm({
                              title: `删除角色"${r.characterName}"？`,
                              okText: '删除', okType: 'danger', cancelText: '取消',
                              onOk: async () => {
                                await api.deleteTemplate(r.id);
                                message.success('已删除');
                                setTemplates(await api.fetchTemplates(bookId!));
                              },
                            });
                          }}>删除</Button>
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={addRoleOpen}
        onCancel={() => { setAddRoleOpen(false); setEditingRole(null); }}
        onOk={() => roleForm.submit()}
        destroyOnHidden
      >
        <Form form={roleForm} layout="vertical" onFinish={handleAddRole}>
          <Form.Item name="characterName" label="角色名" rules={[{ required: true }]}>
            <Input placeholder="如：林黛玉" />
          </Form.Item>
          <Form.Item name="voiceId" label="发音人（可清空，点试听后选择）">
            <VoicePicker voices={voices} bookProvider={book?.providerConfig.provider} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增章节弹框 */}
      <Modal
        title="新增章节"
        open={addChapterOpen}
        onCancel={() => setAddChapterOpen(false)}
        onOk={handleConfirmAddChapter}
      >
        <Input
          placeholder="输入章节名称"
          value={newChapterName}
          onChange={(e) => setNewChapterName(e.target.value)}
          onPressEnter={handleConfirmAddChapter}
          autoFocus
        />
      </Modal>

    </div>
  );
}