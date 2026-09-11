import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Switch, Space, message, Popconfirm, Tag, Typography, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface Plan {
  id: number;
  name: string;
  description?: string;
  description_i18n?: Record<string, string>;
  price: number;
  daily_yield_rate: number;
  term_days: number;
  sort_order: number;
  is_active: boolean;
}

const LANGS = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
  { key: 'fr', label: 'Français' },
  { key: 'de', label: 'Deutsch' },
  { key: 'es', label: 'Español' },
  { key: 'ar', label: 'العربية' },
  { key: 'ja', label: '日本語' },
] as const;


function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const DepinPlansPage: React.FC = () => {
  const [items, setItems] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/depin/admin/plans', { headers: authHeaders() });
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
      name: '',
      description: '',
      desc_zh: '', desc_en: '', desc_fr: '', desc_de: '', desc_es: '', desc_ar: '', desc_ja: '',
      price: 100,
      daily_yield_rate: 0.5,
      term_days: 30,
      sort_order: 0,
      is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (row: Plan) => {
    setEditing(row);
    const i18n = row.description_i18n || {};
    form.setFieldsValue({
      name: row.name,
      description: row.description,
      desc_zh: i18n.zh || row.description || '',
      desc_en: i18n.en || '',
      desc_fr: i18n.fr || '',
      desc_de: i18n.de || '',
      desc_es: i18n.es || '',
      desc_ar: i18n.ar || '',
      desc_ja: i18n.ja || '',
      price: Number(row.price),
      daily_yield_rate: Number(row.daily_yield_rate),
      term_days: Number(row.term_days),
      sort_order: Number(row.sort_order),
      is_active: !!row.is_active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const v = await form.validateFields();
    const description_i18n = {
      zh: v.desc_zh || v.description || '',
      en: v.desc_en || '',
      fr: v.desc_fr || '',
      de: v.desc_de || '',
      es: v.desc_es || '',
      ar: v.desc_ar || '',
      ja: v.desc_ja || '',
    };
    const body = {
      name: v.name,
      description: v.desc_zh || v.description || v.desc_en || '',
      description_i18n,
      price: Number(v.price),
      daily_yield_rate: Number(v.daily_yield_rate),
      term_days: Number(v.term_days),
      sort_order: Number(v.sort_order || 0),
      is_active: !!v.is_active,
    };
    try {
      const url = editing ? `/api/depin/admin/plans/${editing.id}` : '/api/depin/admin/plans';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
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
      const res = await fetch(`/api/depin/admin/plans/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '删除失败');
      message.success('已删除');
      load();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '名称', dataIndex: 'name' },
    {
      title: '价格 USDT',
      dataIndex: 'price',
      width: 120,
      render: (n: number) => Number(n).toFixed(2),
    },
    {
      title: '日收益率 %',
      dataIndex: 'daily_yield_rate',
      width: 120,
      render: (n: number) => Number(n).toFixed(2),
    },
    { title: '周期(天)', dataIndex: 'term_days', width: 100 },
    { title: '排序', dataIndex: 'sort_order', width: 80 },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 90,
      render: (v: boolean) => (v ? <Tag color="green">上架</Tag> : <Tag>下架</Tag>),
    },
    {
      title: '操作',
      width: 160,
      render: (_: any, row: Plan) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(row.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            DePIN 节点套餐
          </Title>
          <div style={{ color: '#666', marginTop: 4 }}>多品种：名称 / 价格 / 日收益率 / 周期。官网用户用平台余额购买。</div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增套餐
          </Button>
        </Space>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="仅作用于官网账号的「购买节点服务器」模式"
      />
      <Table rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={{ pageSize: 20 }} />
      <Modal
        title={editing ? '编辑套餐' : '新增套餐'}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        okText="保存"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="服务器/套餐名称" rules={[{ required: true }]}>
            <Input placeholder="例如：基础算力节点 A1" />
          </Form.Item>
          <Form.Item label="说明（7语）">
            <div style={{ width: '100%' }}>
              <Button
                type="dashed"
                style={{ marginBottom: 8 }}
                onClick={async () => {
                  const base = form.getFieldValue('desc_zh') || form.getFieldValue('desc_en');
                  if (!base) {
                    message.warning('请先填写中文或英文说明');
                    return;
                  }
                  try {
                    const res = await fetch('/api/depin/admin/translate', {
                      method: 'POST',
                      headers: authHeaders(),
                      body: JSON.stringify({ text: base }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || '翻译失败');
                    const t = data.translations || {};
                    form.setFieldsValue({
                      desc_zh: t.zh || base,
                      desc_en: t.en || '',
                      desc_fr: t.fr || '',
                      desc_de: t.de || '',
                      desc_es: t.es || '',
                      desc_ar: t.ar || '',
                      desc_ja: t.ja || '',
                    });
                    message.success('已同步翻译 7 语');
                  } catch (e: any) {
                    message.error(e.message || '翻译失败');
                  }
                }}
              >
                一键翻译并填充 7 语
              </Button>
              {LANGS.map((l) => (
                <Form.Item key={l.key} name={`desc_${l.key}`} label={l.label} style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} placeholder={`${l.label} 说明`} />
                </Form.Item>
              ))}
            </div>
          </Form.Item>
          <Form.Item name="price" label="价格 (USDT)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="daily_yield_rate" label="日收益率 (%)" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="term_days" label="周期天数">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sort_order" label="排序（越小越靠前）">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="上架" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export const DepinPlans: React.FC = () => <DepinPlansPage />;
export default DepinPlans;
