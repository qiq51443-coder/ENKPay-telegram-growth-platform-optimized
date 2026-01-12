import React, { useState, useEffect } from 'react';
import { Check, X, Eye } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Pagination } from '../components/Common/Pagination';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { ImagePreview } from '../components/Common/ImagePreview';
import apiClient from '../services/api';
import { Screenshot } from '../services/types';

export const Screenshots: React.FC = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const limit = 20;

  useEffect(() => {
    fetchScreenshots();
  }, [currentPage]);

  const fetchScreenshots = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getScreenshots({
        page: currentPage,
        limit,
        status: 'pending',
      });
      setScreenshots(response.screenshots || []);
      setTotalPages(response.pagination?.pages || 1);
    } catch (error) {
      console.error('Failed to fetch screenshots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedScreenshot) return;
    try {
      await apiClient.reviewScreenshot(selectedScreenshot.id, {
        status,
        admin_note: adminNote,
      });
      setReviewModalOpen(false);
      setSelectedScreenshot(null);
      setAdminNote('');
      fetchScreenshots();
    } catch (error) {
      console.error('Failed to review screenshot:', error);
      alert('审核失败');
    }
  };

  const openReviewModal = (screenshot: Screenshot) => {
    setSelectedScreenshot(screenshot);
    setReviewModalOpen(true);
  };

  const columns = [
    {
      key: 'user',
      title: '用户',
      render: (ss: Screenshot) => (
        <div>
          <p className="font-medium">{ss.user?.username || '未知'}</p>
          <p className="text-xs text-gray-500">ID: {ss.user?.telegram_id}</p>
        </div>
      ),
    },
    {
      key: 'group_id',
      title: '群组 ID',
      render: (ss: Screenshot) => <span className="font-mono">{ss.group_id}</span>,
    },
    {
      key: 'screenshot',
      title: '截图',
      render: () => (
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
      render: (ss: Screenshot) =>
        new Date(ss.created_at).toLocaleString('zh-CN'),
    },
    {
      key: 'actions',
      title: '操作',
      render: (ss: Screenshot) => (
        <Button
          variant="primary"
          className="text-xs py-1 px-2"
          onClick={() => openReviewModal(ss)}
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
          <h1 className="text-2xl font-bold text-gray-900">截图审核</h1>
          <p className="text-gray-600 mt-1">审核用户提交的收益截图</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={screenshots} loading={loading} />
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
            setSelectedScreenshot(null);
            setAdminNote('');
          }}
          title="审核截图"
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
                通过 (增加积分)
              </Button>
            </>
          }
        >
          {selectedScreenshot && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">用户</label>
                <p className="font-medium">
                  {selectedScreenshot.user?.username || '未知'} (
                  {selectedScreenshot.user?.telegram_id})
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-600">群组 ID</label>
                <p className="font-mono">{selectedScreenshot.group_id}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">消息 ID</label>
                <p className="font-mono">{selectedScreenshot.message_id}</p>
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
              <div className="bg-blue-50 p-3 rounded-md">
                <p className="text-sm text-blue-800">
                  审核通过后，用户将获得红包积分奖励
                </p>
              </div>
            </div>
          )}
        </Modal>

        {/* Image Preview */}
        {imagePreviewSrc && (
          <ImagePreview
            src={imagePreviewSrc}
            alt="User Screenshot"
            onClose={() => setImagePreviewSrc(null)}
          />
        )}
      </div>
    </Layout>
  );
};
