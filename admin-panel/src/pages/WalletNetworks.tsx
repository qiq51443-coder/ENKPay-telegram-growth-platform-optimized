import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Popconfirm, Tag, Space, Select, Tabs, Radio, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, ReloadOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface WalletNetwork {
  id: string;
  network_name: string;
  network_display: string;
  chain_name: string;
  master_address: string;
  hd_mnemonic?: string;
  hd_derivation_path?: string;
  contract_address?: string;
  decimals?: number;
  rpc_url?: string;
  min_deposit_amount: number;
  deposit_fee: number;
  is_active: boolean;
  created_at: string;
  bot_bindings?: string[];
  listener_mode?: 'polling' | 'stream';
  moralis_stream_id?: string;
}

interface Bot {
  id: string;
  name: string;
  username: string;
}

interface DerivedAddress {
  id: string;
  user_id: string;
  network_id: number;
  address: string;
  hd_index?: number;
  source: string;
  is_active: boolean;
  created_at: string;
  username?: string;
  first_name?: string;
  robot_user_id?: string;
  network_name?: string;
  network_display?: string;
}

export const WalletNetworks: React.FC = () => {
  const [networks, setNetworks] = useState<WalletNetwork[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<WalletNetwork | null>(null);
  const [form] = Form.useForm();
  const [derivedAddresses, setDerivedAddresses] = useState<DerivedAddress[]>([]);
  const [derivedLoading, setDerivedLoading] = useState(false);
  const [derivedNetworkFilter, setDerivedNetworkFilter] = useState<string>('');
  const [listenerMode, setListenerMode] = useState<'polling' | 'stream'>('polling');
  const [streamSetupLoading, setStreamSetupLoading] = useState(false);
  const [streamSyncLoading, setStreamSyncLoading] = useState(false);
  const [streamDeleteLoading, setStreamDeleteLoading] = useState(false);

  // When switching to stream mode on an EVM network, pre-fill the webhook_url field
  const handleListenerModeChange = (mode: 'polling' | 'stream') => {
    setListenerMode(mode);
    if (mode === 'stream' && editingNetwork) {
      const chainUpper = (editingNetwork.chain_name || '').toUpperCase();
      const isTron = chainUpper === 'TRON' || chainUpper === 'TRC20' || chainUpper === 'TRC';
      if (!isTron) {
        const webhookUrl = `${window.location.origin}/webhook/deposit/moralis`;
        form.setFieldsValue({ webhook_url: webhookUrl });
      }
    }
  };

  useEffect(() => {
    fetchNetworks();
    fetchBots();
  }, []);

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getWalletNetworks();
      setNetworks(response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch wallet networks:', error);
      message.error(error.response?.data?.error || error.message || '获取网络列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const fetchDerivedAddresses = async () => {
    setDerivedLoading(true);
    try {
      const params: any = {};
      if (derivedNetworkFilter) params.network_id = derivedNetworkFilter;
      const response = await apiClient.getDepositAddresses(params);
      setDerivedAddresses(response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch derived addresses:', error);
      message.error('获取派生地址失败');
    } finally {
      setDerivedLoading(false);
    }
  };

  const handleOpenModal = (network?: WalletNetwork) => {
    if (network) {
      setEditingNetwork(network);
      // Don't show the mnemonic in the form for security
      const { hd_mnemonic, bot_bindings, ...formValues } = network;
      // Map deposit_fee to form field deposit_fee_percent for display
      form.setFieldsValue({ ...formValues, deposit_fee_percent: network.deposit_fee, bot_ids: bot_bindings || [] });
      setListenerMode(network.listener_mode || 'polling');
    } else {
      setEditingNetwork(null);
      form.resetFields();
      setListenerMode('polling');
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // Map form field deposit_fee_percent to backend field deposit_fee
      // Exclude stream-specific fields — those are handled separately via stream setup endpoints
      const { deposit_fee_percent, hd_mnemonic, bot_ids, moralis_api_key, trongrid_api_key, webhook_url, ...rest } = values;
      const submitData: any = { ...rest, deposit_fee: deposit_fee_percent, bot_ids: bot_ids || [] };

      // Only include hd_mnemonic if the user actually typed something
      if (hd_mnemonic && hd_mnemonic.trim()) {
        submitData.hd_mnemonic = hd_mnemonic.trim();
      }
      
      if (editingNetwork) {
        await apiClient.updateWalletNetwork(editingNetwork.id, submitData);
        await apiClient.updateWalletNetworkBots(editingNetwork.id, bot_ids || []);
        message.success('网络更新成功');
      } else {
        await apiClient.createWalletNetwork(submitData);
        message.success('网络创建成功');
      }
      
      setModalOpen(false);
      form.resetFields();
      setEditingNetwork(null);
      fetchNetworks();
    } catch (error: any) {
      console.error('Failed to save network:', error);
      const errMsg = error.response?.data?.error || error.message || '';
      if (errMsg.includes('WALLET_ENCRYPTION_KEY')) {
        message.error('服务端加密密钥配置错误，请联系运维检查 WALLET_ENCRYPTION_KEY 环境变量');
      } else {
        message.error(errMsg || '操作失败');
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteWalletNetwork(id);
      message.success('网络删除成功');
      fetchNetworks();
    } catch (error: any) {
      console.error('Failed to delete network:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleClearDerivedAddresses = async (networkId: string | 'all') => {
    try {
      const result = await apiClient.clearNetworkDerivedAddresses(networkId);
      message.success(result.message);
      fetchDerivedAddresses();
    } catch (error: any) {
      console.error('Failed to clear derived addresses:', error);
      message.error(error.response?.data?.error || '重置失败');
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      await apiClient.updateWalletNetwork(id, { is_active: !isActive });
      message.success(isActive ? '已禁用' : '已启用');
      fetchNetworks();
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleStreamSetup = async () => {
    if (!editingNetwork) return;
    const values = form.getFieldsValue(['moralis_api_key', 'trongrid_api_key', 'webhook_url']);
    if (!values.webhook_url) {
      message.error('请输入 Webhook URL');
      return;
    }
    const chainUpper = (editingNetwork.chain_name || '').toUpperCase();
    const isTron = chainUpper === 'TRON' || chainUpper === 'TRC20' || chainUpper === 'TRC';
    if (isTron && !values.trongrid_api_key) {
      message.error('请输入 TronGrid Pro API Key');
      return;
    }
    if (!isTron && !values.moralis_api_key) {
      message.error('请输入 Moralis API Key');
      return;
    }
    // Use form value for webhook_url, or fall back to the derived URL
    const defaultWebhookUrl = isTron
      ? `${window.location.origin}/webhook/deposit/tron`
      : `${window.location.origin}/webhook/deposit/moralis`;
    setStreamSetupLoading(true);
    try {
      const result = await apiClient.setupNetworkStream(editingNetwork.id, {
        moralis_api_key: values.moralis_api_key,
        trongrid_api_key: values.trongrid_api_key,
        webhook_url: values.webhook_url || defaultWebhookUrl,
      });
      message.success(result.message || '配置成功');
      fetchNetworks();
    } catch (error: any) {
      message.error(error.response?.data?.error || '配置失败');
    } finally {
      setStreamSetupLoading(false);
    }
  };

  const handleStreamSync = async () => {
    if (!editingNetwork) return;
    setStreamSyncLoading(true);
    try {
      const result = await apiClient.syncNetworkStream(editingNetwork.id);
      message.success(result.message || '同步完成');
    } catch (error: any) {
      message.error(error.response?.data?.error || '同步失败');
    } finally {
      setStreamSyncLoading(false);
    }
  };

  const handleStreamDelete = async () => {
    if (!editingNetwork) return;
    setStreamDeleteLoading(true);
    try {
      const result = await apiClient.deleteNetworkStream(editingNetwork.id);
      message.success(result.message || '已删除 Stream，切回轮询模式');
      setListenerMode('polling');
      fetchNetworks();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    } finally {
      setStreamDeleteLoading(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: any) => String(id).substring(0, 8),
    },
    {
      title: '网络名称',
      dataIndex: 'network_name',
      key: 'network_name',
      width: 120,
      render: (name: string) => (
        <span style={{ fontWeight: 'bold' }}>{name}</span>
      ),
    },
    {
      title: '显示名称',
      dataIndex: 'network_display',
      key: 'network_display',
      width: 150,
    },
    {
      title: '链名',
      dataIndex: 'chain_name',
      key: 'chain_name',
      width: 100,
      render: (name: string) => (
        <Tag color="blue">{name}</Tag>
      ),
    },
    {
      title: '主地址',
      dataIndex: 'master_address',
      key: 'master_address',
      ellipsis: true,
      render: (address: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{address}</span>
      ),
    },
    {
      title: '最低充值',
      dataIndex: 'min_deposit_amount',
      key: 'min_deposit_amount',
      width: 100,
      render: (amount: number | null | undefined) => amount != null ? `${Number(amount).toFixed(2)} USDT` : '-',
    },
    {
      title: '手续费',
      dataIndex: 'deposit_fee',
      key: 'deposit_fee',
      width: 80,
      render: (fee: number | null | undefined) => fee != null ? `${fee}%` : '0%',
    },
    {
      title: '绑定Bot',
      dataIndex: 'bot_bindings',
      key: 'bot_bindings',
      width: 160,
      render: (botIds: string[] | undefined) => {
        if (!botIds || botIds.length === 0) return <span style={{ color: '#999' }}>全部</span>;
        return (
          <Space wrap>
            {botIds.map((botId: string) => {
              const bot = bots.find(b => b.id === botId);
              return (
                <Tag key={botId} color="blue">
                  {bot ? `@${bot.username || bot.name}` : botId.substring(0, 8)}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: '监听模式',
      dataIndex: 'listener_mode',
      key: 'listener_mode',
      width: 100,
      render: (mode: string) => (
        <Tag color={mode === 'stream' ? 'purple' : 'default'}>
          {mode === 'stream' ? 'Stream 回调' : '轮询'}
        </Tag>
      ),
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
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 320,
      render: (_: any, record: WalletNetwork) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
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
            title={
              <div>
                <div>确定要重置该网络的所有派生地址吗？</div>
                <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: 4 }}>
                  旧地址将被删除，用户下次充值时自动生成新地址
                </div>
              </div>
            }
            onConfirm={() => handleClearDerivedAddresses(record.id)}
            okText="确定重置"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<ReloadOutlined />}>
              重置地址
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确定要删除这个网络吗？"
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
          <h2 style={{ margin: 0 }}>充值网络管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理支持的区块链充值网络</p>
        </div>
        <Space>
          <Popconfirm
            title={
              <div>
                <div>确定要重置所有网络的派生地址吗？</div>
                <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: 4 }}>
                  所有用户的 HD 派生地址将被删除，下次充值时自动重新派生
                </div>
              </div>
            }
            onConfirm={() => handleClearDerivedAddresses('all')}
            okText="确定重置全部"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<ReloadOutlined />}>
              重置全部派生地址
            </Button>
          </Popconfirm>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            添加网络
          </Button>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="networks"
        onChange={(key) => {
          if (key === 'derived') fetchDerivedAddresses();
        }}
        items={[
          {
            key: 'networks',
            label: '充值网络',
            children: (
              <Table
                columns={columns}
                dataSource={networks}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1400 }}
              />
            ),
          },
          {
            key: 'derived',
            label: '派生地址',
            children: (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Space wrap>
                    <Select
                      placeholder="筛选网络"
                      value={derivedNetworkFilter}
                      onChange={(val) => setDerivedNetworkFilter(val)}
                      style={{ width: 160 }}
                      allowClear
                    >
                      {networks.map(n => (
                        <Select.Option key={String(n.id)} value={String(n.id)}>
                          {n.network_display || n.network_name}
                        </Select.Option>
                      ))}
                    </Select>
                    <Button icon={<ReloadOutlined />} onClick={fetchDerivedAddresses} loading={derivedLoading}>
                      刷新
                    </Button>
                  </Space>
                </div>
                <Table
                  columns={[
                    {
                      title: '地址',
                      dataIndex: 'address',
                      key: 'address',
                      ellipsis: true,
                      render: (addr: string) => (
                        <Space>
                          <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{addr}</span>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => { navigator.clipboard.writeText(addr); message.success('已复制'); }}
                          />
                        </Space>
                      ),
                    },
                    {
                      title: '网络',
                      key: 'network',
                      width: 130,
                      render: (_: any, record: DerivedAddress) => (
                        <Tag color="blue">{record.network_display || record.network_name || '-'}</Tag>
                      ),
                    },
                    {
                      title: '用户',
                      key: 'user',
                      width: 150,
                      render: (_: any, record: DerivedAddress) => (
                        <div>
                          <div style={{ fontWeight: 500 }}>{record.username || record.first_name || '-'}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{record.robot_user_id}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'HD索引',
                      dataIndex: 'hd_index',
                      key: 'hd_index',
                      width: 80,
                      render: (v: number) => v ?? '-',
                    },
                    {
                      title: '来源',
                      dataIndex: 'source',
                      key: 'source',
                      width: 100,
                      render: (source: string) => (
                        <Tag color={source === 'hd_derived' ? 'green' : 'orange'}>{source}</Tag>
                      ),
                    },
                    {
                      title: '状态',
                      dataIndex: 'is_active',
                      key: 'is_active',
                      width: 80,
                      render: (active: boolean) => (
                        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
                      ),
                    },
                    {
                      title: '生成时间',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      width: 160,
                      render: (date: string) => date ? new Date(date).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : '-',
                    },
                  ]}
                  dataSource={derivedAddresses}
                  rowKey="id"
                  loading={derivedLoading}
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: 1200 }}
                />
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editingNetwork ? '编辑网络' : '添加网络'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setEditingNetwork(null);
        }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            min_deposit_amount: 1,
            deposit_fee_percent: 0,
            decimals: 6,
            is_active: true,
          }}
        >
          <Form.Item
            name="network_name"
            label="网络名称"
            rules={[{ required: true, message: '请输入网络名称' }]}
            tooltip="例如：TRC20, ERC20, BEP20"
          >
            <Input placeholder="TRC20" />
          </Form.Item>

          <Form.Item
            name="network_display"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="TRON (TRC20)" />
          </Form.Item>

          <Form.Item
            name="chain_name"
            label="链名"
            rules={[{ required: true, message: '请输入链名' }]}
          >
            <Select>
              <Select.Option value="TRON">Tron (TRON)</Select.Option>
              <Select.Option value="ETH">Ethereum (ETH)</Select.Option>
              <Select.Option value="BSC">BSC</Select.Option>
              <Select.Option value="POLYGON">Polygon (POLYGON)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="hd_derivation_path"
            label="HD 派生路径"
            rules={[{ required: true, message: '请选择 HD 派生路径' }]}
            tooltip="用于从助记词派生地址的 BIP44 路径"
          >
            <Select placeholder="选择派生路径">
              <Select.Option value="m/44'/195'/0'/0">m/44'/195'/0'/0 (TRON)</Select.Option>
              <Select.Option value="m/44'/60'/0'/0">m/44'/60'/0'/0 (ETH/BSC/Polygon)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="master_address"
            label="主地址"
            tooltip="平台归集热钱包地址（接收用户扫链归集资金），与加密密钥无关"
            rules={[{ required: true, message: '请输入主地址' }]}
          >
            <Input placeholder="0x..." />
          </Form.Item>

          <Form.Item
            name="contract_address"
            label="合约地址"
            tooltip="ERC20/TRC20 代币合约地址，原生币可留空"
          >
            <Input placeholder="代币合约地址（如 USDT 合约）" />
          </Form.Item>

          <Form.Item
            name="decimals"
            label="代币精度"
            tooltip="代币小数位数，USDT TRC20 为 6，ERC20 为 18"
          >
            <InputNumber min={0} max={18} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="rpc_url"
            label="RPC 节点地址"
            tooltip="区块链 RPC 节点 URL，留空使用默认节点"
          >
            <Input placeholder="https://..." />
          </Form.Item>

          <Form.Item
            name="hd_mnemonic"
            label="HD 助记词（BIP39）"
            rules={editingNetwork ? [] : [{ required: true, message: '请输入 HD 助记词' }]}
            tooltip="12或24个英文单词，用空格分隔。提交后加密存储，不可查看。"
          >
            <Input.Password
              placeholder={editingNetwork ? '已配置（如需修改请重新输入）' : '12 或 24 个英文单词，用空格分隔'}
              visibilityToggle
            />
          </Form.Item>

          <Form.Item
            name="min_deposit_amount"
            label="最低充值金额 (USDT)"
            rules={[{ required: true, message: '请输入最低充值金额' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="deposit_fee_percent"
            label="充值手续费 (%)"
            rules={[{ required: true, message: '请输入手续费百分比' }]}
          >
            <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
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

          <Form.Item
            name="bot_ids"
            label="授权Bot"
            tooltip="选择可使用该网络的Bot，不选则全部Bot可用"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="不选则全部Bot可用"
              optionFilterProp="children"
            >
              {bots.map((bot) => (
                <Select.Option key={bot.id} value={bot.id}>
                  @{bot.username || bot.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {editingNetwork && (
            <>
              <Form.Item label="监听模式" tooltip="轮询：定时扫链；Stream 回调：接收链上推送（延迟更低，API 消耗更少）">
                <Radio.Group
                  value={listenerMode}
                  onChange={(e) => handleListenerModeChange(e.target.value)}
                >
                  <Radio value="polling">轮询（默认）</Radio>
                  <Radio value="stream">Stream 回调</Radio>
                </Radio.Group>
              </Form.Item>

              {listenerMode === 'stream' && (() => {
                const chainUpper = (editingNetwork.chain_name || '').toUpperCase();
                const isTron = chainUpper === 'TRON' || chainUpper === 'TRC20' || chainUpper === 'TRC';
                const baseUrl = window.location.origin;
                const webhookUrl = isTron
                  ? `${baseUrl}/webhook/deposit/tron`
                  : `${baseUrl}/webhook/deposit/moralis`;

                return (
                  <div style={{ background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 6, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>
                      {isTron ? 'TronGrid Webhook 配置' : 'Moralis Streams 配置'}
                    </div>

                    {editingNetwork.listener_mode === 'stream' && editingNetwork.moralis_stream_id && (
                      <Alert
                        type="success"
                        style={{ marginBottom: 12 }}
                        message={`Stream 已激活：${editingNetwork.moralis_stream_id}`}
                        showIcon
                      />
                    )}

                    <Form.Item label="Webhook URL（只读）" style={{ marginBottom: 8 }}>
                      <Input
                        value={webhookUrl}
                        readOnly
                        addonAfter={
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => { navigator.clipboard.writeText(webhookUrl); message.success('已复制'); }}
                          />
                        }
                      />
                    </Form.Item>

                    {isTron ? (
                      <>
                        <Form.Item name="trongrid_api_key" label="TronGrid Pro API Key" style={{ marginBottom: 8 }}>
                          <Input.Password placeholder="输入 TronGrid Pro API Key" visibilityToggle />
                        </Form.Item>
                        <Alert
                          type="info"
                          style={{ marginBottom: 8 }}
                          message="TronGrid 回调配置步骤：① 登录 TronGrid Dashboard → Webhooks → 新建 Webhook，将上方 Webhook URL 填入，事件类型选择 TRC20 Transfer，保存。② 回到此处填写 TronGrid Pro API Key 并点击"保存配置"。TronGrid 不支持程序化地址订阅，新用户充值地址需在 TronGrid Dashboard 中手动加入订阅。"
                          showIcon
                        />
                        <Button
                          type="primary"
                          icon={<ThunderboltOutlined />}
                          loading={streamSetupLoading}
                          onClick={handleStreamSetup}
                        >
                          保存配置并切换为 Stream 模式
                        </Button>
                      </>
                    ) : (
                      <>
                        <Form.Item name="moralis_api_key" label="Moralis API Key" style={{ marginBottom: 8 }}>
                          <Input.Password placeholder="输入 Moralis API Key" visibilityToggle />
                        </Form.Item>
                        <Form.Item name="webhook_url" label="Webhook URL（确认/修改）" style={{ marginBottom: 8 }}>
                          <Input placeholder={webhookUrl} />
                        </Form.Item>
                        <Space wrap>
                          <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            loading={streamSetupLoading}
                            onClick={handleStreamSetup}
                          >
                            一键配置 Stream
                          </Button>
                          <Button
                            icon={<ReloadOutlined />}
                            loading={streamSyncLoading}
                            disabled={editingNetwork.listener_mode !== 'stream'}
                            onClick={handleStreamSync}
                          >
                            同步地址
                          </Button>
                          <Popconfirm
                            title="确定要删除 Stream 并切回轮询模式吗？"
                            onConfirm={handleStreamDelete}
                            okText="确定"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              loading={streamDeleteLoading}
                              disabled={editingNetwork.listener_mode !== 'stream'}
                            >
                              删除 Stream
                            </Button>
                          </Popconfirm>
                        </Space>
                      </>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};
