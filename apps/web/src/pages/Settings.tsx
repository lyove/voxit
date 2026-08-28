/**
 * 系统设置页
 */
import { useEffect, useState } from 'react';
import { Card, Table, Tag, Alert, Typography, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { VxProvider } from '@voxit/core';
import * as api from '../api.js';

const { Text, Paragraph } = Typography;

interface ProviderStatus {
  provider: VxProvider;
  label: string;
  configured: boolean;
  voiceCount: number;
  error?: string;
}

export default function Settings() {
  const [status, setStatus] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const entries: ProviderStatus[] = await Promise.all([
        checkProvider(VxProvider.ALIYUN, '阿里云百炼'),
        checkProvider(VxProvider.DOUBAO, '火山引擎豆包'),
      ]);
      setStatus(entries);
    } finally {
      setLoading(false);
    }
  };

  const checkProvider = async (provider: VxProvider, label: string): Promise<ProviderStatus> => {
    try {
      const voices = await api.fetchVoices(provider);
      return { provider, label, configured: true, voiceCount: voices.length };
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      return { provider, label, configured: false, voiceCount: 0, error: err?.response?.data?.error };
    }
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { title: '供应商', dataIndex: 'label', key: 'label' },
    {
      title: '服务器凭证', key: 'configured',
      render: (_: any, r: ProviderStatus) => (
        <Tag color={r.configured ? 'green' : 'red'}>{r.configured ? '已配置' : '未配置'}</Tag>
      ),
    },
    {
      title: '发音人', key: 'voices',
      render: (_: any, r: ProviderStatus) => (r.configured ? `${r.voiceCount} 个` : '-'),
    },
    {
      title: '说明', key: 'error',
      render: (_: any, r: ProviderStatus) => (
        <Text type={r.configured ? 'secondary' : 'danger'} style={{ fontSize: 12 }}>
          {r.configured ? '正常' : r.error ?? '未配置'}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <h2>系统设置</h2>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="AI 大模型凭证已迁移到服务器"
        description={
          <span>
            API Key / Token 不再保存在浏览器，统一在服务器{' '}
            <Text code>apps/server/.env</Text> 中配置（
            <Text code>ALIYUN_API_KEY</Text>、<Text code>ALIYUN_WORKSPACE_ID</Text>、
            <Text code>DOUBAO_APP_ID</Text>、<Text code>DOUBAO_TOKEN</Text>）。配置后需重启后端生效。
          </span>
        }
      />

      <Card
        title="供应商状态"
        extra={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>}
      >
        <Table rowKey="provider" columns={columns} dataSource={status} pagination={false} loading={loading} />
      </Card>

      <Card title="管理员账号" size="small" style={{ marginTop: 16 }}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          登录账号密码在服务器 <Text code>apps/server/.env</Text> 中配置（
          <Text code>ADMIN_USER</Text> / <Text code>ADMIN_PASS</Text>），修改后需重启后端生效。
        </Paragraph>
      </Card>
    </div>
  );
}
