import React, { useEffect, useState } from 'react';
import { Table, message, Modal, Input, Button, Popconfirm, Image } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Screenshot {
  id: string;
  user_id: string;
  group_id: string;
  message_id: string;
  screenshot_file_id?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  user?: {
    telegram_id: number;
    username?: string;
  };
}

export const Screenshots: React.FC = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchScreenshots();
  }, [currentPage]);

  const fetchScreenshots = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/screenshots', {
        params: {
          page: currentPage,
          limit: pageSize,
          status: 'pending',
        },
      });
      setScreenshots(response.data.screenshots || []);
      setTotal(response.data.pagination?.total || response.data.screenshots?.length || 0);
    } catch (error) {
      console.error('Failed to fetch screenshots:', error);
      message.error('获取截图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedScreenshot) return;
    try {
      await axios.post(`/api/admin/screenshots/${selectedScreenshot.id}/review`, {
        status,
        admin_note: adminNote,
      });
      message.success(status === 'approved' ? '审核通过，用户已获得积分' : '已拒绝');
      setReviewModalOpen(false);
      setSelectedScreenshot(null);
      setAdminNote('');
      fetchScreenshots();
    } catch (error: any) {
      console.error('Failed to review screenshot:', error);
      message.error(error.response?.data?.error || '审核失败');
    }
  };

  const openReviewModal = (screenshot: Screenshot) => {
    setSelectedScreenshot(screenshot);
    setReviewModalOpen(true);
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
      render: (_: any, record: Screenshot) => (
        <div>
          <div>{record.user?.username || '未知'}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>ID: {record.user?.telegram_id}</div>
        </div>
      ),
    },
    {
      title: '群组 ID',
      dataIndex: 'group_id',
      key: 'group_id',
      render: (groupId: string) => <code style={{ fontSize: '12px' }}>{groupId}</code>,
    },
    {
      title: '截图',
      key: 'screenshot',
      width: 100,
      render: (_: any, record: Screenshot) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            // In a real app, you'd get the actual image URL from Telegram or your storage
            // For now, show a placeholder or the file_id
            setImagePreviewSrc(record.screenshot_file_id || 'https://via.placeholder.com/800x600?text=Screenshot');
          }}
        >
          查看
        </Button>
      ),
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
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: Screenshot) => (
        <Button type="primary" size="small" onClick={() => openReviewModal(record)}>
          审核
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>截图审核</h2>
        <p style={{ color: '#666' }}>审核用户提交的收益截图</p>
      </div>
      <Table
        columns={columns}
        dataSource={screenshots}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          onChange: (page) => setCurrentPage(page),
          showTotal: (total) => `共 ${total} 条`,
        }}
        scroll={{ x: 1000 }}
      />

      {/* Review Modal */}
      <Modal
        title="审核截图"
        open={reviewModalOpen}
        onCancel={() => {
          setReviewModalOpen(false);
          setSelectedScreenshot(null);
          setAdminNote('');
        }}
        footer={[
          <Button key="cancel" onClick={() => setReviewModalOpen(false)}>
            取消
          </Button>,
          <Popconfirm
            key="reject"
            title="确定要拒绝这个截图吗？"
            onConfirm={() => handleReview('rejected')}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<CloseOutlined />}>
              拒绝
            </Button>
          </Popconfirm>,
          <Popconfirm
            key="approve"
            title="确定要通过审核吗？用户将获得红包积分奖励"
            onConfirm={() => handleReview('approved')}
            okText="确定"
            cancelText="取消"
          >
            <Button type="primary" icon={<CheckOutlined />}>
              通过 (增加积分)
            </Button>
          </Popconfirm>,
        ]}
      >
        {selectedScreenshot && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>用户</label>
              <p style={{ fontWeight: 'bold' }}>
                {selectedScreenshot.user?.username || '未知'} ({selectedScreenshot.user?.telegram_id})
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>群组 ID</label>
              <p style={{ fontFamily: 'monospace' }}>{selectedScreenshot.group_id}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>消息 ID</label>
              <p style={{ fontFamily: 'monospace' }}>{selectedScreenshot.message_id}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>审核备注 (可选)</label>
              <TextArea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
                placeholder="输入审核备注..."
              />
            </div>
            <div style={{ padding: 12, backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 4 }}>
              <p style={{ fontSize: '12px', color: '#1890ff', margin: 0 }}>
                审核通过后，用户将获得红包积分奖励
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Image Preview */}
      {imagePreviewSrc && (
        <Image
          style={{ display: 'none' }}
          src={imagePreviewSrc}
          preview={{
            visible: !!imagePreviewSrc,
            onVisibleChange: (visible) => {
              if (!visible) setImagePreviewSrc(null);
            },
          }}
        />
      )}
    </div>
  );
};
