import React, { useEffect, useState } from 'react';
import { Table, message } from 'antd';
import axios from 'axios';

export const Screenshots: React.FC = () => {
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScreenshots();
  }, []);

  const fetchScreenshots = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/admin/screenshots');
      setScreenshots(response.data.screenshots || []);
    } catch (error) {
      console.error('Failed to fetch screenshots:', error);
      message.error('获取截图列表失败');
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <h2>截图审核</h2>
      <Table
        columns={columns}
        dataSource={screenshots}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};
