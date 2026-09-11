import React, { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, message, Space, Typography, Alert, Tag } from 'antd';
import { SaveOutlined, CloudServerOutlined, LockOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Paragraph } = Typography;
const STORAGE_KEY = 'enkpay_admin_depin_config_v1';

const DEFAULT = {
  enabled: true,
  title: 'DePIN 算力',
  subtitle: '部署节点 · 资产质押（平台展示收益）',
  modes: {
    node_server: {
      enabled: true,
      name: '购买节点服务器',
      description: '使用账户余额购买算力节点套餐，按日展示收益。',
      min_amount: 100,
      daily_yield_rate: 0.5,
    },
    asset_stake: {
      enabled: true,
      name: '现有资产质押',
      description: '质押账户可用余额，锁仓期内按配置展示收益。',
      min_amount: 50,
      lock_days: 30,
      daily_yield_rate: 0.3,
    },
  },
};

const DepinConfigPage: React.FC = () => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let c = DEFAULT;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) c = { ...DEFAULT, ...JSON.parse(raw) };
    } catch {}
    form.setFieldsValue({
      enabled: c.enabled,
      title: c.title,
      subtitle: c.subtitle,
      node_enabled: c.modes?.node_server?.enabled,
      node_name: c.modes?.node_server?.name,
      node_description: c.modes?.node_server?.description,
      node_min_amount: c.modes?.node_server?.min_amount,
      node_daily_yield_rate: c.modes?.node_server?.daily_yield_rate,
      stake_enabled: c.modes?.asset_stake?.enabled,
      stake_name: c.modes?.asset_stake?.name,
      stake_description: c.modes?.asset_stake?.description,
      stake_min_amount: c.modes?.asset_stake?.min_amount,
      stake_lock_days: c.modes?.asset_stake?.lock_days,
      stake_daily_yield_rate: c.modes?.asset_stake?.daily_yield_rate,
    });
  }, [form]);

  const onSave = async () => {
    const v = await form.validateFields();
    const next = {
      enabled: !!v.enabled,
      title: v.title,
      subtitle: v.subtitle,
      modes: {
        node_server: {
          enabled: !!v.node_enabled,
          name: v.node_name,
          description: v.node_description,
          min_amount: Number(v.node_min_amount) || 0,
          daily_yield_rate: Number(v.node_daily_yield_rate) || 0,
        },
        asset_stake: {
          enabled: !!v.stake_enabled,
          name: v.stake_name,
          description: v.stake_description,
          min_amount: Number(v.stake_min_amount) || 0,
          lock_days: Number(v.stake_lock_days) || 30,
          daily_yield_rate: Number(v.stake_daily_yield_rate) || 0,
        },
      },
    };
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      try {
        await apiClient.post('/admin/system-settings/bulk-update', {
          settings: [{ key: 'depin_config_json', value: JSON.stringify(next) }],
        });
      } catch {}
      message.success('DePIN 配置已保存（已移除兑换代币模式）');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={3} style={{ margin: 0 }}>
        DePIN 配置
      </Title>
      <Paragraph type="secondary">
        两种模式：1 购买节点服务器 · 2 现有资产质押。仅官网账号；非真实链上部署。「兑换代币」模式已移除。
      </Paragraph>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="与 Bot 用户隔离"
        description="本配置只作用于官网邮箱账号。"
      />
      <Form form={form} layout="vertical">
        <Card title="总开关" style={{ marginBottom: 16 }}>
          <Form.Item name="enabled" label="启用 DePIN" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="title" label="页面标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="subtitle" label="副标题">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Card>
        <Card
          title={
            <Space>
              <CloudServerOutlined />
              模式1 购买节点 <Tag color="blue">node_server</Tag>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Form.Item name="node_enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="node_name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="node_description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="node_min_amount" label="最低金额 USDT">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="node_daily_yield_rate" label="日收益 %">
              <InputNumber min={0} step={0.01} />
            </Form.Item>
          </Space>
        </Card>
        <Card
          title={
            <Space>
              <LockOutlined />
              模式2 资产质押 <Tag color="green">asset_stake</Tag>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Form.Item name="stake_enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="stake_name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="stake_description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="stake_min_amount" label="最低金额 USDT">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="stake_lock_days" label="默认锁仓天">
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="stake_daily_yield_rate" label="日收益 %">
              <InputNumber min={0} step={0.01} />
            </Form.Item>
          </Space>
        </Card>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
          保存配置
        </Button>
      </Form>
    </div>
  );
};

export const DepinConfig: React.FC = () => <DepinConfigPage />;
export default DepinConfig;
