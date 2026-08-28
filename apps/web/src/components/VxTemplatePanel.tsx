/**
 * 角色发音人模板管理面板
 * 项目级"角色名 → 发音人+参数"映射，新增段落选角色名时自动套用
 */
import { useEffect, useState } from 'react';
import { Button, Empty, Input, List, Popconfirm, Select, Space, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { VxVoice, VxVoiceTemplate } from '@voxit/core';
import * as api from '../api.js';

interface Props {
  projectId: string;
  voices: VxVoice[];
  onRefreshVoices: () => void;
}

export function VxTemplatePanel({ projectId, voices, onRefreshVoices }: Props) {
  const [templates, setTemplates] = useState<VxVoiceTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVoiceId, setNewVoiceId] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await api.fetchTemplates(projectId));
    } catch (e) {
      message.error('加载模板失败：' + api.extractError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  const handleAdd = async () => {
    if (!newName.trim() || !newVoiceId) {
      message.warning('请填写角色名并选择发音人');
      return;
    }
    try {
      await api.saveTemplate(projectId, newName.trim(), newVoiceId);
      message.success('模板已保存');
      setNewName('');
      setNewVoiceId(undefined);
      load();
    } catch (e) {
      message.error('保存失败：' + api.extractError(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTemplate(id);
      message.success('已删除');
      load();
    } catch (e) {
      message.error('删除失败：' + api.extractError(e));
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 12, width: '100%' }} wrap>
        <Input
          placeholder="角色名（如：林黛玉）"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ width: 140 }}
        />
        <Select
          placeholder="选择发音人"
          value={newVoiceId}
          onChange={setNewVoiceId}
          style={{ minWidth: 180 }}
          showSearch
          optionFilterProp="label"
          onDropdownVisibleChange={(open) => { if (open && voices.length === 0) onRefreshVoices(); }}
          options={voices.map((v) => ({
            label: `${v.name}（${v.gender === 'male' ? '男' : v.gender === 'female' ? '女' : '中'}）`,
            value: v.id,
          }))}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加模板</Button>
      </Space>

      <List
        loading={loading}
        size="small"
        locale={{ emptyText: <Empty description="暂无角色模板" /> }}
        dataSource={templates}
        renderItem={(t) => {
          const voice = voices.find((v) => v.id === t.voiceId);
          return (
            <List.Item
              actions={[
                <Popconfirm key="del" title="确定删除该模板？" onConfirm={() => handleDelete(t.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <Space>
                <strong>{t.characterName}</strong>
                <span style={{ color: '#999' }}>→</span>
                <span>{voice?.name ?? t.voiceId}</span>
              </Space>
            </List.Item>
          );
        }}
      />
      <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
        提示：新增段落选填同名角色时，将自动套用对应发音人。
      </div>
    </div>
  );
}