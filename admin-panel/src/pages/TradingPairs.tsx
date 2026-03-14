import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Tag, Space, Select, InputNumber, Tabs, Input as AntInput, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, SyncOutlined, SearchOutlined } from '@ant-design/icons';
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

interface SymbolLibraryItem {
  symbol: string;
  base_asset: string;
  quote_asset: string;
  display_name?: string;
  status?: string;
}

export const TradingPairs: React.FC = () => {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('real');
  const [realSubTab, setRealSubTab] = useState('manual');
  const [editingPair, setEditingPair] = useState<TradingPair | null>(null);
  const [realForm] = Form.useForm();
  const [customForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Symbol library state
  const [libraryData, setLibraryData] = useState<SymbolLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedLibrarySymbols, setSelectedLibrarySymbols] = useState<string[]>([]);
  const [addingFromLibrary, setAddingFromLibrary] = useState(false);

  useEffect(() => {
    fetchPairs();
  }, []);

  const fetchPairs = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const response = await apiClient.getTradingPairs();
      // response is already response.data = { success, data, pagination }
      const list = response?.data ?? response;
      setPairs(Array.isArray(list) ? list : []);
    } catch (error: any) {
      console.error('Failed to fetch trading pairs:', error);
      const errMsg = error.response?.data?.error || error.message || '未知错误';
      setFetchError(errMsg);
      message.error(`获取交易对列表失败: ${errMsg}`);
      setPairs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSymbolLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const response = await apiClient.getSymbolLibrary({ limit: 500 });
      const list = response?.data ?? response;
      setLibraryData(Array.isArray(list) ? list : []);
    } catch (error: any) {
      console.error('Failed to fetch symbol library:', error);
      message.warning('获取币安币种库失败，可手动输入交易对');
      setLibraryData([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const handleSyncLibrary = async () => {
    setLibrarySyncing(true);
    try {
      const response = await apiClient.syncSymbolLibrary();
      message.success(`同步成功，共 ${response.count || 0} 个币种`);
      await fetchSymbolLibrary();
    } catch (error: any) {
      message.error(error.response?.data?.error || '同步失败');
    } finally {
      setLibrarySyncing(false);
    }
  };

  const handleAddFromLibrary = async () => {
    if (selectedLibrarySymbols.length === 0) {
      message.warning('请先选择币种');
      return;
    }
    setAddingFromLibrary(true);
    try {
      const response = await apiClient.addPairsFromLibrary(selectedLibrarySymbols);
      const added = response.added?.length || 0;
      const skipped = response.skipped?.length || 0;
      const errors = response.errors?.length || 0;
      if (errors > 0) {
        message.warning(`成功添加 ${added} 个，跳过 ${skipped} 个（已存在），失败 ${errors} 个`);
      } else {
        message.success(`成功添加 ${added} 个，跳过 ${skipped} 个（已存在）`);
      }
      setSelectedLibrarySymbols([]);
      setModalOpen(false);
      fetchPairs();
    } catch (error: any) {
      message.error(error.response?.data?.error || '批量添加失败');
    } finally {
      setAddingFromLibrary(false);
    }
  };

  const handleOpenModal = () => {
    realForm.resetFields();
    customForm.resetFields();
    setSelectedLibrarySymbols([]);
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
      const { name, custom_initial_price, ...rest } = values;
      await apiClient.createCustomPair({
        ...rest,
        display_name: name,
        initial_price: custom_initial_price,
      });
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
      await apiClient.toggleTradingPair(id);
      message.success(isActive ? '已禁用' : '已启用');
      fetchPairs();
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const filteredLibrary = libraryData.filter(item =>
    item.symbol.toLowerCase().includes(librarySearch.toLowerCase()) ||
    (item.display_name || '').toLowerCase().includes(librarySearch.toLowerCase())
  );

  const libraryColumns = [
    {
      title: '币种',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol: string) => <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{symbol}</span>,
    },
    {
      title: '基础资产',
      dataIndex: 'base_asset',
      key: 'base_asset',
    },
    {
      title: '计价资产',
      dataIndex: 'quote_asset',
      key: 'quote_asset',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'TRADING' ? 'green' : 'default'}>{status || '-'}</Tag>
      ),
    },
  ];

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: any) => String(id ?? '').substring(0, 8),
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
      render: (price: number) => price != null ? (
        <span style={{ fontFamily: 'monospace' }}>${Number(price).toFixed(4)}</span>
      ) : '-',
    },
    {
      title: '24h涨跌',
      dataIndex: 'price_change_24h',
      key: 'price_change_24h',
      width: 100,
      render: (change: number) => change !== undefined && change !== null ? (
        <span style={{ 
          color: Number(change) >= 0 ? '#52c41a' : '#ff4d4f',
          fontWeight: 'bold'
        }}>
          {Number(change) >= 0 ? '+' : ''}{Number(change).toFixed(2)}%
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

  if (fetchError && pairs.length === 0 && !loading) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="加载交易对失败"
          description={fetchError}
          showIcon
          action={
            <Button size="small" onClick={fetchPairs}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

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

      {fetchError && (
        <Alert
          type="error"
          message="加载失败"
          description={fetchError}
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setFetchError('')}
        />
      )}

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
          setSelectedLibrarySymbols([]);
        }}
        footer={null}
        width={700}
      >
        <Tabs 
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'real',
              label: '真实币种',
              children: (
                <Tabs
                  activeKey={realSubTab}
                  onChange={(key) => {
                    setRealSubTab(key);
                    if (key === 'library' && libraryData.length === 0) {
                      fetchSymbolLibrary();
                    }
                  }}
                  size="small"
                  items={[
                    {
                      key: 'manual',
                      label: '手动输入',
                      children: (
                        <Form
                          form={realForm}
                          layout="vertical"
                          initialValues={{ price_source: 'binance' }}
                          style={{ marginTop: 12 }}
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
                      key: 'library',
                      label: '从币安库选择',
                      children: (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                            <AntInput
                              placeholder="搜索币种..."
                              prefix={<SearchOutlined />}
                              value={librarySearch}
                              onChange={e => setLibrarySearch(e.target.value)}
                              style={{ flex: 1 }}
                            />
                            <Button
                              icon={<SyncOutlined spin={librarySyncing} />}
                              onClick={handleSyncLibrary}
                              loading={librarySyncing}
                            >
                              同步币安数据
                            </Button>
                          </div>
                          <Table
                            rowSelection={{
                              selectedRowKeys: selectedLibrarySymbols,
                              onChange: (keys) => setSelectedLibrarySymbols(keys as string[]),
                            }}
                            columns={libraryColumns}
                            dataSource={filteredLibrary}
                            rowKey="symbol"
                            loading={libraryLoading}
                            size="small"
                            pagination={{ pageSize: 8, showSizeChanger: false }}
                            scroll={{ y: 280 }}
                          />
                          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#666' }}>
                              已选 {selectedLibrarySymbols.length} 个
                            </span>
                            <Space>
                              <Button onClick={() => setModalOpen(false)}>取消</Button>
                              <Button
                                type="primary"
                                onClick={handleAddFromLibrary}
                                loading={addingFromLibrary}
                                disabled={selectedLibrarySymbols.length === 0}
                              >
                                批量添加选中
                              </Button>
                            </Space>
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
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
