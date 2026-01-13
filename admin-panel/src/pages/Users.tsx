import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Input, Button, Space } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import axios from 'axios';

interface User {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  robot_user_id?: string;
  balance: number;
  red_packet_credits: number;
  binding_status: 'unbound' | 'pending' | 'bound';
  account_status: 'active' | 'suspended' | 'banned';
  registered_at: string;
}

export const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchUsers();
  }, [currentPage, search]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/users', {
        params: {
          page: currentPage,
          limit: pageSize,
          search,
        },
      });
      setUsers(response.data.users || []);
      setTotal(response.data.pagination?.total || response.data.users?.length || 0);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers();
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
      render: (_: any, record: User) => (
        <div>
          <div>{record.username || '未设置'}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{record.first_name}</div>
        </div>
      ),
    },
    {
      title: 'Bot ID',
      dataIndex: 'robot_user_id',
      key: 'robot_user_id',
      render: (robot_user_id: string) => robot_user_id || '-',
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      render: (balance: number) => `$${balance?.toFixed(2) || '0.00'}`,
    },
    {
      title: '红包积分',
      dataIndex: 'red_packet_credits',
      key: 'red_packet_credits',
    },
    {
      title: '绑定状态',
      dataIndex: 'binding_status',
      key: 'binding_status',
      render: (status: string) => {
        const statusMap: { [key: string]: { text: string; color: string } } = {
          unbound: { text: '未绑定', color: 'default' },
          pending: { text: '待审核', color: 'warning' },
          bound: { text: '已绑定', color: 'success' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '账号状态',
      dataIndex: 'account_status',
      key: 'account_status',
      render: (status: string) => {
        const statusMap: { [key: string]: { text: string; color: string } } = {
          active: { text: '正常', color: 'success' },
          suspended: { text: '暂停', color: 'warning' },
          banned: { text: '封禁', color: 'error' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '注册时间',
      dataIndex: 'registered_at',
      key: 'registered_at',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: User) => (
        <Link to={`/users/${record.id}`}>
          <Button type="link" size="small" icon={<EyeOutlined />}>
            查看
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8 }}>用户管理</h2>
        <p style={{ color: '#666', marginBottom: 16 }}>查看和管理所有用户</p>
        <Space>
          <Input
            placeholder="搜索用户名、Bot ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 300 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
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
          pageSize,
          total,
          onChange: (page) => setCurrentPage(page),
          showTotal: (total) => `共 ${total} 条`,
        }}
        scroll={{ x: 1200 }}
      />
    </div>
  );
};
