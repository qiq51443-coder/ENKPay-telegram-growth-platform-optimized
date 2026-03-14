import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Button, Popconfirm, Modal, Input, Select, Space } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TextArea } = Input;

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  fee?: number;
  actual_amount?: number;
  order_id?: string;
  wallet_address: string;
  network_name?: string;
  network_display?: string;
  robot_user_id?: string;
  unique_id?: string;
  status: string;
  admin_note?: string;
  created_at: string;
  reviewed_at?: string;
  user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    wallet_balance: number;
    robot_user_id?: string;
    unique_id?: string;
  };
}

export const Withdrawals: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [orderIdSearch, setOrderIdSearch] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [adminNote, setAdminNote] = useState('');

  useEffect(() => {
    fetchWithdrawals();
    const interval = setInterval(fetchWithdrawals, 30000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      
      const response = await apiClient.getWithdrawalRecords(params);
      const list = response.data || response.records || response.withdrawals || [];
      setWithdrawals(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Failed to fetch withdrawals:', error);
      message.error('获取提现列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReviewModal = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setAdminNote('');
    setReviewModalOpen(true);
  };

  const handleReview = async (action: 'approved' | 'rejected') => {
    if (!selectedWithdrawal) return;

    try {
      await apiClient.reviewWithdrawalNew(selectedWithdrawal.id, {
        action,
        admin_note: adminNote,
      });
      message.success(action === 'approved' ? '审核通过' : '已拒绝');
      setReviewModalOpen(false);
      setSelectedWithdrawal(null);
      setAdminNote('');
      fetchWithdrawals();
    } catch (error: any) {
      console.error('Failed to review withdrawal:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const filteredWithdrawals = withdrawals.filter(w =>
    !orderIdSearch || (w.order_id || '').toLowerCase().includes(orderIdSearch.toLowerCase())
  );

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: any) => id ? String(id).substring(0, 8) : '-',
    },
    {
      title: '用户',
      key: 'user',
      width: 150,
      render: (_: any, record: Withdrawal) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.user?.username || record.user?.first_name || '未知'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {record.user?.telegram_id}
          </div>
          {(record.unique_id || record.user?.unique_id) && (
            <div style={{ fontSize: '12px', color: '#999' }}>
              UID: {record.unique_id || record.user?.unique_id}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '网络',
      key: 'network',
      width: 100,
      render: (_: any, record: Withdrawal) => (
        <span>{record.network_display || record.network_name || '-'}</span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount: number) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
          ${parseFloat(String(amount ?? 0)).toFixed(2)}
        </span>
      ),
    },
    {
      title: '钱包地址',
      dataIndex: 'wallet_address',
      key: 'wallet_address',
      ellipsis: true,
      render: (address: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{address}</span>
      ),
    },
    {
      title: '订单ID',
      dataIndex: 'order_id',
      key: 'order_id',
      width: 130,
      render: (order_id: string) => order_id ? (
        <span
          style={{ fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer', color: '#1677ff' }}
          onClick={() => { navigator.clipboard.writeText(order_id); message.success('已复制'); }}
          title="点击复制"
        >
          {order_id}
        </span>
      ) : '-',
    },
    {
      title: '用户余额',
      key: 'balance',
      width: 100,
      render: (_: any, record: Withdrawal) => (
        <span style={{ fontFamily: 'monospace' }}>
          ${record.user?.wallet_balance?.toFixed(2) || '0.00'}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
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
      width: 160,
      render: (date: string) => new Date(date).toISOString().slice(0, 19).replace('T', ' ') + ' UTC',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: Withdrawal) =>
        record.status === 'pending' ? (
          <Button
            type="primary"
            size="small"
            onClick={() => handleOpenReviewModal(record)}
          >
            审核
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>提现审核</h2>
        <p style={{ color: '#666', marginTop: 4 }}>审核和处理用户提现申请</p>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
        <Space wrap>
          <Select
            placeholder="筛选状态"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 150 }}
          >
            <Select.Option value="">全部</Select.Option>
            <Select.Option value="pending">待处理</Select.Option>
            <Select.Option value="approved">已批准</Select.Option>
            <Select.Option value="rejected">已拒绝</Select.Option>
            <Select.Option value="completed">已完成</Select.Option>
          </Select>
          <Input
            placeholder="按订单ID搜索"
            value={orderIdSearch}
            onChange={e => setOrderIdSearch(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          <Button onClick={fetchWithdrawals} icon={<ReloadOutlined />} loading={loading}>
            刷新
          </Button>
          <span style={{ color: '#999', fontSize: 12 }}>每30秒自动刷新</span>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredWithdrawals}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

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
            description="批准后将从用户余额中扣除相应金额"
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
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>用户</div>
              <div style={{ fontWeight: 500 }}>
                {selectedWithdrawal.user?.username || selectedWithdrawal.user?.first_name || '未知'} (
                {selectedWithdrawal.user?.telegram_id})
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>提现金额</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                ${parseFloat(String(selectedWithdrawal.amount ?? 0)).toFixed(2)}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>钱包地址</div>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
                {selectedWithdrawal.wallet_address}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#666', marginBottom: 4 }}>用户余额</div>
              <div style={{ fontFamily: 'monospace' }}>
                ${selectedWithdrawal.user?.wallet_balance?.toFixed(2) || '0.00'}
              </div>
            </div>
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
    </div>
  );
};
