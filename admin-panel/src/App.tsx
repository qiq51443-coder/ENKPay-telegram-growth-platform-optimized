import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Avatar } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  RobotOutlined,
  GiftOutlined,
  SoundOutlined,
  TeamOutlined,
  AuditOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  TrophyOutlined,
  LineChartOutlined,
  HeartOutlined,
  WalletOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { UserDetail } from './pages/UserDetail';
import { Bots } from './pages/Bots';
import { RedPackets } from './pages/RedPackets';
import { Broadcasts } from './pages/Broadcasts';
import { Withdrawals } from './pages/Withdrawals';
import { AdminUserManager } from './pages/AdminUserManager';
import { AuditLogs } from './pages/AuditLogs';
import { SystemSettings } from './pages/SystemSettings';
import { NFTCategories } from './pages/NFTCategories';
import { NFTProducts } from './pages/NFTProducts';
import { Auctions } from './pages/Auctions';
import { TradingPairs } from './pages/TradingPairs';
import { CustomPriceControl } from './pages/CustomPriceControl';
import { CharityProjects } from './pages/CharityProjects';
import { WalletNetworks } from './pages/WalletNetworks';
import { DepositRecords } from './pages/DepositRecords';
import { TransferRecords } from './pages/TransferRecords';
import { TradingRules } from './pages/TradingRules';
import { TradingSessions } from './pages/TradingSessions';
import { Orders } from './pages/Orders';

const { Header, Sider, Content } = Layout;

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

const ProtectedLayout: React.FC<ProtectedLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState('dashboard');

  useEffect(() => {
    const path = location.pathname.split('/')[1] || 'dashboard';
    setSelectedKey(path);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">仪表盘</Link>,
    },
    {
      key: 'analytics',
      icon: <BarChartOutlined />,
      label: <Link to="/analytics">数据分析</Link>,
    },
    {
      key: 'nft',
      icon: <AppstoreOutlined />,
      label: 'NFT 管理',
      children: [
        {
          key: 'nft-categories',
          label: <Link to="/nft-categories">NFT 分类</Link>,
        },
        {
          key: 'nft-products',
          label: <Link to="/nft-products">NFT 产品</Link>,
        },
      ],
    },
    {
      key: 'auctions',
      icon: <TrophyOutlined />,
      label: <Link to="/auctions">竞拍管理</Link>,
    },
    {
      key: 'trading',
      icon: <LineChartOutlined />,
      label: '交易管理',
      children: [
        {
          key: 'trading-pairs',
          label: <Link to="/trading-pairs">交易币种</Link>,
        },
        {
          key: 'custom-price',
          label: <Link to="/custom-price">自定义走势</Link>,
        },
        {
          key: 'trading-rules',
          label: <Link to="/trading-rules">交易规则</Link>,
        },
        {
          key: 'trading-sessions',
          label: <Link to="/trading-sessions">交易结算</Link>,
        },
      ],
    },
    {
      key: 'charity',
      icon: <HeartOutlined />,
      label: <Link to="/charity">公益管理</Link>,
    },
    {
      key: 'wallet',
      icon: <WalletOutlined />,
      label: '钱包管理',
      children: [
        {
          key: 'wallet-networks',
          label: <Link to="/wallet-networks">充值网络</Link>,
        },
        {
          key: 'deposit-records',
          label: <Link to="/deposit-records">充值记录</Link>,
        },
        {
          key: 'withdrawals',
          label: <Link to="/withdrawals">提现审核</Link>,
        },
        {
          key: 'transfer-records',
          label: <Link to="/transfer-records">转账记录</Link>,
        },
      ],
    },
    {
      key: 'bots',
      icon: <RobotOutlined />,
      label: <Link to="/bots">Bot 管理</Link>,
    },
    {
      key: 'orders',
      icon: <ClockCircleOutlined />,
      label: <Link to="/orders">订单管理</Link>,
    },
    {
      key: 'users',
      icon: <UserOutlined />,
      label: <Link to="/users">用户列表</Link>,
    },
    {
      key: 'red-packets',
      icon: <GiftOutlined />,
      label: <Link to="/red-packets">红包管理</Link>,
    },
    {
      key: 'broadcasts',
      icon: <SoundOutlined />,
      label: <Link to="/broadcasts">广播管理</Link>,
    },
    {
      key: 'admin-users',
      icon: <TeamOutlined />,
      label: <Link to="/admin-users">管理员</Link>,
    },
    {
      key: 'audit-logs',
      icon: <AuditOutlined />,
      label: <Link to="/audit-logs">审计日志</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <Link to="/settings">系统设置</Link>,
    },
  ];

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} width={220}>
        <div
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: collapsed ? '16px' : '18px',
            fontWeight: 'bold',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {collapsed ? 'NFT' : 'NFT 数字藏品'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Avatar icon={<UserOutlined />} />
              <span>管理员</span>
            </div>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            background: '#fff',
            minHeight: 280,
            borderRadius: '8px',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <ProtectedLayout>{children}</ProtectedLayout>;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id"
        element={
          <ProtectedRoute>
            <UserDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bots"
        element={
          <ProtectedRoute>
            <Bots />
          </ProtectedRoute>
        }
      />
      <Route
        path="/withdrawals"
        element={
          <ProtectedRoute>
            <Withdrawals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/red-packets"
        element={
          <ProtectedRoute>
            <RedPackets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/broadcasts"
        element={
          <ProtectedRoute>
            <Broadcasts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-users"
        element={
          <ProtectedRoute>
            <AdminUserManager />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <ProtectedRoute>
            <AuditLogs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SystemSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/nft-categories"
        element={
          <ProtectedRoute>
            <NFTCategories />
          </ProtectedRoute>
        }
      />
      <Route
        path="/nft-products"
        element={
          <ProtectedRoute>
            <NFTProducts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auctions"
        element={
          <ProtectedRoute>
            <Auctions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trading-pairs"
        element={
          <ProtectedRoute>
            <TradingPairs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/custom-price"
        element={
          <ProtectedRoute>
            <CustomPriceControl />
          </ProtectedRoute>
        }
      />
      <Route
        path="/charity"
        element={
          <ProtectedRoute>
            <CharityProjects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wallet-networks"
        element={
          <ProtectedRoute>
            <WalletNetworks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deposit-records"
        element={
          <ProtectedRoute>
            <DepositRecords />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transfer-records"
        element={
          <ProtectedRoute>
            <TransferRecords />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trading-rules"
        element={
          <ProtectedRoute>
            <TradingRules />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trading-sessions"
        element={
          <ProtectedRoute>
            <TradingSessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
