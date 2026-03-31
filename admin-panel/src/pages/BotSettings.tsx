import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, InputNumber, message, Tabs, Spin, Upload, Divider } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { SaveOutlined, UploadOutlined } from '@ant-design/icons';
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
  const [fileList, setFileList] = useState<UploadFile[]>([]);
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
      message.error(error?.response?.data?.error || error?.message || '获取Bot列表失败');
    }
  };

  const fetchSettings = async (botId: string) => {
    if (!botId) return;
    setLoading(true);
    try {
      const response = await apiClient.getSettings(botId);
      const settings = response.settings || {};
      form.setFieldsValue(settings);
      if (settings.welcome_image_url) {
        setFileList([
          {
            uid: '-1',
            name: 'welcome_image',
            status: 'done',
            url: settings.welcome_image_url,
          },
        ]);
      } else {
        setFileList([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      message.error(error?.response?.data?.error || error?.message || '加载设置失败');
      form.resetFields();
    } finally {
      setLoading(false);
    }
  };

  const handleBotChange = (botId: string) => {
    setSelectedBotId(botId);
    fetchSettings(botId);
  };

  const uploadProps: UploadProps = {
    name: 'file',
    listType: 'picture',
    fileList,
    accept: 'image/jpeg,image/jpg,image/png,image/gif,image/webp',
    beforeUpload: (file) => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        message.error('只能上传图片文件（JPEG/PNG/GIF/WebP）');
        return Upload.LIST_IGNORE;
      }
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error('图片大小不能超过 10MB');
        return Upload.LIST_IGNORE;
      }
      return false;
    },
    onChange: async ({ file }) => {
      if (file.status === 'removed') {
        setFileList([]);
        form.setFieldValue('welcome_image_url', '');
        return;
      }
      const rawFile = file.originFileObj;
      if (!rawFile) return;
      setFileList([{ ...file, status: 'uploading' }]);
      try {
        const result = await apiClient.uploadBotWelcomeImage(rawFile);
        const url = result.url;
        form.setFieldValue('welcome_image_url', url);
        setFileList([
          {
            uid: file.uid,
            name: file.name,
            status: 'done',
            url,
          },
        ]);
        message.success('图片上传成功');
      } catch (err: any) {
        message.error(err?.response?.data?.error || err?.message || '图片上传失败');
        setFileList([]);
      }
    },
    onRemove: () => {
      setFileList([]);
      form.setFieldValue('welcome_image_url', '');
    },
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
      message.error(error?.response?.data?.error || error?.response?.data?.message || error?.message || '保存失败，请重试');
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
                <Form.Item label="欢迎图片（留空则不发图）">
                  <Upload {...uploadProps}>
                    <Button icon={<UploadOutlined />}>点击上传图片</Button>
                  </Upload>
                  <Form.Item name="welcome_image_url" noStyle>
                    <Input
                      style={{ marginTop: 8 }}
                      readOnly
                      placeholder="上传图片后将自动填入图片路径"
                    />
                  </Form.Item>
                </Form.Item>
                <Form.Item name="official_group_url" label="官方群组链接（添加后自动显示群组按钮）">
                  <Input placeholder="https://t.me/xxxxx" />
                </Form.Item>
                <Form.Item name="official_channel_url" label="官方频道链接（添加后自动显示频道按钮）">
                  <Input placeholder="https://t.me/xxxxx" />
                </Form.Item>
                <Divider>客服设置</Divider>
                <Form.Item
                  name="support_telegram"
                  label="客服 Telegram（联系客服按钮跳转账号）"
                  extra="设置后，用户在Bot钱包页面点击「联系客服」按钮，将直接跳转到此 Telegram 账号的聊天窗口"
                >
                  <Input placeholder="例如：@your_support_bot 或 your_support_username" />
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
                <Form.Item
                  name="support_telegram"
                  label="客服 Telegram 用户名（用户点击'联系客服'按钮将直接跳转此账号）"
                  extra="设置后，用户在Bot钱包页面点击「联系客服」按钮，将直接跳转到此 Telegram 账号的聊天窗口"
                >
                  <Input placeholder="例如：@your_support_bot 或 your_support_username" />
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
