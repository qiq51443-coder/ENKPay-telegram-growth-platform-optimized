import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Drawer,
  Form,
  Input,
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
  const [pairs, setPairs] = useState([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchRules();
    fetchPairs();
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

  const fetchPairs = async () => {
    try {
      const response = await api.getTradingPairs();
      setPairs(response.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || '获取交易对列表失败');
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({ 
      odds: 1.95, 
      min_bet: 1.0, 
      max_bet: 10000.0, 
      duration_seconds: 60,
      is_active: true 
    });
    setDrawerVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingRule(record);
    form.setFieldsValue({
      pair_id: record.pair_id,
      rule_name: record.rule_name,
      direction: record.direction,
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

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '交易对',
      dataIndex: 'pair_display_name',
      key: 'pair_display_name',
      render: (text: string, record: any) => text || record.pair_symbol,
    },
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      key: 'rule_name',
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      render: (direction: string) => (
        <Tag color={direction === 'up' ? 'green' : 'red'}>
          {direction === 'up' ? '涨' : '跌'}
        </Tag>
      ),
    },
    {
      title: '赔率',
      dataIndex: 'odds',
      key: 'odds',
      render: (odds: any) => parseFloat(odds).toFixed(2),
    },
    {
      title: '最小下注',
      dataIndex: 'min_bet',
      key: 'min_bet',
      render: (value: any) => `$${parseFloat(value).toFixed(2)}`,
    },
    {
      title: '最大下注',
      dataIndex: 'max_bet',
      key: 'max_bet',
      render: (value: any) => `$${parseFloat(value).toFixed(2)}`,
    },
    {
      title: '持续时间',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (seconds: number) => `${seconds}秒`,
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
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="pair_id"
            label="交易对"
            rules={[{ required: true, message: '请选择交易对' }]}
          >
            <Select placeholder="选择交易对">
              {pairs.map((pair: any) => (
                <Option key={pair.id} value={pair.id}>
                  {pair.display_name || pair.symbol}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="rule_name"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="例如：BTC 1分钟涨" />
          </Form.Item>

          <Form.Item
            name="direction"
            label="预定方向"
            rules={[{ required: true, message: '请选择方向' }]}
          >
            <Select placeholder="选择方向">
              <Option value="up">涨（绿）</Option>
              <Option value="down">跌（红）</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="odds"
            label="赔率（倍数）"
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
            label="最小下注金额（USDT）"
            rules={[{ required: true, message: '请输入最小下注金额' }]}
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
            label="最大下注金额（USDT）"
            rules={[{ required: true, message: '请输入最大下注金额' }]}
          >
            <InputNumber
              min={1}
              step={1}
              precision={2}
              style={{ width: '100%' }}
              placeholder="例如：10000.00"
            />
          </Form.Item>

          <Form.Item
            name="duration_seconds"
            label="每轮持续时间（秒）"
            rules={[{ required: true, message: '请输入持续时间' }]}
          >
            <InputNumber
              min={10}
              max={3600}
              step={10}
              style={{ width: '100%' }}
              placeholder="例如：60"
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
