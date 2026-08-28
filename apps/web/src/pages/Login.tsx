/**
 * 登录页
 */
import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login } from '../auth.js';

const { Title, Text } = Typography;

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      message.error(err?.response?.data?.error ?? err?.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f5ff 100%)',
    }}>
      <Card style={{ width: 380, boxShadow: '0 6px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🐯</div>
          <Title level={3} style={{ marginBottom: 4 }}>Voxit · 唯声</Title>
          <Text type="secondary">AI 有声书制作台 · 请登录</Text>
        </div>
        <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="admin" size="large" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            登录
          </Button>
        </Form>
        <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
          账号密码在服务器 apps/server/.env 中配置（ADMIN_USER / ADMIN_PASS）
        </Text>
      </Card>
    </div>
  );
}
