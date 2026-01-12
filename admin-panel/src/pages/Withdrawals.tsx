import React, { useEffect, useState } from 'react';
import { Table, Tag, message } from 'antd';
import axios from 'axios';

export const Withdrawals: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/admin/withdrawals');
      setWithdrawals(response.data.withdrawals || []);
    } catch (error) {
      console.error('Failed to fetch withdrawals:', error);
      message.error('获取提现列表失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '用户',
      dataIndex: 'user_id',
      key: 'user_id',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `$${amount?.toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={status === 'approved' ? 'success' : 'warning'}>{status}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <h2>提现审核</h2>
      <Table
        columns={columns}
        dataSource={withdrawals}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};
