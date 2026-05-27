import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, message, Tag, Space, DatePicker,
  Upload, Tabs, Popconfirm, Switch, Collapse,
} from 'antd';
import type { FormInstance } from 'antd';
import { PlusOutlined, TrophyOutlined, EyeOutlined, UploadOutlined, EditOutlined, DeleteOutlined, StopOutlined, TranslationOutlined, LoadingOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { apiClient } from '../services/api';

interface Auction {
  id: string;
  title: string;
  description?: string;
  description_i18n?: Record<string, string>;
  image_url?: string;
  product_value: number;
  participant_count: number;
  current_participants: number;
  per_person_cost: number;
  max_purchases_per_user: number;
  status: string;
  expires_at: string;
  winner_unique_id?: string;
  drawn_at?: string;
  preset_winner_unique_id?: string;
  show_in_mini_app?: boolean;
  created_at: string;
}

const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ar: 'العربية',
  ja: '日本語',
};

interface Participant {
  id: string;
  unique_id: string;
  quantity: number;
  is_winner?: boolean;
  created_at: string;
}

export const Auctions: React.FC = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [imageFileList, setImageFileList] = useState<UploadFile[]>([]);
  const [editImageFileList, setEditImageFileList] = useState<UploadFile[]>([]);
  const [pricePreview, setPricePreview] = useState<string | null>(null);
  const [translatingCreate, setTranslatingCreate] = useState(false);
  const [translatingEdit, setTranslatingEdit] = useState(false);
  const [createTranslations, setCreateTranslations] = useState<Record<string, string> | null>(null);
  const [editTranslations, setEditTranslations] = useState<Record<string, string> | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  useEffect(() => {
    fetchAuctions();
  }, []);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const result = await apiClient.getLuckyAuctions({ limit: 100 });
      setAuctions(result.data || []);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
      message.error('获取夺宝列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    form.resetFields();
    setImageFileList([]);
    setPricePreview(null);
    setCreateTranslations(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.expires_at) {
        values.expires_at = values.expires_at.toISOString();
      }
      if (values.product_value && values.participant_count) {
        values.per_person_cost = parseFloat((values.product_value / values.participant_count).toFixed(2));
      }
      if (createTranslations) values.description_i18n = createTranslations;
      values.platform_fee_percent = 30;
      values.winner_payout = parseFloat((values.product_value * 0.7).toFixed(2));

      await apiClient.createLuckyAuction(values);
      message.success('夺宝创建成功');
      setModalOpen(false);
      form.resetFields();
      setImageFileList([]);
      setPricePreview(null);
      setCreateTranslations(null);
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to create auction:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleOpenEdit = (auction: Auction) => {
    setSelectedAuction(auction);
    editForm.setFieldsValue({
      title: auction.title,
      description: auction.description,
      image_url: auction.image_url,
      max_purchases_per_user: auction.max_purchases_per_user,
      expires_at: auction.expires_at ? dayjs(auction.expires_at) : undefined,
      preset_winner_unique_id: auction.preset_winner_unique_id || '',
      description_i18n: auction.description_i18n || {},
    });
    setEditImageFileList([]);
    setEditTranslations(auction.description_i18n || null);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!selectedAuction) return;
    try {
      const values = await editForm.validateFields();
      if (values.expires_at) {
        values.expires_at = values.expires_at.toISOString();
      }
      if (editTranslations) values.description_i18n = editTranslations;
      await apiClient.updateLuckyAuction(selectedAuction.id, values);
      message.success('编辑成功');
      setEditModalOpen(false);
      editForm.resetFields();
      setEditImageFileList([]);
      setEditTranslations(null);
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to edit auction:', error);
      message.error(error.response?.data?.error || '编辑失败');
    }
  };

  const handleDelete = async (auction: Auction) => {
    try {
      await apiClient.deleteLuckyAuction(auction.id);
      message.success('删除成功');
      fetchAuctions();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleCancel = async (auction: Auction) => {
    try {
      await apiClient.cancelLuckyAuction(auction.id);
      message.success('已取消并退款给所有参与者');
      fetchAuctions();
    } catch (error: any) {
      message.error(error.response?.data?.error || '取消失败');
    }
  };

  const handleOpenDraw = (auction: Auction) => {
    setSelectedAuction(auction);
    setDrawModalOpen(true);
  };

  const handleDraw = async () => {
    if (!selectedAuction) return;
    setDrawing(true);
    try {
      const payload = selectedAuction.preset_winner_unique_id
        ? { preset_winner_unique_id: selectedAuction.preset_winner_unique_id }
        : {};
      await apiClient.drawLuckyAuction(selectedAuction.id, payload);
      message.success('开奖成功');
      setDrawModalOpen(false);
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to draw:', error);
      message.error(error.response?.data?.error || '开奖失败');
    } finally {
      setDrawing(false);
    }
  };

  const handleViewParticipants = async (auction: Auction) => {
    setSelectedAuction(auction);
    try {
      const response = await apiClient.getLuckyAuction(auction.id);
      setParticipants(response.data?.participants || []);
      setParticipantsModalOpen(true);
    } catch (error: any) {
      message.error('获取参与者失败');
    }
  };

  const handleToggleMiniAppDisplay = async (id: string, show: boolean) => {
    try {
      await apiClient.updateLuckyAuction(id, { show_in_mini_app: show });
      message.success(show ? '已设置展示开奖结果' : '已关闭展示开奖结果');
      fetchAuctions();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handlePriceChange = () => {
    const productValue = form.getFieldValue('product_value');
    const participantCount = form.getFieldValue('participant_count');
    if (productValue && participantCount && participantCount > 0) {
      const price = (productValue / participantCount).toFixed(2);
      setPricePreview(price);
    } else {
      setPricePreview(null);
    }
  };

  const handleTranslateCreate = async () => {
    const description = form.getFieldValue('description');
    if (!description?.trim()) {
      message.warning('请先输入描述');
      return;
    }
    setTranslatingCreate(true);
    try {
      const result = await apiClient.translateToSevenLanguages(description);
      const next = result.translations || {};
      setCreateTranslations(next);
      form.setFieldValue('description_i18n', next);
      message.success('描述翻译成功');
    } catch (error: any) {
      message.error(error.response?.data?.error || '翻译失败');
    } finally {
      setTranslatingCreate(false);
    }
  };

  const handleTranslateEdit = async () => {
    const description = editForm.getFieldValue('description');
    if (!description?.trim()) {
      message.warning('请先输入描述');
      return;
    }
    setTranslatingEdit(true);
    try {
      const result = await apiClient.translateToSevenLanguages(description);
      const next = result.translations || {};
      setEditTranslations(next);
      editForm.setFieldValue('description_i18n', next);
      message.success('描述翻译成功');
    } catch (error: any) {
      message.error(error.response?.data?.error || '翻译失败');
    } finally {
      setTranslatingEdit(false);
    }
  };

  const disabledDate = (current: dayjs.Dayjs) => current && current.isBefore(dayjs(), 'day');

  const disabledTime = (current: dayjs.Dayjs | null) => {
    if (!current || !current.isSame(dayjs(), 'day')) return {};
    const now = dayjs();
    return {
      disabledHours: () => Array.from({ length: now.hour() }, (_, i) => i),
      disabledMinutes: (hour: number) =>
        hour === now.hour() ? Array.from({ length: now.minute() + 1 }, (_, i) => i) : [],
    };
  };

  const filteredAuctions = activeTab === 'all'
    ? auctions
    : auctions.filter(a => a.status === activeTab);

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '藏品名称',
      dataIndex: 'title',
      key: 'title',
      width: 200,
    },
    {
      title: '总价值',
      dataIndex: 'product_value',
      key: 'product_value',
      width: 100,
      render: (v: number) => `$${parseFloat(String(v)).toFixed(2)}`,
    },
    {
      title: '每份价格',
      dataIndex: 'per_person_cost',
      key: 'per_person_cost',
      width: 100,
      render: (v: number) => `$${parseFloat(String(v)).toFixed(2)}`,
    },
    {
      title: '参与进度',
      key: 'progress',
      width: 120,
      render: (_: any, record: Auction) => (
        <div>
          <div>{record.current_participants} / {record.participant_count}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {record.participant_count > 0 ? ((record.current_participants / record.participant_count) * 100).toFixed(1) : 0}%
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string, record: Auction) => {
        const map: Record<string, { text: string; color: string }> = {
          active: { text: '进行中', color: 'green' },
          completed: { text: '已完成', color: 'purple' },
          expired: { text: '已过期', color: 'orange' },
          cancelled: { text: '已取消', color: 'red' },
        };
        const info = map[status] || { text: status, color: 'default' };
        return (
          <div>
            <Tag color={info.color}>{info.text}</Tag>
            {status === 'completed' && record.winner_unique_id && (
              <div style={{ fontSize: '11px', color: '#666', marginTop: 2 }}>
                🏆 {record.winner_unique_id}
              </div>
            )}
            {status === 'expired' && record.current_participants >= record.participant_count && (
              <Tag color="blue" style={{ marginTop: 2, fontSize: '11px' }}>满员</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '开奖时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 280,
      render: (_: any, record: Auction) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewParticipants(record)}
          >
            查看参与者
          </Button>
          {(['active', 'completed', 'expired'] as string[]).includes(record.status) && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            >
              编辑
            </Button>
          )}
          <Popconfirm
              title="确认删除该夺宝活动？此操作不可恢复！"
              onConfirm={() => handleDelete(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          {record.status === 'active' && (
            <Popconfirm
              title="取消后将退款给所有参与者，确认取消？"
              onConfirm={() => handleCancel(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<StopOutlined />}>
                取消
              </Button>
            </Popconfirm>
          )}
          {(record.status === 'active' || record.status === 'expired' || record.status === 'completed') && !record.winner_unique_id && (
            <Button
              type="primary"
              size="small"
              icon={<TrophyOutlined />}
              onClick={() => handleOpenDraw(record)}
            >
              开奖
            </Button>
          )}
          {(record.status === 'completed' || record.status === 'expired') && (
            <Space size={4}>
              <span style={{ fontSize: '12px', color: '#666' }}>展示开奖结果</span>
              <Switch
                size="small"
                checked={!!record.show_in_mini_app}
                onChange={(checked) => handleToggleMiniAppDisplay(record.id, checked)}
              />
            </Space>
          )}
        </Space>
      ),
    },
  ];

  const participantColumns = [
    { title: '用户ID', dataIndex: 'unique_id', key: 'unique_id' },
    { title: '购买份数', dataIndex: 'quantity', key: 'quantity' },
    {
      title: '获奖',
      dataIndex: 'is_winner',
      key: 'is_winner',
      render: (isWinner: boolean) => isWinner ? <Tag color="gold">🏆 获奖</Tag> : '-',
    },
    { title: '参与时间', dataIndex: 'created_at', key: 'created_at', render: (d: string) => new Date(d).toLocaleString('zh-CN') },
  ];

  const tabItems = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'completed', label: '已完成' },
    { key: 'expired', label: '已过期' },
    { key: 'cancelled', label: '已取消' },
  ];

  const imageUploadProps = (fileList: UploadFile[], setFileList: (fl: UploadFile[]) => void, fieldName: string, targetForm: FormInstance) => ({
    name: 'file',
    action: '/api/admin/auctions/upload-image',
    headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    listType: 'picture' as const,
    fileList,
    maxCount: 1,
    onChange: ({ fileList: fl, file }: any) => {
      setFileList(fl);
      if (file.status === 'done' && file.response?.url) {
        targetForm.setFieldValue(fieldName, file.response.url);
        message.success('图片上传成功');
      } else if (file.status === 'error') {
        message.error('图片上传失败');
      }
    },
    beforeUpload: (file: File) => {
      if (!file.type.startsWith('image/')) { message.error('只能上传图片文件'); return false; }
      if (file.size / 1024 / 1024 > 5) { message.error('图片大小不能超过5MB'); return false; }
      return true;
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>夺宝管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和管理夺宝活动（平台抽成30%，中奖者获得70%）</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenModal}>
          创建夺宝
        </Button>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginBottom: 8 }} />

      <Table
        columns={columns}
        dataSource={filteredAuctions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1300 }}
      />

      {/* Create Auction Modal */}
      <Modal
        title="创建夺宝"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); setPricePreview(null); setCreateTranslations(null); }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="藏品名称" rules={[{ required: true, message: '请输入藏品名称' }]}>
            <Input placeholder="例如：限量藏品 No.001" />
          </Form.Item>
          <Form.Item label="藏品图片（上传）">
            <Upload {...imageUploadProps(imageFileList, setImageFileList, 'image_url', form)}>
              <Button icon={<UploadOutlined />}>点击上传图片</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="image_url" label="藏品图片 URL（或直接填写）">
            <Input placeholder="https://example.com/image.jpg" />
          </Form.Item>
          <Form.Item
            name="product_value"
            label="藏品总价值 (USDT)"
            rules={[{ required: true, message: '请输入总价值' }]}
          >
            <InputNumber min={1} step={1} style={{ width: '100%' }} placeholder="1000" onChange={handlePriceChange} />
          </Form.Item>
          <Form.Item
            name="participant_count"
            label="总份数"
            rules={[{ required: true, message: '请输入总份数' }]}
            extra={
              pricePreview
                ? <span style={{ color: '#1677ff' }}>每份价格预览：<strong>${pricePreview} USDT</strong></span>
                : '填写总价值和总份数后自动预览每份价格'
            }
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="100" onChange={handlePriceChange} />
          </Form.Item>
          <Form.Item name="max_purchases_per_user" label="每人限购份数" initialValue={5}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expires_at" label="开奖时间" rules={[{ required: true, message: '请选择开奖时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} disabledDate={disabledDate} disabledTime={disabledTime} />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={3} placeholder="藏品说明..." />
          </Form.Item>
          <Form.Item label=" " colon={false}>
            <Button
              icon={translatingCreate ? <LoadingOutlined /> : <TranslationOutlined />}
              onClick={handleTranslateCreate}
              loading={translatingCreate}
            >
              翻译为7种语言
            </Button>
            {createTranslations && (
              <Collapse
                size="small"
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: 'create-translations',
                    label: '查看翻译预览',
                    children: (
                      <div>
                        {Object.entries(createTranslations).map(([lang, text]) => (
                          <div key={lang} style={{ marginBottom: 8 }}>
                            <Tag>{LANG_LABELS[lang] || lang}</Tag>
                            <span style={{ fontSize: 12, color: '#555' }}>{text}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </Form.Item>
          <Form.Item name="description_i18n" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="preset_winner_unique_id"
            label="预定中奖者 unique_id（可选）"
            extra="可选，留空则开奖时随机抽取"
          >
            <Input placeholder="例如：ABC1234" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Auction Modal */}
      <Modal
        title={`编辑夺宝 - ${selectedAuction?.title}`}
        open={editModalOpen}
        onOk={handleEditSubmit}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); setEditTranslations(null); }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="藏品名称" rules={[{ required: true, message: '请输入藏品名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="藏品图片（上传）">
            <Upload {...imageUploadProps(editImageFileList, setEditImageFileList, 'image_url', editForm)}>
              <Button icon={<UploadOutlined />}>点击上传图片</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="image_url" label="藏品图片 URL">
            <Input placeholder="https://example.com/image.jpg" />
          </Form.Item>
          {selectedAuction?.status !== 'completed' && selectedAuction?.status !== 'expired' && (
            <>
              <Form.Item name="max_purchases_per_user" label="每人限购份数">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="expires_at" label="开奖时间" rules={[{ required: true, message: '请选择开奖时间' }]}>
                <DatePicker showTime style={{ width: '100%' }} disabledDate={disabledDate} disabledTime={disabledTime} />
              </Form.Item>
              <Form.Item
                name="preset_winner_unique_id"
                label="预定中奖者 unique_id（可选）"
                extra="可选，留空则开奖时随机抽取"
              >
                <Input placeholder="例如：ABC1234" />
              </Form.Item>
            </>
          )}
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label=" " colon={false}>
            <Button
              icon={translatingEdit ? <LoadingOutlined /> : <TranslationOutlined />}
              onClick={handleTranslateEdit}
              loading={translatingEdit}
            >
              翻译为7种语言
            </Button>
            {editTranslations && (
              <Collapse
                size="small"
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: 'edit-translations',
                    label: '查看翻译预览',
                    children: (
                      <div>
                        {Object.entries(editTranslations).map(([lang, text]) => (
                          <div key={lang} style={{ marginBottom: 8 }}>
                            <Tag>{LANG_LABELS[lang] || lang}</Tag>
                            <span style={{ fontSize: 12, color: '#555' }}>{text}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </Form.Item>
          <Form.Item name="description_i18n" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Draw Modal */}
      <Modal
        title={`开奖 - ${selectedAuction?.title}`}
        open={drawModalOpen}
        onOk={handleDraw}
        onCancel={() => setDrawModalOpen(false)}
        okText={drawing ? '开奖中...' : '确认开奖'}
        cancelText="取消"
        confirmLoading={drawing}
      >
        {selectedAuction?.preset_winner_unique_id ? (
          <p>确认对「{selectedAuction?.title}」进行开奖？<br />
            <strong>预定中奖者：{selectedAuction.preset_winner_unique_id}</strong>（该用户须为参与者，否则自动随机抽取）
          </p>
        ) : (
          <p>确认对「{selectedAuction?.title}」进行系统随机开奖？</p>
        )}
      </Modal>

      {/* Participants Modal */}
      <Modal
        title={`参与者列表 - ${selectedAuction?.title} (${participants.length} 人)`}
        open={participantsModalOpen}
        onCancel={() => { setParticipantsModalOpen(false); setParticipants([]); }}
        footer={[<Button key="close" onClick={() => setParticipantsModalOpen(false)}>关闭</Button>]}
        width={700}
      >
        <Table
          columns={participantColumns}
          dataSource={participants}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};
