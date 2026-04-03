import React, { useEffect, useState } from 'react';
import {
  Table, Button, Drawer, Form, Input, InputNumber, message, Popconfirm, Tag, Space,
  Select, DatePicker, Switch, Radio, Upload, Modal, Progress, Collapse, Spin, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, TranslationOutlined,
  TeamOutlined, LoadingOutlined, ThunderboltOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { apiClient } from '../services/api';
import dayjs from 'dayjs';

function toNum(v: any): number {
  return parseFloat(v) || 0;
}

function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url;
  // Relative URL: try VITE_API_URL base first, fall back to window.location.origin
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined);
  if (apiBase) {
    return `${apiBase.replace(/\/api$/, '')}${url}`;
  }
  return `${window.location.origin}${url}`;
}

interface NFTProduct {
  id: number | string;
  category_id: string | null | undefined;
  name: string;
  description?: string | null;
  description_i18n?: Record<string, string> | null;
  image_url?: string | null;
  price: number;
  original_price?: number | null;
  stock: number;
  product_type: string | null;
  status: string | null;
  duration_days?: number | null;
  term_days?: number | null;
  daily_yield_rate?: number | null;
  rarity?: string | null;
  listing_time?: string | null;
  created_at: string | null;
  display_holders_count?: number | null;
  total_holders_count?: number | null;
  current_holders?: number | null;
  category?: { name: string };
}

interface NFTCategory {
  id: string;
  name: string;
}

interface Holder {
  holding_id: string;
  user_id: string;
  username: string;
  purchase_price: number;
  purchase_date: string;
  term_days: number;
  days_elapsed: number;
  status: string;
  expires_at?: string;
  total_income: number;
}

