import React, { useEffect, useState, Component } from 'react';
import { Table, Tag, message, Input, Button, Space, Select, Modal, InputNumber, Form, Alert } from 'antd';
import { SearchOutlined, EyeOutlined, LockOutlined, UnlockOutlined, DollarOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import apiClient from '../services/api';

const { Search } = Input;

interface User {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  unique_id?: string;
  robot_user_id?: string;
  balance: number;
  wallet_balance?: number;
  reward_balance?: number;
  binding_status: string;
  account_status: string;
  is_frozen?: boolean;
  created_at: string;
  bot_count?: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class UsersErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Users] Render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          message="用户列表加载失败"
          description={this.state.error?.message || '未知错误，请刷新页面重试。'}
          showIcon
        />
      );
    }
    return this.props.children;
  }
}

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [bindingFilter, setBindingFilter] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [adjustModal, setAdjustModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [currentPage, bindingFilter, accountFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        limit: 20,
      };
      
      if (search) params.search = search;
      if (bindingFilter) params.binding_status = bindingFilter;
      if (accountFilter) params.account_status = accountFilter;

      const response = await apiClient.getUsers(params);
      setUsers(response.users || []);
      setTotal(response.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      message.error('获取用户列表失败');
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

  const handleFreeze = async (userId: string) => {
    try {
      await apiClient.post(`/users/${userId}/freeze`);
      message.success('用户已冻结');
      fetchUsers();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleUnfreeze = async (userId: string) => {
    try {
      await apiClient.post(`/users/${userId}/unfreeze`);
      message.success('用户已解冻');
      fetchUsers();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const openAdjustModal = (record: User) => {
    setSelectedUser(record);
    setAdjustAmount(0);
    setAdjustType('add');
    setAdjustReason('');
    setAdjustModal(true);
  };

  const handleAdjustBalance = async () => {
    try {
      await apiClient.post(`/users/${selectedUser?.id}/adjust-balance`, {
        amount: adjustAmount,
        type: adjustType,
        reason: adjustReason,
      });
      message.success('余额调整成功');
      setAdjustModal(false);
      fetchUsers();
    } catch (error) {
      message.error('余额调整失败');
    }
  };

  const columns = [
    {
      title: 'Telegram ID',
      dataIndex: 'telegram_id',
      key: 'telegram_id',
      width: 120,
    },
    {
      title: '用户名',
      key: 'username',
      width: 150,
      render: (_: any, record: User) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.username || '未设置'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.first_name}</div>
        </div>
      ),
    },
    {
      title: 'UID',
      dataIndex: 'unique_id',
      key: 'unique_id',
      width: 100,
      render: (uid?: string) => uid ? <span>#{uid}</span> : '-',
    },
    {
      title: 'Bot ID',
      dataIndex: 'robot_user_id',
      key: 'robot_user_id',
      width: 120,
      render: (id?: string) => id || '-',
    },
    {
      title: '余额',
      key: 'balance',
      width: 100,
      render: (_: any, record: User) => {
        const balance = record.wallet_balance ?? record.balance ?? 0;
        return <span style={{ fontFamily: 'monospace' }}>${Number(balance).toFixed(2)}</span>;
      },
    },
    {
      title: '红包余额(USDT)',
      dataIndex: 'reward_balance',
      key: 'reward_balance',
      width: 120,
      render: (v: any) => <span style={{ fontFamily: 'monospace' }}>${parseFloat(v || 0).toFixed(2)}</span>,
    },
    {
      title: '账号状态',
      key: 'account_status',
      width: 120,
      render: (_: any, record: User) => {
        if (record.is_frozen) {
          return <Tag color="error">已冻结</Tag>;
        }
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '正常', color: 'success' },
          suspended: { text: '暂停', color: 'warning' },
          banned: { text: '封禁', color: 'error' },
        };
        const statusInfo = statusMap[record.account_status] || { text: record.account_status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '关联机器人',
      dataIndex: 'bot_count',
      key: 'bot_count',
      width: 100,
      render: (count: number | undefined) => count != null ? count : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: any, record: User) => (
        <Space size="small">
          <Link to={`/users/${record.id}`}>
            <Button type="text" size="small" icon={<EyeOutlined />}>
              查看
            </Button>
          </Link>
          {record.is_frozen ? (
            <Button type="text" size="small" icon={<UnlockOutlined />} onClick={() => handleUnfreeze(record.id)}>
              解冻
            </Button>
          ) : (
            <Button type="text" size="small" danger icon={<LockOutlined />} onClick={() => handleFreeze(record.id)}>
              冻结
            </Button>
          )}
          <Button
            type="text"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => openAdjustModal(record)}
          >
            调整余额
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <p style={{ color: '#666', marginTop: 4 }}>查看和管理所有用户</p>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
        <Space wrap style={{ width: '100%' }}>
          <Search
            placeholder="搜索用户名、Bot ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 250 }}
            enterButton={<SearchOutlined />}
          />
          <Select
            placeholder="绑定状态"
            value={bindingFilter}
            onChange={setBindingFilter}
            style={{ width: 120 }}
            allowClear
          >
            <Select.Option value="unbound">未绑定</Select.Option>
            <Select.Option value="pending">待审核</Select.Option>
            <Select.Option value="bound">已绑定</Select.Option>
          </Select>
          <Select
            placeholder="账号状态"
            value={accountFilter}
            onChange={setAccountFilter}
            style={{ width: 120 }}
            allowClear
          >
            <Select.Option value="active">正常</Select.Option>
            <Select.Option value="suspended">暂停</Select.Option>
            <Select.Option value="banned">封禁</Select.Option>
          </Select>
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
        }}
        scroll={{ x: 1400 }}
      />

      <Modal
        title={`调整余额 - ${selectedUser?.username || selectedUser?.first_name || '用户'}`}
        open={adjustModal}
        onOk={handleAdjustBalance}
        onCancel={() => setAdjustModal(false)}
        okText="确认调整"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="操作类型">
            <Select value={adjustType} onChange={(v) => setAdjustType(v)}>
              <Select.Option value="add">增加</Select.Option>
              <Select.Option value="subtract">减少</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="金额">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              value={adjustAmount}
              onChange={(v) => setAdjustAmount(v || 0)}
              prefix="$"
            />
          </Form.Item>
          <Form.Item label="原因">
            <Input
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="请输入调整原因"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export const Users: React.FC = () => (
  <UsersErrorBoundary>
    <UsersPage />
  </UsersErrorBoundary>
);
