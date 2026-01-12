import React, { useEffect, useState } from 'react';
import { Table, message } from 'antd';
import axios from 'axios';

export const Tutorials: React.FC = () => {
  const [tutorials, setTutorials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTutorials();
  }, []);

  const fetchTutorials = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/tutorials');
      setTutorials(response.data.tutorials || []);
    } catch (error) {
      console.error('Failed to fetch tutorials:', error);
      message.error('获取教程列表失败');
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
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '交易所',
      dataIndex: 'exchange_name',
      key: 'exchange_name',
    },
    {
      title: '分类',
      dataIndex: 'category_name',
      key: 'category_name',
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
      <h2>教程管理</h2>
      <Table
        columns={columns}
        dataSource={tutorials}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};
