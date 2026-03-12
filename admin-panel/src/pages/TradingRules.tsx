import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Drawer,
  Form,
  InputNumber,
  Select,
  Switch,
  message,
  Popconfirm,
  Tag,
  Space,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../services/api';

const { Option } = Select;

export const TradingRules: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const response = await api.getTradingRules();
      setRules(response.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取交易规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({ odds: 1.95, min_bet: 1.0, max_bet: 10000.0, duration_seconds: 60, is_active: true });
    setDrawerVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingRule(record);
    form.setFieldsValue({
      odds: parseFloat(record.odds),
      min_bet: parseFloat(record.min_bet),
      max_bet: parseFloat(record.max_bet),
      duration_seconds: record.duration_seconds,
      is_active: record.is_active,
    });
    setDrawerVisible(true);
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      if (editingRule) {
        await api.updateTradingRule(editingRule.id, values);
        message.success('交易规则更新成功');
      } else {
        await api.createTradingRule(values);
        message.success('交易规则创建成功');
      }
      setDrawerVisible(false);
      fetchRules();
    } catch (error: any) {
      message.error(error.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await api.deleteTradingRule(id);
      message.success('交易规则删除成功');
      fetchRules();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除规则失败');
    } finally {
      setLoading(false);
    }
  };

  const durationLabel = (seconds: number) => {
    if (seconds === 60) return '1分钟';
    if (seconds === 300) return '5分钟';
    if (seconds === 600) return '10分钟';
    return `${seconds}秒`;
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '时段',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (seconds: number) => durationLabel(seconds),
    },
    {
      title: '赔率',
      dataIndex: 'odds',
      key: 'odds',
      render: (odds: any) => parseFloat(odds).toFixed(2),
    },
    {
      title: '最低投注',
      dataIndex: 'min_bet',
      key: 'min_bet',
      render: (value: any) => `$${parseFloat(value).toFixed(2)}`,
    },
    {
      title: '最高投注',
      dataIndex: 'max_bet',
      key: 'max_bet',
      render: (value: any) => `$${parseFloat(value).toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这条规则吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>交易规则管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建规则
        </Button>
      </div>

      <Table
        loading={loading}
        dataSource={rules}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 20 }}
      />

      <Drawer
        title={editingRule ? '编辑交易规则' : '新建交易规则'}
        width={480}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="duration_seconds"
            label="时段"
            rules={[{ required: true, message: '请选择时段' }]}
          >
            <Select placeholder="选择时段">
              <Option value={60}>1分钟（60秒）</Option>
              <Option value={300}>5分钟（300秒）</Option>
              <Option value={600}>10分钟（600秒）</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="odds"
            label="赔率"
            rules={[{ required: true, message: '请输入赔率' }]}
          >
            <InputNumber
              min={1.01}
              max={10}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="例如：1.95"
            />
          </Form.Item>

          <Form.Item
            name="min_bet"
            label="最低投注金额（USDT）"
            rules={[{ required: true, message: '请输入最低投注金额' }]}
          >
            <InputNumber
              min={0.01}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="例如：1.00"
            />
          </Form.Item>

          <Form.Item
            name="max_bet"
            label="最高投注金额（USDT）"
            rules={[{ required: true, message: '请输入最高投注金额' }]}
          >
            <InputNumber
              min={1}
              step={1}
              precision={2}
              style={{ width: '100%' }}
              placeholder="例如：10000.00"
            />
          </Form.Item>

          <Form.Item name="is_active" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingRule ? '更新' : '创建'}
              </Button>
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};
