import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Avatar } from 'antd';
import {
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
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Login } from './pages/Login';
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
import { Groups } from './pages/Groups';
import { Announcements } from './pages/Announcements';
import { Analytics } from './pages/Analytics';
import { Sweep } from './pages/Sweep';
import { BotSettings } from './pages/BotSettings';
import { ErrorBoundary } from './components/ErrorBoundary';

const { Header, Sider, Content } = Layout;

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

const ProtectedLayout: React.FC<ProtectedLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState('analytics');

  useEffect(() => {
    const path = location.pathname.split('/')[1] || 'analytics';
    setSelectedKey(path);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const menuItems = [
    {
      key: 'analytics',
      icon: <BarChartOutlined />,
      label: <Link to="/analytics">数据统计</Link>,
    },
    {
      key: 'users',
      icon: <UserOutlined />,
      label: <Link to="/users">用户管理</Link>,
    },
    {
      key: 'groups',
      icon: <TeamOutlined />,
      label: <Link to="/groups">群组管理</Link>,
    },
    {
      key: 'nft',
      icon: <AppstoreOutlined />,
      label: 'NFT 管理',
      children: [
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
          label: <Link to="/trading-sessions">交易时段</Link>,
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
          key: 'sweep',
          label: <Link to="/sweep">归集管理</Link>,
        },
        {
          key: 'deposit-records',
          label: <Link to="/deposit-records">充值记录</Link>,
        },
        {
          key: 'transfer-records',
          label: <Link to="/transfer-records">转账记录</Link>,
        },
        {
          key: 'withdrawals',
          label: <Link to="/withdrawals">提现记录</Link>,
        },
        {
          key: 'orders',
          label: <Link to="/orders">订单管理</Link>,
        },
      ],
    },
    {
      key: 'bots',
      icon: <RobotOutlined />,
      label: <Link to="/bots">Bot 管理</Link>,
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
      key: 'announcements',
      icon: <ThunderboltOutlined />,
      label: <Link to="/announcements">公告管理</Link>,
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
      key: 'bot-settings',
      icon: <RobotOutlined />,
      label: <Link to="/bot-settings">Bot设置</Link>,
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
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
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
          {collapsed ? '💳' : '💳 ENK Pay'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['nft', 'trading', 'wallet']}
          openKeys={collapsed ? [] : ['nft', 'trading', 'wallet']}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 220 }}>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
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
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
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
        path="/analytics"
        element={
          <ProtectedRoute>
            <Analytics />
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
        path="/bot-settings"
        element={
          <ProtectedRoute>
            <BotSettings />
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
      <Route
        path="/groups"
        element={
          <ProtectedRoute>
            <Groups />
          </ProtectedRoute>
        }
      />
      <Route
        path="/announcements"
        element={
          <ProtectedRoute>
            <Announcements />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sweep"
        element={
          <ProtectedRoute>
            <Sweep />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/analytics" replace />} />
      <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />
      <Route path="*" element={<Navigate to="/analytics" replace />} />
    </Routes>
  );
}

export default App;
