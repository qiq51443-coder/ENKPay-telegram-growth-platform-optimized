import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Popconfirm, Tag, Space, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
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
}

interface Bot {
  id: string;
  name: string;
  username: string;
}

export const WalletNetworks: React.FC = () => {
  const [networks, setNetworks] = useState<WalletNetwork[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<WalletNetwork | null>(null);
  const [form] = Form.useForm();

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
      setBots(response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const handleOpenModal = (network?: WalletNetwork) => {
    if (network) {
      setEditingNetwork(network);
      // Don't show the mnemonic in the form for security
      const { hd_mnemonic, bot_bindings, ...formValues } = network;
      // Map deposit_fee to form field deposit_fee_percent for display
      form.setFieldsValue({ ...formValues, deposit_fee_percent: network.deposit_fee, bot_ids: bot_bindings || [] });
    } else {
      setEditingNetwork(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // Map form field deposit_fee_percent to backend field deposit_fee
      const { deposit_fee_percent, hd_mnemonic, bot_ids, ...rest } = values;
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
      message.error(error.response?.data?.error || '操作失败');
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
      width: 250,
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          添加网络
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={networks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1400 }}
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
              <Select.Option value="tron">Tron</Select.Option>
              <Select.Option value="ethereum">Ethereum</Select.Option>
              <Select.Option value="bsc">BSC</Select.Option>
              <Select.Option value="polygon">Polygon</Select.Option>
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
              <Select.Option value="m/44'/60'/0'/0">m/44'/60'/0'/0 (ETH/BSC)</Select.Option>
              <Select.Option value="m/44'/966'/0'/0">m/44'/966'/0'/0 (Polygon)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="master_address"
            label="主地址"
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
        </Form>
      </Modal>
    </div>
  );
};
