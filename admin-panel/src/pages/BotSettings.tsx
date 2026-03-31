import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, InputNumber, message, Tabs, Spin } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TabPane } = Tabs;

interface Bot {
  id: string;
  name: string;
  username: string;
  is_active: boolean;
}

interface BotSettingsData {
  welcome_message?: string;
  welcome_image_url?: string;
  official_group_url?: string;
  official_channel_url?: string;
  follow_reward?: number;
  invite_reward?: number;
  support_telegram?: string;
  wallet_tip_message?: string;
  transfer_min_amount?: number;
  withdraw_min_amount?: number;
  withdraw_fee_rate?: number;
  deposit_confirm_blocks?: number;
}

export const BotSettings: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await apiClient.getBots();
      const botList: Bot[] = response.bots || response.data || [];
      setBots(botList);
      if (botList.length > 0) {
        setSelectedBotId(botList[0].id);
        fetchSettings(botList[0].id);
      }
    } catch (error: any) {
      console.error('Failed to fetch bots:', error);
      message.error('获取Bot列表失败');
    }
  };

  const fetchSettings = async (botId: string) => {
    if (!botId) return;
    setLoading(true);
    try {
      const response = await apiClient.getSettings(botId);
      form.setFieldsValue(response.settings || {});
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      message.warning('加载设置失败');
      form.resetFields();
    } finally {
      setLoading(false);
    }
  };

  const handleBotChange = (botId: string) => {
    setSelectedBotId(botId);
    fetchSettings(botId);
  };

  const handleSave = async () => {
    if (!selectedBotId) {
      message.warning('请先选择一个Bot');
      return;
    }
    setSaving(true);
    try {
      const values = await form.validateFields();
      await apiClient.updateSettings(selectedBotId, values);
      message.success('设置保存成功');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Bot设置</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理各Bot的配置参数</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            style={{ width: 220 }}
            placeholder="选择Bot"
            value={selectedBotId || undefined}
            onChange={handleBotChange}
          >
            {bots.map((bot) => (
              <Select.Option key={bot.id} value={bot.id}>
                @{bot.username || bot.name}
              </Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            disabled={!selectedBotId}
          >
            保存设置
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical">
          <Tabs defaultActiveKey="welcome">
            <TabPane tab="欢迎语" key="welcome">
              <Card>
                <Form.Item name="welcome_message" label="欢迎语文字（Markdown 支持，显示在固定信息下方）">
                  <Input.TextArea rows={8} placeholder="欢迎来到平台..." />
                </Form.Item>
                <Form.Item name="welcome_image_url" label="欢迎图片 URL（留空则不发图）">
                  <Input placeholder="https://...（图片 URL）" />
                </Form.Item>
                <Form.Item name="official_group_url" label="官方群组链接（添加后自动显示群组按钮）">
                  <Input placeholder="https://t.me/xxxxx" />
                </Form.Item>
                <Form.Item name="official_channel_url" label="官方频道链接（添加后自动显示频道按钮）">
                  <Input placeholder="https://t.me/xxxxx" />
                </Form.Item>
              </Card>
            </TabPane>

            <TabPane tab="奖励设置" key="rewards">
              <Card>
                <Form.Item name="follow_reward" label="关注奖励 (USDT)">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="invite_reward" label="邀请奖励 (USDT)">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </TabPane>

            <TabPane tab="钱包设置" key="wallet">
              <Card>
                <Form.Item name="support_telegram" label="客服 Telegram">
                  <Input placeholder="@support_username" />
                </Form.Item>
                <Form.Item name="wallet_tip_message" label="钱包提示语">
                  <Input.TextArea rows={3} placeholder="充值提示..." />
                </Form.Item>
                <Form.Item name="transfer_min_amount" label="最小转账金额 (USDT)">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="withdraw_min_amount" label="最小提现金额 (USDT)">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="withdraw_fee_rate" label="提现手续费率">
                  <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} placeholder="0.02 = 2%" />
                </Form.Item>
              </Card>
            </TabPane>

            <TabPane tab="充值设置" key="deposit">
              <Card>
                <Form.Item name="deposit_confirm_blocks" label="充值确认块数">
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </TabPane>
          </Tabs>
        </Form>
      </Spin>
    </div>
  );
};
