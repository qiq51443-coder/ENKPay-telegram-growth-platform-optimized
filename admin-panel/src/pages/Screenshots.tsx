import React, { useEffect, useState } from 'react';
import { Table, message, Button, Popconfirm, Modal, Input, Image } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Screenshot {
  id: string;
  user_id: string;
  group_id: string;
  message_id?: number;
  file_id?: string;
  screenshot_url?: string;
  status: string;
  admin_note?: string;
  created_at: string;
  reviewed_at?: string;
  user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    red_packet_credits: number;
  };
}

export const Screenshots: React.FC = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchScreenshots();
  }, []);

  const fetchScreenshots = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/screenshots', {
        params: { status: 'pending' },
      });
      setScreenshots(response.data.screenshots || []);
    } catch (error) {
      console.error('Failed to fetch screenshots:', error);
      message.error('获取截图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReviewModal = (screenshot: Screenshot) => {
    setSelectedScreenshot(screenshot);
    setAdminNote('');
    setReviewModalOpen(true);
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedScreenshot) return;

    try {
      await axios.post(`/api/admin/screenshots/${selectedScreenshot.id}/${status === 'approved' ? 'approve' : 'reject'}`, {
        admin_note: adminNote,
      });
      message.success(status === 'approved' ? '审核通过，已增加红包积分' : '已拒绝');
      setReviewModalOpen(false);
      setSelectedScreenshot(null);
      setAdminNote('');
      fetchScreenshots();
    } catch (error: any) {
      console.error('Failed to review screenshot:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleViewImage = (screenshot: Screenshot) => {
    // In a real implementation, you would fetch the actual image from Telegram
    // For now, we'll use a placeholder or the screenshot_url if available
    if (screenshot.screenshot_url) {
      setPreviewImage(screenshot.screenshot_url);
    } else {
      message.info('图片URL不可用');
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
      width: 150,
      render: (_: any, record: Screenshot) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.user?.username || record.user?.first_name || '未知'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {record.user?.telegram_id}
          </div>
        </div>
      ),
    },
    {
      title: '群组 ID',
      dataIndex: 'group_id',
      key: 'group_id',
      width: 150,
      render: (group_id: string) => (
        <span style={{ fontFamily: 'monospace' }}>{group_id}</span>
      ),
    },
    {
      title: '消息 ID',
      dataIndex: 'message_id',
      key: 'message_id',
      width: 100,
      render: (message_id?: number) => message_id || '-',
    },
    {
      title: '红包积分',
      key: 'credits',
      width: 100,
      render: (_: any, record: Screenshot) => record.user?.red_packet_credits || 0,
    },
    {
      title: '截图',
      key: 'screenshot',
      width: 100,
      render: (_: any, record: Screenshot) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewImage(record)}
        >
          查看
        </Button>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: Screenshot) => (
        <Button
          type="primary"
          size="small"
          onClick={() => handleOpenReviewModal(record)}
        >
          审核
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>截图审核</h2>
        <p style={{ color: '#666', marginTop: 4 }}>审核用户提交的收益截图</p>
      </div>

      <Table
        columns={columns}
        dataSource={screenshots}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

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
            title="确定要通过这个截图吗？"
            description="审核通过后，用户将获得红包积分奖励"
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
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>用户</div>
              <div style={{ fontWeight: 500 }}>
                {selectedScreenshot.user?.username || selectedScreenshot.user?.first_name || '未知'} (
                {selectedScreenshot.user?.telegram_id})
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>群组 ID</div>
              <div style={{ fontFamily: 'monospace' }}>{selectedScreenshot.group_id}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>消息 ID</div>
              <div style={{ fontFamily: 'monospace' }}>{selectedScreenshot.message_id || '-'}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>当前红包积分</div>
              <div style={{ fontWeight: 'bold' }}>{selectedScreenshot.user?.red_packet_credits || 0}</div>
            </div>
            {selectedScreenshot.screenshot_url && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: '#666', marginBottom: 4 }}>截图预览</div>
                <Button
                  type="link"
                  icon={<EyeOutlined />}
                  onClick={() => handleViewImage(selectedScreenshot)}
                >
                  查看大图
                </Button>
              </div>
            )}
            <div>
              <div style={{ color: '#666', marginBottom: 4 }}>审核备注 (可选)</div>
              <TextArea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
                placeholder="输入审核备注..."
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!previewImage}
        footer={null}
        onCancel={() => setPreviewImage(null)}
        width={800}
      >
        {previewImage && <Image src={previewImage} alt="截图" style={{ width: '100%' }} />}
      </Modal>
    </div>
  );
};
