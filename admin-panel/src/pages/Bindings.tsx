import React, { useState, useEffect } from 'react';
import { Check, X, Eye } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Pagination } from '../components/Common/Pagination';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { ImagePreview } from '../components/Common/ImagePreview';
import apiClient from '../services/api';
import { Binding } from '../services/types';

export const Bindings: React.FC = () => {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedBinding, setSelectedBinding] = useState<Binding | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const limit = 20;

  useEffect(() => {
    fetchBindings();
  }, [currentPage]);

  const fetchBindings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getBindings({
        page: currentPage,
        limit,
        status: 'pending',
      });
      setBindings(response.bindings || []);
      setTotalPages(response.pagination?.pages || 1);
    } catch (error) {
      console.error('Failed to fetch bindings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedBinding) return;
    try {
      await apiClient.reviewBinding(selectedBinding.id, {
        status,
        admin_note: adminNote,
      });
      setReviewModalOpen(false);
      setSelectedBinding(null);
      setAdminNote('');
      fetchBindings();
    } catch (error) {
      console.error('Failed to review binding:', error);
      alert('审核失败');
    }
  };

  const openReviewModal = (binding: Binding) => {
    setSelectedBinding(binding);
    setReviewModalOpen(true);
  };

  const columns = [
    {
      key: 'user',
      title: '用户',
      render: (binding: Binding) => (
        <div>
          <p className="font-medium">{binding.user?.username || '未知'}</p>
          <p className="text-xs text-gray-500">ID: {binding.user?.telegram_id}</p>
        </div>
      ),
    },
    {
      key: 'platform_username',
      title: '平台用户名',
      render: (binding: Binding) => binding.platform_username,
    },
    {
      key: 'screenshot',
      title: '截图',
      render: (binding: Binding) => (
        <Button
          variant="secondary"
          className="text-xs py-1 px-2"
          onClick={() => {
            // In a real app, you'd get the actual image URL from Telegram
            setImagePreviewSrc(`https://via.placeholder.com/800x600?text=Screenshot`);
          }}
        >
          <Eye className="w-3 h-3 mr-1" />
          查看
        </Button>
      ),
    },
    {
      key: 'created_at',
      title: '提交时间',
      render: (binding: Binding) =>
        new Date(binding.created_at).toLocaleString('zh-CN'),
    },
    {
      key: 'actions',
      title: '操作',
      render: (binding: Binding) => (
        <Button
          variant="primary"
          className="text-xs py-1 px-2"
          onClick={() => openReviewModal(binding)}
        >
          审核
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">绑定审核</h1>
          <p className="text-gray-600 mt-1">审核用户平台绑定申请</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={bindings} loading={loading} />
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
            setSelectedBinding(null);
            setAdminNote('');
          }}
          title="审核绑定申请"
          footer={
            <>
              <Button
                variant="danger"
                onClick={() => handleReview('rejected')}
              >
                <X className="w-4 h-4 mr-2" />
                拒绝
              </Button>
              <Button
                variant="success"
                onClick={() => handleReview('approved')}
              >
                <Check className="w-4 h-4 mr-2" />
                通过
              </Button>
            </>
          }
        >
          {selectedBinding && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">用户</label>
                <p className="font-medium">
                  {selectedBinding.user?.username || '未知'} (
                  {selectedBinding.user?.telegram_id})
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">平台用户名</label>
                <p className="font-medium">{selectedBinding.platform_username}</p>
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
            </div>
          )}
        </Modal>

        {/* Image Preview */}
        {imagePreviewSrc && (
          <ImagePreview
            src={imagePreviewSrc}
            alt="Binding Screenshot"
            onClose={() => setImagePreviewSrc(null)}
          />
        )}
      </div>
    </Layout>
  );
};
