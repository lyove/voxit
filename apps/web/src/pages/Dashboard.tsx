/**
 * 数据面板
 */
import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { BookOutlined, AudioOutlined } from '@ant-design/icons';
import { VxProvider } from '@voxit/core';
import * as api from '../api.js';

export default function Dashboard() {
  const [stats, setStats] = useState({ books: 0, voices: 0 });

  useEffect(() => {
    Promise.all([
      api.fetchProjects(),
      api.fetchVoices(VxProvider.ALIYUN).catch(() => []),
      api.fetchVoices(VxProvider.DOUBAO).catch(() => []),
    ]).then(([projects, aliyunVoices, doubaoVoices]) => {
      setStats({
        books: projects.length,
        voices: aliyunVoices.length + doubaoVoices.length,
      });
    });
  }, []);

  return (
    <div>
      <h2>数据面板</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card><Statistic title="书籍数量" value={stats.books} prefix={<BookOutlined />} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="AI发音人数量" value={stats.voices} prefix={<AudioOutlined />} /></Card>
        </Col>
      </Row>
    </div>
  );
}