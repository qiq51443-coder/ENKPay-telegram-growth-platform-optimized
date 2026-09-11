import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Switch, Space, message, Popconfirm, Typography, Alert, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

interface Coin {
  id: number;
  coingecko_id: string;
  symbol: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const DepinMarketCoinsPage: React.FC = () => {
  const [items, setItems] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coin | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/depin/admin/market-coins', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      message.error(e.message || '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      coingecko_id: '',
      symbol: '',
      name: '',
      sort_order: 0,
      is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (row: Coin) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const handleSave = async () => {
    const v = await form.validateFields();
    const body = {
      coingecko_id: String(v.coingecko_id).trim().toLowerCase(),
      symbol: String(v.symbol).trim().toUpperCase(),
      name: v.name || v.symbol,
      sort_order: Number(v.sort_order || 0),
      is_active: !!v.is_active,
    };
    try {
      const url = editing
        ? `/api/depin/admin/market-coins/${editing.id}`
        : '/api/depin/admin/market-coins';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');
      message.success('已保存');
      setOpen(false);
      load();
    } catch (e: any) {
      message.error(e.message || '保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/depin/admin/market-coins/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  const toggleActive = async (row: Coin) => {
    try {
      const res = await fetch(`/api/depin/admin/market-coins/${row.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      if (!res.ok) throw new Error('更新失败');
      load();
    } catch (e: any) {
      message.error(e.message || '更新失败');
    }
  };

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        DePIN 市场代币（CoinGecko）
      </Title>
      <Paragraph type="secondary">
        配置官网算力页顶部展示的参考行情。填写 CoinGecko 的 coin id（如 filecoin、helium）。仅展示，不参与账本。
      </Paragraph>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="数据来源 CoinGecko"
        description="后端缓存约 10 分钟。隐藏后前端不再显示该币。"
      />
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          添加代币
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          { title: 'CoinGecko ID', dataIndex: 'coingecko_id', key: 'coingecko_id' },
          { title: '符号', dataIndex: 'symbol', key: 'symbol', width: 100 },
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
          {
            title: '显示',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (v: boolean, row: Coin) => (
              <Switch checked={!!v} onChange={() => toggleActive(row)} />
            ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 160,
            render: (_: any, row: Coin) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(row.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑代币' : '添加代币'}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="coingecko_id"
            label="CoinGecko ID"
            rules={[{ required: true, message: '如 filecoin' }]}
            extra="在 coingecko.com 币种页 URL 中查看，例如 /coins/filecoin → filecoin"
          >
            <Input placeholder="filecoin" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="symbol" label="符号" rules={[{ required: true }]}>
            <Input placeholder="FIL" />
          </Form.Item>
          <Form.Item name="name" label="显示名称">
            <Input placeholder="Filecoin" />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="前端显示" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export const DepinMarketCoins: React.FC = () => <DepinMarketCoinsPage />;
export default DepinMarketCoins;
