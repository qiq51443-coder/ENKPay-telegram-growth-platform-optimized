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
      setRules(response.data.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to fetch trading rules');
    } finally {
      setLoading(false);
    }
  };

  const fetchPairs = async () => {
    try {
      const response = await api.getTradingPairs();
      setPairs(response.data.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to fetch trading pairs');
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
        message.success('Trading rule updated successfully');
      } else {
        await api.createTradingRule(values);
        message.success('Trading rule created successfully');
      }
      setDrawerVisible(false);
      fetchRules();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await api.deleteTradingRule(id);
      message.success('Trading rule deleted successfully');
      fetchRules();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to delete rule');
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
      title: 'Trading Pair',
      dataIndex: 'pair_display_name',
      key: 'pair_display_name',
      render: (text: string, record: any) => text || record.pair_symbol,
    },
    {
      title: 'Rule Name',
      dataIndex: 'rule_name',
      key: 'rule_name',
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      render: (direction: string) => (
        <Tag color={direction === 'up' ? 'green' : 'red'}>
          {direction.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Odds',
      dataIndex: 'odds',
      key: 'odds',
      render: (odds: any) => parseFloat(odds).toFixed(2),
    },
    {
      title: 'Min Bet',
      dataIndex: 'min_bet',
      key: 'min_bet',
      render: (value: any) => `$${parseFloat(value).toFixed(2)}`,
    },
    {
      title: 'Max Bet',
      dataIndex: 'max_bet',
      key: 'max_bet',
      render: (value: any) => `$${parseFloat(value).toFixed(2)}`,
    },
    {
      title: 'Duration',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (seconds: number) => `${seconds}s`,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this rule?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>交易规则管理 (Trading Rules)</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Create Rule
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
        title={editingRule ? 'Edit Trading Rule' : 'Create Trading Rule'}
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="pair_id"
            label="Trading Pair"
            rules={[{ required: true, message: 'Please select a trading pair' }]}
          >
            <Select placeholder="Select trading pair">
              {pairs.map((pair: any) => (
                <Option key={pair.id} value={pair.id}>
                  {pair.display_name || pair.symbol}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="rule_name"
            label="Rule Name"
            rules={[{ required: true, message: 'Please enter rule name' }]}
          >
            <Input placeholder="e.g., BTC 1min Up" />
          </Form.Item>

          <Form.Item
            name="direction"
            label="Direction (Predetermined Result)"
            rules={[{ required: true, message: 'Please select direction' }]}
          >
            <Select placeholder="Select direction">
              <Option value="up">Up (绿涨)</Option>
              <Option value="down">Down (红跌)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="odds"
            label="Odds (Payout Multiplier)"
            rules={[{ required: true, message: 'Please enter odds' }]}
          >
            <InputNumber
              min={1.01}
              max={10}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="e.g., 1.95"
            />
          </Form.Item>

          <Form.Item
            name="min_bet"
            label="Minimum Bet (USDT)"
            rules={[{ required: true, message: 'Please enter minimum bet' }]}
          >
            <InputNumber
              min={0.01}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="e.g., 1.00"
            />
          </Form.Item>

          <Form.Item
            name="max_bet"
            label="Maximum Bet (USDT)"
            rules={[{ required: true, message: 'Please enter maximum bet' }]}
          >
            <InputNumber
              min={1}
              step={1}
              precision={2}
              style={{ width: '100%' }}
              placeholder="e.g., 10000.00"
            />
          </Form.Item>

          <Form.Item
            name="duration_seconds"
            label="Round Duration (seconds)"
            rules={[{ required: true, message: 'Please enter duration' }]}
          >
            <InputNumber
              min={10}
              max={3600}
              step={10}
              style={{ width: '100%' }}
              placeholder="e.g., 60"
            />
          </Form.Item>

          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingRule ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setDrawerVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};
