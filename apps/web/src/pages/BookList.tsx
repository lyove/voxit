/**
 * 书籍列表页
 */
import { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Table, Tag, Form, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { VxProvider, type VxProject, type VxProviderConfig } from '@voxit/core';
import * as api from '../api.js';

export default function BookList() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<VxProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<VxProject | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setBooks(await api.fetchProjects());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = books.filter((b) => b.name.includes(search));

  /** 新增/编辑书籍提交 */
  const handleSubmit = async (values: { name: string; description?: string }) => {
    try {
      if (editingBook) {
        // 编辑：只改名称和备注
        await api.updateProject(editingBook.id, { name: values.name, description: values.description });
        message.success('已保存');
      } else {
        // 新增：凭证由服务器 .env 统一配置，前端不接触 Key
        const providerConfig: VxProviderConfig = {
          provider: VxProvider.ALIYUN,
          audioFormat: 'wav',
          sampleRate: 24000,
        };
        await api.createProject(values.name, providerConfig, values.description);
        message.success('书籍已创建');
      }
      setModalOpen(false);
      setEditingBook(null);
      form.resetFields();
      load();
    } catch (e) {
      message.error('操作失败：' + api.extractError(e));
    }
  };

  /** 打开新增弹窗 */
  const openAdd = () => {
    setEditingBook(null);
    form.resetFields();
    setModalOpen(true);
  };

  /** 打开编辑弹窗 */
  const openEdit = (book: VxProject) => {
    setEditingBook(book);
    form.setFieldsValue({ name: book.name, description: book.description });
    setModalOpen(true);
  };

  const columns = [
    { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    { title: '书籍名称', dataIndex: 'name', key: 'name' },
    { title: '备注', dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    {
      title: '状态', key: 'status',
      render: (_: any, r: VxProject) => {
        const syn = r.chapters.reduce((s, c) => s + c.paragraphs.filter((p) => p.status === 'done').length, 0);
        return <Tag color={syn > 0 ? 'green' : 'default'}>{syn > 0 ? `${syn} 段已合成` : '未合成'}</Tag>;
      },
    },
    {
      title: '创建时间', key: 'createdAt', render: (_: any, r: VxProject) =>
        new Date(r.createdAt).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作', key: 'action', width: 240,
      render: (_: any, r: VxProject) => (
        <Space>
          <Button size="small" type="link" onClick={() => navigate(`/books/${r.id}`)}>进入</Button>
          <Button size="small" type="link" onClick={() => navigate(`/books/${r.id}?tab=roles`)}>角色</Button>
          <Button size="small" type="link" onClick={() => openEdit(r)}>编辑</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>书籍目录</h2>
        <Space>
          <Input.Search placeholder="搜索书籍名称" allowClear style={{ width: 260 }} onChange={(e) => setSearch(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增书籍</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
      <Modal
        title={editingBook ? '编辑书籍' : '新增书籍'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingBook(null); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="书籍名称" rules={[{ required: true }]}>
            <Input placeholder="如：三体有声书" />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input.TextArea placeholder="书籍备注（可选）" autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}