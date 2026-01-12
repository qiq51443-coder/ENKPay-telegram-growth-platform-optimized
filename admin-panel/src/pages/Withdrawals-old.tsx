import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Pagination } from '../components/Common/Pagination';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import apiClient from '../services/api';
import { Withdrawal } from '../services/types';

export const Withdrawals: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const limit = 20;

  useEffect(() => {
    fetchWithdrawals();
  }, [currentPage]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getWithdrawals({
        page: currentPage,
        limit,
        status: 'pending',
      });
      setWithdrawals(response.withdrawals || []);
      setTotalPages(response.pagination?.pages || 1);
    } catch (error) {
      console.error('Failed to fetch withdrawals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedWithdrawal) return;
    try {
      await apiClient.reviewWithdrawal(selectedWithdrawal.id, {
        status,
        admin_note: adminNote,
      });
      setReviewModalOpen(false);
      setSelectedWithdrawal(null);
      setAdminNote('');
      fetchWithdrawals();
    } catch (error) {
      console.error('Failed to review withdrawal:', error);
      alert('审核失败');
    }
  };

  const openReviewModal = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setReviewModalOpen(true);
  };

  const columns = [
    {
      key: 'user',
      title: '用户',
      render: (wd: Withdrawal) => (
        <div>
          <p className="font-medium">{wd.user?.username || '未知'}</p>
          <p className="text-xs text-gray-500">ID: {wd.user?.telegram_id}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      title: '金额',
      render: (wd: Withdrawal) => (
        <span className="font-mono font-semibold">${wd.amount.toFixed(2)}</span>
      ),
    },
    {
      key: 'wallet_address',
      title: '钱包地址',
      render: (wd: Withdrawal) => (
        <span className="font-mono text-xs">{wd.wallet_address}</span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (wd: Withdrawal) => {
        const statusMap = {
          pending: { text: '待处理', color: 'bg-yellow-100 text-yellow-800' },
          approved: { text: '已批准', color: 'bg-blue-100 text-blue-800' },
          rejected: { text: '已拒绝', color: 'bg-red-100 text-red-800' },
          completed: { text: '已完成', color: 'bg-green-100 text-green-800' },
        };
        const status = statusMap[wd.status];
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${status.color}`}>
            {status.text}
          </span>
        );
      },
    },
    {
      key: 'created_at',
      title: '申请时间',
      render: (wd: Withdrawal) => new Date(wd.created_at).toLocaleString('zh-CN'),
    },
    {
      key: 'actions',
      title: '操作',
      render: (wd: Withdrawal) =>
        wd.status === 'pending' ? (
          <Button
            variant="primary"
            className="text-xs py-1 px-2"
            onClick={() => openReviewModal(wd)}
          >
            审核
          </Button>
        ) : null,
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">提现管理</h1>
          <p className="text-gray-600 mt-1">审核和处理用户提现申请</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={withdrawals} loading={loading} />
          {totalPages > 1 && (
            <div className="p-4 border-t">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>

        {/* Review Modal */}
        <Modal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
            setSelectedWithdrawal(null);
            setAdminNote('');
          }}
          title="审核提现申请"
          footer={
            <>
              <Button variant="danger" onClick={() => handleReview('rejected')}>
                <X className="w-4 h-4 mr-2" />
                拒绝
              </Button>
              <Button variant="success" onClick={() => handleReview('approved')}>
                <Check className="w-4 h-4 mr-2" />
                批准
              </Button>
            </>
          }
        >
          {selectedWithdrawal && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">用户</label>
                <p className="font-medium">
                  {selectedWithdrawal.user?.username || '未知'} (
                  {selectedWithdrawal.user?.telegram_id})
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">提现金额</label>
                <p className="font-mono text-lg font-bold">
                  ${selectedWithdrawal.amount.toFixed(2)}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">钱包地址</label>
                <p className="font-mono text-sm break-all">
                  {selectedWithdrawal.wallet_address}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">用户余额</label>
                <p className="font-mono">${selectedWithdrawal.user?.balance || 0}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  审核备注 (可选)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                  placeholder="输入审核备注..."
                />
              </div>
              <div className="bg-yellow-50 p-3 rounded-md">
                <p className="text-sm text-yellow-800">
                  批准后，系统将从用户余额中扣除相应金额
                </p>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </Layout>
  );
};