export const NFTProducts: React.FC = () => {
  const [products, setProducts] = useState<NFTProduct[]>([]);
  const [categories, setCategories] = useState<NFTCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<NFTProduct | null>(null);
  const [form] = Form.useForm();
  const dailyYieldRate = Form.useWatch('daily_yield_rate', form);
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('url');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageFileList, setImageFileList] = useState<import('antd/es/upload/interface').UploadFile[]>([]);

  // Translation state
  const [translating, setTranslating] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string> | null>(null);

  // Holders modal state
  const [holdersModalOpen, setHoldersModalOpen] = useState(false);
  const [holdersProduct, setHoldersProduct] = useState<NFTProduct | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [holdersTotal, setHoldersTotal] = useState(0);
  const [holdersLoading, setHoldersLoading] = useState(false);

  // Settle state
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleStatus, setSettleStatus] = useState<any>(null);
  const [settleStatusVisible, setSettleStatusVisible] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getNFTProducts();
      setProducts(response.data || response.products || []);
    } catch (error) {
      console.error('Failed to fetch NFT products:', error);
      message.error('获取产品列表失败');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await apiClient.getNFTCategories();
      setCategories(response.categories || response.data || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleOpenDrawer = (product?: NFTProduct) => {
    setTranslations(null);
    if (product) {
      setEditingProduct(product);
      const formValues = {
        ...product,
        listing_time: product.listing_time ? dayjs(product.listing_time) : undefined,
      };
      form.setFieldsValue(formValues);
      setImagePreview(product.image_url || '');
      // Intelligently infer imageMode: if the URL is a relative path it was uploaded, otherwise use URL mode
      const isAbsolute = product.image_url && (
        product.image_url.startsWith('http://') ||
        product.image_url.startsWith('https://') ||
        product.image_url.startsWith('//') ||
        product.image_url.startsWith('data:')
      );
      setImageMode(isAbsolute ? 'url' : 'upload');
      setImageFileList([]);
    } else {
      setEditingProduct(null);
      form.resetFields();
      setImagePreview('');
      setImageMode('url');
      setImageFileList([]);
    }
    setDrawerOpen(true);
  };

  const handleTranslate = async () => {
    const description = form.getFieldValue('description');
    if (!description) {
      message.warning('请先输入产品描述');
      return;
    }
    setTranslating(true);
    try {
      const response = await apiClient.translateNFTDescription(description, 'zh');
      setTranslations(response.data);
      form.setFieldValue('description_i18n', response.data);
      message.success('翻译成功');
    } catch (error) {
      message.error('翻译失败，请稍后重试');
    } finally {
      setTranslating(false);
    }
  };

  // Image upload is handled by the Ant Design Upload component via action prop

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // Ensure title is always set to keep it consistent with name
      if (!values.title) {
        values.title = values.name;
      }

      if (values.listing_time) {
        values.listing_time = values.listing_time.toISOString();
      }

      // Ensure daily_yield_rate is sent as a number or null (never undefined)
      if (values.daily_yield_rate === undefined || values.daily_yield_rate === null || values.daily_yield_rate === '') {
        values.daily_yield_rate = null;
      }

      if (imagePreview) {
        values.image_url = imagePreview;
      }

      if (translations) {
        values.description_i18n = translations;
      }

      if (editingProduct) {
        await apiClient.updateNFTProduct(String(editingProduct.id), values);
        message.success('产品更新成功');
      } else {
        await apiClient.createNFTProduct(values);
        message.success('产品创建成功');
      }

      setDrawerOpen(false);
      form.resetFields();
      setEditingProduct(null);
      setTranslations(null);
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to save product:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id: string | number) => {
    try {
      await apiClient.deleteNFTProduct(String(id));
      message.success('产品删除成功');
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleShowHolders = async (product: NFTProduct) => {
    setHoldersProduct(product);
    setHoldersModalOpen(true);
    setHoldersLoading(true);
    try {
      const response = await apiClient.getNFTProductHolders(String(product.id));
      setHolders(response.holders || []);
      setHoldersTotal(response.total || 0);
    } catch (error) {
      message.error('获取持有用户失败');
    } finally {
      setHoldersLoading(false);
    }
  };

  const handleCheckSettleStatus = async () => {
    try {
      const response = await apiClient.getNFTSettleStatus();
      setSettleStatus(response);
      setSettleStatusVisible(true);
    } catch (error) {
      message.error('获取结算状态失败');
    }
  };

  const handleTriggerSettle = async () => {
    setSettleLoading(true);
    try {
      await apiClient.triggerNFTSettle();
      message.success('结算任务已触发，请稍后查看结算状态');
      // Auto-refresh settle status after triggering
      const statusResponse = await apiClient.getNFTSettleStatus();
      setSettleStatus(statusResponse);
      setSettleStatusVisible(true);
    } catch (error: any) {
      message.error(error.response?.data?.error || '结算触发失败');
    } finally {
      setSettleLoading(false);
    }
  };

  const LANG_LABELS: Record<string, string> = {
    zh: '中文', en: 'English', ja: '日本語', ar: 'العربية',
    fr: 'Français', de: 'Deutsch', es: 'Español',
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string) => String(id ?? '').substring(0, 8),
    },
    {
      title: '封面',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 80,
      render: (url: string | null | undefined) => url ? (
        <img src={resolveImageUrl(url)} alt="cover" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
      ) : '-',
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '分类',
      key: 'category',
      width: 100,
      render: (_: any, record: NFTProduct) => record.category?.name || '-',
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: string | number, record: NFTProduct) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{toNum(price).toFixed(2)} USDT</div>
          {record.original_price && toNum(record.original_price) > toNum(price) && (
            <div style={{ fontSize: '12px', color: '#999', textDecoration: 'line-through' }}>
              {toNum(record.original_price).toFixed(2)} USDT
            </div>
          )}
        </div>
      ),
    },
    {
      title: '库存',
      dataIndex: 'stock',
      key: 'stock',
      width: 80,
    },
    {
      title: '持有人数',
      key: 'holders',
      width: 100,
      render: (_: any, record: NFTProduct) => {
        const total = record.total_holders_count ?? (
          (record.display_holders_count || 0) + (record.current_holders || 0)
        );
        return <span>{total.toLocaleString()}</span>;
      },
    },
    {
      title: '期限/日收益',
      key: 'term_yield',
      width: 110,
      render: (_: any, record: NFTProduct) => (
        <div>
          {record.term_days && <div>{record.term_days}天</div>}
          {record.daily_yield_rate && (
            <div style={{ color: '#52c41a', fontSize: '12px' }}>
              {(toNum(record.daily_yield_rate) * 100).toFixed(2)}%/天
            </div>
          )}
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'product_type',
      key: 'product_type',
      width: 100,
      render: (type: string | null | undefined) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          fixed_term: { text: '定期', color: 'blue' },
          instant: { text: '即时', color: 'green' },
          limited: { text: '限量', color: 'orange' },
        };
        const typeInfo = (type && typeMap[type]) || { text: type || '-', color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string | null | undefined) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '上架', color: 'green' },
          inactive: { text: '下架', color: 'red' },
          sold_out: { text: '售罄', color: 'default' },
        };
        const statusInfo = (status && statusMap[status]) || { text: status || '-', color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string | null | undefined) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: any, record: NFTProduct) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => handleShowHolders(record)}
          >
            持有用户
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenDrawer(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个产品吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const holderColumns = [
    {
      title: '用户',
      key: 'username',
      render: (_: any, record: Holder) => record.username,
    },
    {
      title: '购买金额',
      dataIndex: 'purchase_price',
      key: 'purchase_price',
      render: (v: string | number) => `${toNum(v).toFixed(2)} USDT`,
    },
    {
      title: '购买时间',
      dataIndex: 'purchase_date',
      key: 'purchase_date',
      render: (d: string) => new Date(d).toLocaleString('zh-CN'),
    },
    {
      title: '进度',
      key: 'progress',
      render: (_: any, record: Holder) => {
        if (!record.term_days) return '-';
        const pct = Math.min(100, Math.round((record.days_elapsed / record.term_days) * 100));
        return (
          <Tooltip title={`${record.days_elapsed}/${record.term_days} 天`}>
            <Progress percent={pct} size="small" />
          </Tooltip>
        );
      },
    },
    {
      title: '累计收益',
      dataIndex: 'total_income',
      key: 'total_income',
      render: (v: string | number) => `${toNum(v).toFixed(4)} USDT`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        const map: Record<string, { text: string; color: string }> = {
          active: { text: '持有中', color: 'green' },
          expired: { text: '已到期', color: 'default' },
        };
        const info = map[s] || { text: s, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>NFT 产品管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理 NFT 产品和库存</p>
        </div>
        <Space>
          <Button icon={<CheckCircleOutlined />} onClick={handleCheckSettleStatus}>
            查看结算状态
          </Button>
          <Popconfirm
            title="手动结算收益"
            description="确认触发今日 NFT 收益结算？已结算用户将不会重复结算。"
            onConfirm={handleTriggerSettle}
            okText="确认结算"
            cancelText="取消"
          >
            <Button type="primary" icon={<ThunderboltOutlined />} loading={settleLoading}>
              手动结算收益
            </Button>
          </Popconfirm>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenDrawer()}>
            添加产品
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={products}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1600 }}
      />

      {/* Product Create/Edit Drawer */}
      <Drawer
        title={editingProduct ? '编辑产品' : '添加产品'}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          form.resetFields();
          setEditingProduct(null);
          setTranslations(null);
        }}
        width={640}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDrawerOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleSubmit}>保存</Button>
            </Space>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            product_type: 'instant',
            status: 'active',
            stock: 0,
            price: 0,
            display_holders_count: 0,
          }}
        >
          <Form.Item name="category_id" label="分类（可选）">
            <Select placeholder="选择分类（可不选）" allowClear>
              {categories.map(cat => (
                <Select.Option key={cat.id} value={cat.id}>{cat.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="产品名称"
            rules={[{ required: true, message: '请输入产品名称' }]}
          >
            <Input placeholder="例如：限量版数字艺术品" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="产品描述（支持翻译为7种语言）" />
          </Form.Item>

          <Form.Item label=" " colon={false}>
            <Button
              icon={translating ? <LoadingOutlined /> : <TranslationOutlined />}
              onClick={handleTranslate}
              loading={translating}
            >
              翻译为7种语言
            </Button>
            {translations && (
              <Collapse
                size="small"
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: '1',
                    label: '查看翻译预览',
                    children: (
                      <div>
                        {Object.entries(translations).map(([lang, text]) => (
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

          {/* Hidden field to hold description_i18n */}
          <Form.Item name="description_i18n" hidden>
            <Input />
          </Form.Item>

          <Form.Item label="封面图">
            <Radio.Group
              value={imageMode}
              onChange={e => {
                setImageMode(e.target.value);
                setImagePreview('');
                setImageFileList([]);
                form.setFieldValue('image_url', '');
              }}
              style={{ marginBottom: 8 }}
            >
              <Radio.Button value="url">输入URL</Radio.Button>
              <Radio.Button value="upload">上传图片</Radio.Button>
            </Radio.Group>
            {imageMode === 'upload' ? (
              <div>
                <Upload
                  name="file"
                  action="/api/nft/upload"
                  headers={{ Authorization: `Bearer ${localStorage.getItem('token') || ''}` }}
                  accept="image/*"
                  listType="picture"
                  fileList={imageFileList}
                  maxCount={1}
                  onChange={({ fileList, file }) => {
                    setImageFileList(fileList);
                    if (file.status === 'done' && file.response?.url) {
                      setImagePreview(file.response.url);
                      form.setFieldValue('image_url', file.response.url);
                      message.success('图片上传成功');
                    } else if (file.status === 'error') {
                      message.error('图片上传失败');
                    }
                  }}
                  beforeUpload={(file) => {
                    const isImage = file.type.startsWith('image/');
                    if (!isImage) { message.error('只能上传图片文件'); return false; }
                    return true;
                  }}
                >
                  <Button icon={<UploadOutlined />}>点击上传图片</Button>
                </Upload>
                {imagePreview && imageFileList.length === 0 && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={resolveImageUrl(imagePreview)}
                      alt="预览"
                      style={{ maxWidth: 200, maxHeight: 200, objectFit: 'cover', borderRadius: 4 }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <Form.Item
                name="image_url"
                noStyle
                rules={[{ required: imageMode === 'url', message: '请输入封面图 URL' }]}
              >
                <Input
                  placeholder="https://example.com/image.png"
                  onChange={e => setImagePreview(e.target.value)}
                />
              </Form.Item>
            )}
            {imageMode === 'url' && imagePreview && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={resolveImageUrl(imagePreview)}
                  alt="预览"
                  style={{ maxWidth: 200, maxHeight: 200, objectFit: 'cover', borderRadius: 4 }}
                  onError={() => setImagePreview('')}
                />
              </div>
            )}
          </Form.Item>

          <Form.Item
            name="price"
            label="价格 (USDT)"
            rules={[{ required: true, message: '请输入价格' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="original_price" label="原价 (USDT)">
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="stock"
            label="库存"
            rules={[{ required: true, message: '请输入库存' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="display_holders_count"
            label="虚显持有人数"
            tooltip="管理员设置的虚显人数，实际持有人数会自动叠加在此基础上"
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>

          <Form.Item
            name="product_type"
            label="产品类型"
            rules={[{ required: true, message: '请选择产品类型' }]}
          >
            <Select>
              <Select.Option value="fixed_term">定期产品</Select.Option>
              <Select.Option value="instant">即时产品</Select.Option>
              <Select.Option value="limited">限量产品</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.product_type !== cur.product_type}
          >
            {({ getFieldValue }) => getFieldValue('product_type') === 'fixed_term' && (
              <>
                <Form.Item
                  name="settlement_type"
                  label="结算方式"
                  rules={[{ required: true, message: '请选择结算方式' }]}
                >
                  <Select placeholder="选择结算方式">
                    <Select.Option value="daily">每日结算</Select.Option>
                    <Select.Option value="expiry">到期结算</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  name="settlement_description"
                  label="结算说明"
                  tooltip="描述收益结算规则"
                >
                  <Input.TextArea rows={2} placeholder="例如：每日自动结算收益到账户余额" />
                </Form.Item>

                <Form.Item
                  name="duration_days"
                  label="锁定期限（天）"
                  rules={[{ required: true, message: '请输入锁定期限' }]}
                >
                  <InputNumber min={1} style={{ width: '100%' }} addonAfter="天" />
                </Form.Item>

                <Form.Item
                  name="term_days"
                  label="定期期限（天）"
                  tooltip="定期产品持有天数，如 30"
                >
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="30" addonAfter="天" />
                </Form.Item>

                <Form.Item
                  name="daily_yield_rate"
                  label="日收益率"
                  tooltip="小数，如 0.005 = 0.5%/天"
                  rules={[{ type: 'number', min: 0, max: 1, message: '请输入 0 到 1 之间的数值（如 0.01 表示 1%/天）' }]}
                >
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.0001}
                    precision={4}
                    style={{ width: '100%' }}
                    placeholder="0.005"
                    addonAfter={
                      dailyYieldRate !== undefined && dailyYieldRate !== null
                        ? `= ${(toNum(dailyYieldRate) * 100).toFixed(4)}%/天`
                        : '%/天'
                    }
                  />
                </Form.Item>

                <Form.Item
                  name="max_holders"
                  label="总量上限（最多可购人数）"
                >
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="100" />
                </Form.Item>

                <Form.Item
                  name="is_purchase_limited"
                  label="是否限购"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="限购" unCheckedChildren="不限" />
                </Form.Item>

                <Form.Item
                  noStyle
                  shouldUpdate={(prev, cur) => prev.is_purchase_limited !== cur.is_purchase_limited}
                >
                  {({ getFieldValue: innerGetFieldValue }) => innerGetFieldValue('is_purchase_limited') ? (
                    <Form.Item name="max_purchases_per_user" label="每人限购次数">
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                    </Form.Item>
                  ) : null}
                </Form.Item>
              </>
            )}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.product_type !== cur.product_type}
          >
            {({ getFieldValue }) => getFieldValue('product_type') !== 'fixed_term' && (
              <>
                <Form.Item
                  name="duration_days"
                  label="锁定期限 (天)"
                  tooltip="仅定期产品需要"
                >
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="term_days"
                  label="定期期限 (天)"
                  tooltip="定期产品持有天数，如 30"
                >
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="30" />
                </Form.Item>

                <Form.Item
                  name="daily_yield_rate"
                  label="日收益率 (小数，如 0.005 = 0.5%/天)"
                  rules={[{ type: 'number', min: 0, max: 1, message: '请输入 0 到 1 之间的数值（如 0.01 表示 1%/天）' }]}
                >
                  <InputNumber
                    min={0}
                    max={1}
                    step={0.0001}
                    precision={4}
                    style={{ width: '100%' }}
                    placeholder="0.005"
                    addonAfter={
                      dailyYieldRate !== undefined && dailyYieldRate !== null
                        ? `= ${(toNum(dailyYieldRate) * 100).toFixed(4)}%/天`
                        : '%/天'
                    }
                  />
                </Form.Item>

                <Form.Item name="max_holders" label="总量上限 (最多可购人数)">
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="100" />
                </Form.Item>

                <Form.Item name="is_purchase_limited" label="是否限购" valuePropName="checked">
                  <Switch checkedChildren="限购" unCheckedChildren="不限" />
                </Form.Item>

                <Form.Item
                  noStyle
                  shouldUpdate={(prev, cur) => prev.is_purchase_limited !== cur.is_purchase_limited}
                >
                  {({ getFieldValue: innerGetFieldValue }) => innerGetFieldValue('is_purchase_limited') ? (
                    <Form.Item name="max_purchases_per_user" label="每人限购次数">
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                    </Form.Item>
                  ) : null}
                </Form.Item>
              </>
            )}
          </Form.Item>

          <Form.Item name="rarity" label="稀有度">
            <Select allowClear>
              <Select.Option value="common">普通</Select.Option>
              <Select.Option value="rare">稀有</Select.Option>
              <Select.Option value="epic">史诗</Select.Option>
              <Select.Option value="legendary">传说</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="listing_time" label="上架时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select>
              <Select.Option value="active">上架</Select.Option>
              <Select.Option value="inactive">下架</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Drawer>

      {/* Holders Modal */}
      <Modal
        title={`持有用户 — ${holdersProduct?.name || ''}`}
        open={holdersModalOpen}
        onCancel={() => setHoldersModalOpen(false)}
        footer={null}
        width={800}
      >
        {holdersLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12, color: '#666' }}>
              共 <strong>{holdersTotal}</strong> 名用户正在持有
            </div>
            <Table
              columns={holderColumns}
              dataSource={holders}
              rowKey="holding_id"
              pagination={{ pageSize: 10 }}
              size="small"
            />
          </>
        )}
      </Modal>

      {/* Settle Status Modal */}
      <Modal
        title="结算状态"
        open={settleStatusVisible}
        onCancel={() => setSettleStatusVisible(false)}
        footer={<Button onClick={() => setSettleStatusVisible(false)}>关闭</Button>}
        width={800}
      >
        {settleStatus && (
          <>
            <div style={{ marginBottom: 16, display: 'flex', gap: 24 }}>
              <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 20px' }}>
                <div style={{ color: '#52c41a', fontWeight: 600, fontSize: 24 }}>{settleStatus.today_settled_count ?? 0}</div>
                <div style={{ color: '#666', fontSize: 12 }}>今日已结算笔数</div>
              </div>
              <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 8, padding: '12px 20px' }}>
                <div style={{ color: '#1890ff', fontWeight: 600, fontSize: 16 }}>{settleStatus.today_utc}</div>
                <div style={{ color: '#666', fontSize: 12 }}>当前 UTC 日期</div>
              </div>
            </div>
            {settleStatus.today_users && settleStatus.today_users.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#333' }}>今日结算用户</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {settleStatus.today_users.map((u: { user_id: string | number; displayName: string }) => (
                    <span
                      key={u.user_id}
                      style={{
                        background: '#f0f5ff',
                        border: '1px solid #adc6ff',
                        borderRadius: 4,
                        padding: '2px 10px',
                        fontSize: 13,
                        color: '#2f54eb',
                      }}
                    >
                      {u.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Table
              size="small"
              pagination={{ pageSize: 10 }}
              dataSource={settleStatus.recent_records || []}
              rowKey="id"
              columns={[
                { title: '产品', dataIndex: 'product_name', key: 'product_name' },
                { title: '用户', key: 'user', render: (_: any, record: any) => record.display_name || record.username || '-' },
                { title: '金额 (USDT)', dataIndex: 'amount', key: 'amount', render: (v: any) => `+${parseFloat(v).toFixed(4)}` },
                { title: '收益日期', dataIndex: 'income_date', key: 'income_date' },
                { title: '结算时间', dataIndex: 'created_at', key: 'created_at', render: (d: string) => new Date(d).toLocaleString('zh-CN') },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
};
