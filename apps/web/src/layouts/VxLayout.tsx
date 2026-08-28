/**
 * VxLayout
 */
import React, { useState } from "react";
import { Button, Layout, Menu } from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  DashboardOutlined,
  BookOutlined,
  AudioOutlined,
  SettingOutlined,
} from "@ant-design/icons";

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "数据面板" },
  { key: "/books", icon: <BookOutlined />, label: "书籍目录" },
  { key: "/voices", icon: <AudioOutlined />, label: "AI角色" },
  { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
];

export default function VxLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);

  // 计算当前激活的菜单项（books/:id 也高亮 books）
  const activeKey = (() => {
    const path = location.pathname;
    if (path.startsWith("/books")) return "/books";
    if (path.startsWith("/dashboard")) return "/dashboard";
    if (path.startsWith("/voices")) return "/voices";
    if (path.startsWith("/settings")) return "/settings";
    return "/dashboard";
  })();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible width={220} trigger={null} collapsed={collapsed} style={{ background: "#fff" }}>
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 18,
            color: "#1677ff",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          🐯 Voxit 唯声
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px 0 0",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: "16px",
              width: 64,
              height: 64,
            }}
          />
          <span style={{ color: "#999", fontSize: 14 }}>
            AI有声书制作平台
          </span>
        </Header>
        <Content
          style={{
            margin: 16,
            padding: 24,
            background: "#fff",
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
