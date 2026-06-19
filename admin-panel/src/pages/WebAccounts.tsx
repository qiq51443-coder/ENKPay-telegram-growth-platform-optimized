import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Input, Button, Space, Modal, Typography, Tooltip } from 'antd';
import {
  SearchOutlined,
  KeyOutlined,
  LockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import apiClient from '../services/api';

const { Search } = Input;
const { Text } = Typography;

interface WebUser {
  id: string;
  email: string;
  register_type: string;
  wallet_balance: number;
  reward_balance: number;
  admin_set_login_password?: string;
  admin_set_withdraw_password?: string;
  withdraw_password_set: boolean;
  created_at: string;
  last_active_at?: string;
  account_status: string;
}

const PasswordCell: React.FC<{ value?: string; fallback: string }> = ({ value, fallback }) => {
  const [visible, setVisible] = useState(false);

  if (!value) {
    return <Text type="secondary">{fallback}</Text>;
  }

  return (
    <Space size={4}>
      <Text code style={{ fontSize: 13 }}>
        {visible ? value : '••••••••'}
      </Text>
      <Tooltip title={visible ? '隐藏' : '显示'}>
        <Button
          type="text"
          size="small"
          icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={() => setVisible((v) => !v)}
        />
      </Tooltip>
      <Tooltip title="复制">
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              message.success('已复制到剪贴板');
            });
          }}
        />
      </Tooltip>
    </Space>
  );
};

const WebAccountsPage: React.FC = () => {
  const [users, setUsers] = useState<WebUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, [currentPage]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: any = { page: currentPage, limit: 20 };
      if (search) params.search = search;
      const response = await apiClient.getWebAccounts(params);
      setUsers(response.users || []);
      setTotal(response.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to fetch web accounts:', error);
      message.error('获取官网账号列表失败');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers();
  };

  const handleResetLoginPassword = async (record: WebUser) => {
    Modal.confirm({
      title: '重置登录密码',
      content: `确认重置 ${record.email} 的登录密码？系统将生成新的随机密码。`,
      okText: '确认重置',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await apiClient.resetLoginPassword(record.id);
          message.success(`登录密码已重置，新密码：${result.new_password}`);
          fetchUsers();
          Modal.info({
            title: '新登录密码',
            content: (
              <div>
                <p>用户：<strong>{record.email}</strong></p>
                <p>新密码：<Text code copyable>{result.new_password}</Text></p>
                <p style={{ color: '#ff4d4f', marginTop: 8 }}>请将此密码告知用户，关闭后将不再显示原文。</p>
              </div>
            ),
          });
        } catch (error: any) {
          message.error(error.response?.data?.error || '重置登录密码失败');
        }
      },
    });
  };

  const handleResetWithdrawPassword = async (record: WebUser) => {
    Modal.confirm({
      title: '重置提现密码',
      content: `确认重置 ${record.email} 的提现密码？系统将生成新的随机密码。`,
      okText: '确认重置',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await apiClient.resetWithdrawPassword(record.id);
          message.success(`提现密码已重置，新密码：${result.new_password}`);
          fetchUsers();
          Modal.info({
            title: '新提现密码',
            content: (
              <div>
                <p>用户：<strong>{record.email}</strong></p>
                <p>新密码：<Text code copyable>{result.new_password}</Text></p>
                <p style={{ color: '#ff4d4f', marginTop: 8 }}>请将此密码告知用户，关闭后将不再显示原文。</p>
              </div>
            ),
          });
        } catch (error: any) {
          message.error(error.response?.data?.error || '重置提现密码失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '邮箱地址',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (email: string) => (
        <Space>
          <Text copyable>{email}</Text>
        </Space>
      ),
    },
    {
      title: '账号状态',
      dataIndex: 'account_status',
      key: 'account_status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '正常', color: 'success' },
          suspended: { text: '暂停', color: 'warning' },
          banned: { text: '封禁', color: 'error' },
        };
        const info = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '钱包余额 (USDT)',
      key: 'balance',
      width: 140,
      render: (_: any, record: WebUser) => (
        <span style={{ fontFamily: 'monospace' }}>
          {Number(record.wallet_balance || 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: '登录密码',
      key: 'login_password',
      width: 200,
      render: (_: any, record: WebUser) => (
        <PasswordCell
          value={record.admin_set_login_password}
          fallback="用户自设"
        />
      ),
    },
    {
      title: '提现密码',
      key: 'withdraw_password',
      width: 200,
      render: (_: any, record: WebUser) => (
        <PasswordCell
          value={record.admin_set_withdraw_password}
          fallback={record.withdraw_password_set ? '用户自设' : '未设置'}
        />
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 220,
      render: (_: any, record: WebUser) => (
        <Space size="small" wrap>
          <Button
            type="text"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => handleResetLoginPassword(record)}
          >
            重置登录密码
          </Button>
          <Button
            type="text"
            size="small"
            icon={<LockOutlined />}
            onClick={() => handleResetWithdrawPassword(record)}
          >
            重置提现密码
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>官网账号管理</h2>
        <p style={{ color: '#666', marginTop: 4 }}>管理通过官网邮箱注册的用户账号，查看及重置登录密码和提现密码</p>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Space wrap>
          <Search
            placeholder="搜索邮箱地址..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 280 }}
            enterButton={<SearchOutlined />}
          />
          <Button icon={<ReloadOutlined />} onClick={() => { setSearch(''); setCurrentPage(1); fetchUsers(); }}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: 20,
          total: total,
          onChange: setCurrentPage,
          showTotal: (t) => `共 ${t} 个账号`,
        }}
        scroll={{ x: 1200 }}
      />
    </div>
  );
};

export const WebAccounts: React.FC = () => <WebAccountsPage />;
