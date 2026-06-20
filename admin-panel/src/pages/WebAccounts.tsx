import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Input, Button, Space, Modal, Typography, Tooltip, Select, Form, InputNumber } from 'antd';
import {
  SearchOutlined,
  KeyOutlined,
  LockOutlined,
  UnlockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
  ReloadOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
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
  is_frozen?: boolean;
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
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [adjustModal, setAdjustModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<WebUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [currentPage, accountFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: any = { page: currentPage, limit: 20 };
      if (search) params.search = search;
      if (accountFilter) params.account_status = accountFilter;
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

  const handleFreeze = async (record: WebUser) => {
    Modal.confirm({
      title: '冻结账号',
      content: `确认冻结 ${record.email} 的账号？`,
      okText: '确认冻结',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiClient.post(`/users/${record.id}/freeze`);
          message.success('账号已冻结');
          fetchUsers();
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const handleUnfreeze = async (record: WebUser) => {
    Modal.confirm({
      title: '解冻账号',
      content: `确认解冻 ${record.email} 的账号？`,
      okText: '确认解冻',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiClient.post(`/users/${record.id}/unfreeze`);
          message.success('账号已解冻');
          fetchUsers();
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const openAdjustModal = (record: WebUser) => {
    setSelectedUser(record);
    setAdjustAmount(0);
    setAdjustType('add');
    setAdjustReason('');
    setAdjustModal(true);
  };

  const handleAdjustBalance = async () => {
    if (!selectedUser) return;
    try {
      await apiClient.adjustBalance(selectedUser.id, {
        amount: adjustAmount,
        type: adjustType,
        reason: adjustReason,
      });
      message.success('余额调整成功');
      setAdjustModal(false);
      fetchUsers();
    } catch {
      message.error('余额调整失败');
    }
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
      key: 'account_status',
      width: 100,
      render: (_: any, record: WebUser) => {
        if (record.is_frozen) return <Tag color="error">已冻结</Tag>;
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '正常', color: 'success' },
          suspended: { text: '暂停', color: 'warning' },
          banned: { text: '封禁', color: 'error' },
        };
        const info = statusMap[record.account_status] || { text: record.account_status, color: 'default' };
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
      title: '奖励余额 (USDT)',
      key: 'reward_balance',
      width: 140,
      render: (_: any, record: WebUser) => (
        <span style={{ fontFamily: 'monospace' }}>
          {Number(record.reward_balance || 0).toFixed(2)}
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
      title: '最后活跃',
      dataIndex: 'last_active_at',
      key: 'last_active_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 280,
      render: (_: any, record: WebUser) => (
        <Space size="small" wrap>
          <Link to={`/web-accounts/${record.id}`}>
            <Button type="text" size="small" icon={<EyeOutlined />}>
              详情
            </Button>
          </Link>
          <Button
            type="text"
            size="small"
            icon={<DollarOutlined />}
            onClick={() => openAdjustModal(record)}
          >
            调整余额
          </Button>
          {record.is_frozen ? (
            <Button type="text" size="small" icon={<UnlockOutlined />} onClick={() => handleUnfreeze(record)}>
              解冻
            </Button>
          ) : (
            <Button type="text" size="small" danger icon={<LockOutlined />} onClick={() => handleFreeze(record)}>
              冻结
            </Button>
          )}
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
        <p style={{ color: '#666', marginTop: 4 }}>管理通过官网邮箱注册的用户账号，共 <strong>{total}</strong> 个</p>
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
          <Select
            placeholder="账号状态"
            value={accountFilter || undefined}
            onChange={(v) => { setAccountFilter(v || ''); setCurrentPage(1); }}
            style={{ width: 130 }}
            allowClear
          >
            <Select.Option value="active">正常</Select.Option>
            <Select.Option value="suspended">暂停</Select.Option>
            <Select.Option value="banned">封禁</Select.Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={() => { setSearch(''); setAccountFilter(''); setCurrentPage(1); fetchUsers(); }}>
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
        scroll={{ x: 1600 }}
      />

      <Modal
        title={`调整余额 - ${selectedUser?.email || '官网账号'}`}
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

export const WebAccounts: React.FC = () => <WebAccountsPage />;
