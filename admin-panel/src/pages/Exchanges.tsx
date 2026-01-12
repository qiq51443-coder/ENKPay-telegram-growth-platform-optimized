import React, { useEffect, useState } from 'react';
import { Table, message } from 'antd';
import axios from 'axios';

export const Exchanges: React.FC = () => {
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExchanges();
  }, []);

  const fetchExchanges = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/exchanges');
      setExchanges(response.data.exchanges || []);
    } catch (error) {
      console.error('Failed to fetch exchanges:', error);
      message.error('获取交易所列表失败');
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
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active: boolean) => is_active ? '启用' : '禁用',
    },
  ];

  return (
    <div>
      <h2>平台配置</h2>
      <Table
        columns={columns}
        dataSource={exchanges}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};
