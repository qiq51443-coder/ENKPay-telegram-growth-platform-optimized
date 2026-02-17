import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Tag, Space, Select, InputNumber, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface TradingPair {
  id: string;
  symbol: string;
  name: string;
  pair_type: string;
  current_price?: number;
  price_change_24h?: number;
  external_symbol?: string;
  price_source?: string;
  custom_initial_price?: number;
  is_active: boolean;
  created_at: string;
}

export const TradingPairs: React.FC = () => {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('real');
  const [editingPair, setEditingPair] = useState<TradingPair | null>(null);
  const [realForm] = Form.useForm();
  const [customForm] = Form.useForm();
  const [editForm] = Form.useForm();

  useEffect(() => {
    fetchPairs();
  }, []);

  const fetchPairs = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getTradingPairs();
      setPairs(response.pairs || []);
    } catch (error) {
      console.error('Failed to fetch trading pairs:', error);
      message.error('获取交易对列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    realForm.resetFields();
    customForm.resetFields();
    setModalOpen(true);
  };

  const handleSubmitReal = async () => {
    try {
      const values = await realForm.validateFields();
      await apiClient.createRealPair(values);
      message.success('真实交易对创建成功');
      
      setModalOpen(false);
      realForm.resetFields();
      fetchPairs();
    } catch (error: any) {
      console.error('Failed to create real pair:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleSubmitCustom = async () => {
    try {
      const values = await customForm.validateFields();
      await apiClient.createCustomPair(values);
      message.success('自定义交易对创建成功');
      
      setModalOpen(false);
      customForm.resetFields();
      fetchPairs();
    } catch (error: any) {
      console.error('Failed to create custom pair:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleOpenEditModal = (pair: TradingPair) => {
    setEditingPair(pair);
    editForm.setFieldsValue(pair);
    setEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingPair) return;
    
    try {
      const values = await editForm.validateFields();
      await apiClient.updateTradingPair(editingPair.id, values);
      message.success('交易对更新成功');
      
      setEditModalOpen(false);
      setEditingPair(null);
      editForm.resetFields();
      fetchPairs();
    } catch (error: any) {
      console.error('Failed to update pair:', error);
      message.error(error.response?.data?.error || '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteTradingPair(id);
      message.success('交易对删除成功');
      fetchPairs();
    } catch (error: any) {
      console.error('Failed to delete pair:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      await apiClient.updateTradingPair(id, { is_active: !isActive });
      message.success(isActive ? '已禁用' : '已启用');
      fetchPairs();
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
      message.error(error.response?.data?.error || '操作失败');
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
      title: '交易对',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      render: (symbol: string) => (
        <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{symbol}</span>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'pair_type',
      key: 'pair_type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'real' ? 'blue' : 'purple'}>
          {type === 'real' ? '真实' : '自定义'}
        </Tag>
      ),
    },
    {
      title: '当前价格',
      dataIndex: 'current_price',
      key: 'current_price',
      width: 120,
      render: (price: number) => price ? (
        <span style={{ fontFamily: 'monospace' }}>${price.toFixed(4)}</span>
      ) : '-',
    },
    {
      title: '24h涨跌',
      dataIndex: 'price_change_24h',
      key: 'price_change_24h',
      width: 100,
      render: (change: number) => change !== undefined && change !== null ? (
        <span style={{ 
          color: change >= 0 ? '#52c41a' : '#ff4d4f',
          fontWeight: 'bold'
        }}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      ) : '-',
    },
    {
      title: '数据源',
      key: 'source',
      width: 120,
      render: (_: any, record: TradingPair) => {
        if (record.pair_type === 'real') {
          return <Tag color="green">{record.price_source || 'binance'}</Tag>;
        }
        return <Tag color="orange">自定义</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 250,
      render: (_: any, record: TradingPair) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEditModal(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleStatus(record.id, record.is_active)}
          >
            {record.is_active ? '禁用' : '启用'}
          </Button>
          <Popconfirm
            title="确定要删除这个交易对吗？"
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
          <h2 style={{ margin: 0 }}>交易币种管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理真实和自定义交易对</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenModal}>
          添加交易对
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={pairs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1300 }}
      />

      <Modal
        title="添加交易对"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          realForm.resetFields();
          customForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Tabs 
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'real',
              label: '真实币种',
              children: (
                <Form
                  form={realForm}
                  layout="vertical"
                  initialValues={{ price_source: 'binance' }}
                >
                  <Form.Item
                    name="symbol"
                    label="交易对符号"
                    rules={[{ required: true, message: '请输入交易对符号' }]}
                    tooltip="例如：BTCUSDT"
                  >
                    <Input placeholder="BTCUSDT" />
                  </Form.Item>

                  <Form.Item
                    name="name"
                    label="名称"
                    rules={[{ required: true, message: '请输入名称' }]}
                  >
                    <Input placeholder="比特币/USDT" />
                  </Form.Item>

                  <Form.Item
                    name="external_symbol"
                    label="外部符号"
                    tooltip="API 数据源使用的符号，如果不同的话"
                  >
                    <Input placeholder="留空则使用 symbol" />
                  </Form.Item>

                  <Form.Item
                    name="price_source"
                    label="数据源"
                    rules={[{ required: true, message: '请选择数据源' }]}
                  >
                    <Select>
                      <Select.Option value="binance">Binance</Select.Option>
                      <Select.Option value="coingecko">CoinGecko</Select.Option>
                    </Select>
                  </Form.Item>

                  <Form.Item>
                    <Space>
                      <Button onClick={() => setModalOpen(false)}>取消</Button>
                      <Button type="primary" onClick={handleSubmitReal}>创建</Button>
                    </Space>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'custom',
              label: '自定义币种',
              children: (
                <Form
                  form={customForm}
                  layout="vertical"
                >
                  <Form.Item
                    name="symbol"
                    label="交易对符号"
                    rules={[{ required: true, message: '请输入交易对符号' }]}
                    tooltip="例如：CUSTOMUSDT"
                  >
                    <Input placeholder="CUSTOMUSDT" />
                  </Form.Item>

                  <Form.Item
                    name="name"
                    label="名称"
                    rules={[{ required: true, message: '请输入名称' }]}
                  >
                    <Input placeholder="自定义币种/USDT" />
                  </Form.Item>

                  <Form.Item
                    name="custom_initial_price"
                    label="初始价格"
                    rules={[{ required: true, message: '请输入初始价格' }]}
                  >
                    <InputNumber min={0.0001} step={0.01} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    name="description"
                    label="描述"
                  >
                    <Input.TextArea rows={3} placeholder="币种描述" />
                  </Form.Item>

                  <Form.Item>
                    <Space>
                      <Button onClick={() => setModalOpen(false)}>取消</Button>
                      <Button type="primary" onClick={handleSubmitCustom}>创建</Button>
                    </Space>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title="编辑交易对"
        open={editModalOpen}
        onOk={handleUpdate}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingPair(null);
          editForm.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="状态"
          >
            <Select>
              <Select.Option value={true}>启用</Select.Option>
              <Select.Option value={false}>禁用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
