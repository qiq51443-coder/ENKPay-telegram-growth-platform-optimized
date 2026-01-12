import React, { useEffect, useState } from 'react';
import { Table, Tag, message } from 'antd';
import axios from 'axios';

export const Users: React.FC = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/users');
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Telegram ID',
      dataIndex: 'telegram_id',
      key: 'telegram_id',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => username || '-',
    },
    {
      title: '姓名',
      key: 'name',
      render: (_: any, record: any) => 
        `${record.first_name || ''} ${record.last_name || ''}`.trim() || '-',
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      render: (balance: number) => `$${balance?.toFixed(2) || '0.00'}`,
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      key: 'account_status',
      render: (status: string) => <Tag color={status === 'active' ? 'success' : 'default'}>{status}</Tag>,
    },
    {
      title: '注册时间',
      dataIndex: 'registered_at',
      key: 'registered_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <h2>用户列表</h2>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};
