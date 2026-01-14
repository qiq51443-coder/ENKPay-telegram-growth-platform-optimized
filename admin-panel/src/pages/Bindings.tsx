import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Image } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface Binding {
  id: string;
  user_id: string;
  platform_username: string;
  screenshot_file_id?: string;
  status: string;
  created_at: string;
  user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
  };
}

export const Bindings: React.FC = () => {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchBindings();
  }, []);

  const fetchBindings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getBindings();
      setBindings(response.bindings || []);
    } catch (error) {
      console.error('Failed to fetch bindings:', error);
      message.error('获取绑定列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiClient.reviewBinding(id, { status: 'approved' });
      message.success('审核通过');
      fetchBindings();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiClient.reviewBinding(id, { status: 'rejected' });
      message.success('已拒绝');
      fetchBindings();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: Binding) => (
        <div>
          {record.user?.first_name || 'Unknown'}
          {record.user?.username && ` (@${record.user.username})`}
        </div>
      ),
    },
    {
      title: '平台用户名',
      dataIndex: 'platform_username',
      key: 'platform_username',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: { [key: string]: string } = {
          pending: 'warning',
          approved: 'success',
          rejected: 'error',
        };
        return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
      },
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: Binding) => (
        <Space>
          {record.status === 'pending' && (
            <>
              <Popconfirm
                title="确定通过审核？"
                onConfirm={() => handleApprove(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" size="small" icon={<CheckOutlined />}>
                  通过
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确定拒绝？"
                onConfirm={() => handleReject(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" danger size="small" icon={<CloseOutlined />}>
                  拒绝
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2>绑定审核</h2>
      <Table
        columns={columns}
        dataSource={bindings}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
      {previewImage && (
        <Modal open={!!previewImage} footer={null} onCancel={() => setPreviewImage(null)}>
          <Image src={previewImage} alt="截图" />
        </Modal>
      )}
    </div>
  );
};
