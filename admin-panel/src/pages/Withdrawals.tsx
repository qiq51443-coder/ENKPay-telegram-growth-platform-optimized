import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Modal, Input, Button, Popconfirm, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  wallet_address: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at: string;
  user?: {
    telegram_id: number;
    username?: string;
    balance: number;
  };
}

export const Withdrawals: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchWithdrawals();
  }, [currentPage]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/withdrawals', {
        params: {
          page: currentPage,
          limit: pageSize,
          status: 'pending',
        },
      });
      setWithdrawals(response.data.withdrawals || []);
      setTotal(response.data.pagination?.total || response.data.withdrawals?.length || 0);
    } catch (error) {
      console.error('Failed to fetch withdrawals:', error);
      message.error('获取提现列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedWithdrawal) return;
    try {
      await axios.post(`/api/admin/withdrawals/${selectedWithdrawal.id}/review`, {
        status,
        admin_note: adminNote,
      });
      message.success(status === 'approved' ? '审核通过' : '已拒绝');
      setReviewModalOpen(false);
      setSelectedWithdrawal(null);
      setAdminNote('');
      fetchWithdrawals();
    } catch (error: any) {
      console.error('Failed to review withdrawal:', error);
      message.error(error.response?.data?.error || '审核失败');
    }
  };

  const openReviewModal = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
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
      render: (_: any, record: Withdrawal) => (
        <div>
          <div>{record.user?.username || '未知'}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>ID: {record.user?.telegram_id}</div>
        </div>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>${amount.toFixed(2)}</span>
      ),
    },
    {
      title: '钱包地址',
      dataIndex: 'wallet_address',
      key: 'wallet_address',
      render: (address: string) => (
        <code style={{ fontSize: '12px' }}>{address}</code>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: { [key: string]: { text: string; color: string } } = {
          pending: { text: '待处理', color: 'warning' },
          approved: { text: '已批准', color: 'processing' },
          rejected: { text: '已拒绝', color: 'error' },
          completed: { text: '已完成', color: 'success' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: Withdrawal) =>
        record.status === 'pending' ? (
          <Button type="primary" size="small" onClick={() => openReviewModal(record)}>
            审核
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>提现管理</h2>
        <p style={{ color: '#666' }}>审核和处理用户提现申请</p>
      </div>
      <Table
        columns={columns}
        dataSource={withdrawals}
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
        title="审核提现申请"
        open={reviewModalOpen}
        onCancel={() => {
          setReviewModalOpen(false);
          setSelectedWithdrawal(null);
          setAdminNote('');
        }}
        footer={[
          <Button key="cancel" onClick={() => setReviewModalOpen(false)}>
            取消
          </Button>,
          <Popconfirm
            key="reject"
            title="确定要拒绝这个提现申请吗？"
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
            title="确定要批准这个提现申请吗？"
            onConfirm={() => handleReview('approved')}
            okText="确定"
            cancelText="取消"
          >
            <Button type="primary" icon={<CheckOutlined />}>
              批准
            </Button>
          </Popconfirm>,
        ]}
      >
        {selectedWithdrawal && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>用户</label>
              <p style={{ fontWeight: 'bold' }}>
                {selectedWithdrawal.user?.username || '未知'} ({selectedWithdrawal.user?.telegram_id})
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>提现金额</label>
              <p style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                ${selectedWithdrawal.amount.toFixed(2)}
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>钱包地址</label>
              <p style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {selectedWithdrawal.wallet_address}
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#666' }}>用户余额</label>
              <p style={{ fontFamily: 'monospace' }}>${selectedWithdrawal.user?.balance || 0}</p>
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
            <div style={{ padding: 12, backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
              <p style={{ fontSize: '12px', color: '#faad14', margin: 0 }}>
                批准后，系统将从用户余额中扣除相应金额
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
