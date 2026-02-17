import React, { useEffect, useState } from 'react';
import { Table, Button, Drawer, Form, Input, InputNumber, message, Popconfirm, Tag, Space, Select, DatePicker } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';
import dayjs from 'dayjs';

interface NFTProduct {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  original_price?: number;
  stock: number;
  product_type: string;
  status: string;
  duration_days?: number;
  annual_yield_rate?: number;
  attributes?: any;
  rarity?: string;
  listing_time?: string;
  created_at: string;
  category?: {
    name: string;
  };
}

interface NFTCategory {
  id: string;
  name: string;
}

export const NFTProducts: React.FC = () => {
  const [products, setProducts] = useState<NFTProduct[]>([]);
  const [categories, setCategories] = useState<NFTCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<NFTProduct | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getNFTProducts();
      setProducts(response.products || []);
    } catch (error) {
      console.error('Failed to fetch NFT products:', error);
      message.error('获取产品列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await apiClient.getNFTCategories();
      setCategories(response.categories || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleOpenDrawer = (product?: NFTProduct) => {
    if (product) {
      setEditingProduct(product);
      const formValues = {
        ...product,
        listing_time: product.listing_time ? dayjs(product.listing_time) : undefined,
      };
      form.setFieldsValue(formValues);
    } else {
      setEditingProduct(null);
      form.resetFields();
    }
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Convert listing_time to ISO string if present
      if (values.listing_time) {
        values.listing_time = values.listing_time.toISOString();
      }
      
      if (editingProduct) {
        await apiClient.updateNFTProduct(editingProduct.id, values);
        message.success('产品更新成功');
      } else {
        await apiClient.createNFTProduct(values);
        message.success('产品创建成功');
      }
      
      setDrawerOpen(false);
      form.resetFields();
      setEditingProduct(null);
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to save product:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteNFTProduct(id);
      message.success('产品删除成功');
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '封面',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 80,
      render: (url: string) => url ? (
        <img src={url} alt="cover" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
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
      render: (price: number, record: NFTProduct) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{price.toFixed(2)} USDT</div>
          {record.original_price && record.original_price > price && (
            <div style={{ fontSize: '12px', color: '#999', textDecoration: 'line-through' }}>
              {record.original_price.toFixed(2)} USDT
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
      title: '类型',
      dataIndex: 'product_type',
      key: 'product_type',
      width: 100,
      render: (type: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          fixed_term: { text: '定期', color: 'blue' },
          instant: { text: '即时', color: 'green' },
          limited: { text: '限量', color: 'orange' },
        };
        const typeInfo = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '上架', color: 'green' },
          inactive: { text: '下架', color: 'red' },
          sold_out: { text: '售罄', color: 'default' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: NFTProduct) => (
        <Space>
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>NFT 产品管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理 NFT 产品和库存</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenDrawer()}>
          添加产品
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={products}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1400 }}
      />

      <Drawer
        title={editingProduct ? '编辑产品' : '添加产品'}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          form.resetFields();
          setEditingProduct(null);
        }}
        width={600}
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
            price: 0
          }}
        >
          <Form.Item
            name="category_id"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="选择分类">
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

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea rows={3} placeholder="产品描述" />
          </Form.Item>

          <Form.Item
            name="image_url"
            label="封面图 URL"
            rules={[{ required: true, message: '请输入封面图 URL' }]}
          >
            <Input placeholder="https://example.com/image.png" />
          </Form.Item>

          <Form.Item
            name="price"
            label="价格 (USDT)"
            rules={[{ required: true, message: '请输入价格' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="original_price"
            label="原价 (USDT)"
          >
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
            name="duration_days"
            label="锁定期限 (天)"
            tooltip="仅定期产品需要"
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="annual_yield_rate"
            label="年化收益率 (%)"
            tooltip="仅定期产品需要"
          >
            <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="rarity"
            label="稀有度"
          >
            <Select allowClear>
              <Select.Option value="common">普通</Select.Option>
              <Select.Option value="rare">稀有</Select.Option>
              <Select.Option value="epic">史诗</Select.Option>
              <Select.Option value="legendary">传说</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="listing_time"
            label="上架时间"
          >
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

          <Form.Item
            name="attributes"
            label="属性 (JSON)"
            tooltip='例如: {"artist": "张三", "edition": "1/100"}'
          >
            <Input.TextArea rows={2} placeholder='{"key": "value"}' />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};
