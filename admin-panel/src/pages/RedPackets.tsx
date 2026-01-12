import React, { useEffect, useState } from 'react';
import { Table, message } from 'antd';
import axios from 'axios';

export const RedPackets: React.FC = () => {
  const [redPackets, setRedPackets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRedPackets();
  }, []);

  const fetchRedPackets = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/admin/redpackets');
      setRedPackets(response.data.redPackets || []);
    } catch (error) {
      console.error('Failed to fetch red packets:', error);
      message.error('获取红包列表失败');
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
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `$${amount?.toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
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
      <h2>红包管理</h2>
      <Table
        columns={columns}
        dataSource={redPackets}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};
