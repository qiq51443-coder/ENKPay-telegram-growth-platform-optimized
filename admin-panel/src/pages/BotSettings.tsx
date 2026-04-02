import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, InputNumber, message, Tabs, Spin, Upload, Divider, Space } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload/interface';
import { SaveOutlined, UploadOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TabPane } = Tabs;

interface Bot {
  id: string;
  name: string;
  username: string;
  is_active: boolean;
}

export const BotSettings: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [savingTab, setSavingTab] = useState<string | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [welcomeForm] = Form.useForm();
  const [rewardsForm] = Form.useForm();
  const [walletForm] = Form.useForm();
  const [depositForm] = Form.useForm();

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

      // Normalize multi-URL fields: prefer arrays, fall back to single legacy strings
      const groupUrls: string[] =
        Array.isArray(settings.official_group_urls) && settings.official_group_urls.length > 0
          ? settings.official_group_urls
          : settings.official_group_url
          ? [settings.official_group_url]
          : [];
      const channelUrls: string[] =
        Array.isArray(settings.official_channel_urls) && settings.official_channel_urls.length > 0
          ? settings.official_channel_urls
          : settings.official_channel_url
          ? [settings.official_channel_url]
          : [];

      welcomeForm.setFieldsValue({
        welcome_message: settings.welcome_message ?? '',
        welcome_image_url: settings.welcome_image_url ?? '',
        official_group_urls: groupUrls.map((url: string) => ({ url })),
        official_channel_urls: channelUrls.map((url: string) => ({ url })),
        support_telegram: settings.support_telegram ?? '',
      });
      rewardsForm.setFieldsValue({
        follow_reward: settings.follow_reward,
        invite_reward: settings.invite_reward,
      });
      walletForm.setFieldsValue({
        support_telegram: settings.support_telegram ?? '',
        wallet_tip_message: settings.wallet_tip_message ?? '',
        transfer_min_amount: settings.transfer_min_amount,
        withdraw_min_amount: settings.withdraw_min_amount,
        withdraw_fee_rate: settings.withdraw_fee_rate,
      });
      depositForm.setFieldsValue({
        deposit_confirm_blocks: settings.deposit_confirm_blocks,
      });

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
      welcomeForm.resetFields();
      rewardsForm.resetFields();
      walletForm.resetFields();
      depositForm.resetFields();
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
      if (file.size / 1024 / 1024 > 10) {
        message.error('图片大小不能超过 10MB');
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      const rcFile = file as RcFile;
      setFileList([{ uid: rcFile.uid, name: rcFile.name, status: 'uploading' }]);
      try {
        const result = await apiClient.uploadBotWelcomeImage(rcFile);
        const url = result.url;
        welcomeForm.setFieldValue('welcome_image_url', url);
        setFileList([{
          uid: rcFile.uid,
          name: rcFile.name,
          status: 'done',
          url,
        }]);
        message.success('图片上传成功');
        onSuccess?.(result);
      } catch (err: any) {
        message.error(err?.response?.data?.error || err?.message || '图片上传失败');
        setFileList([]);
        onError?.(err);
      }
    },
    onRemove: () => {
      setFileList([]);
      welcomeForm.setFieldValue('welcome_image_url', '');
    },
  };

  const saveTab = async (tabKey: string, form: ReturnType<typeof Form.useForm>[0], extraTransform?: (values: any) => any) => {
    if (!selectedBotId) {
      message.warning('请先选择一个Bot');
      return;
    }
    setSavingTab(tabKey);
    try {
      let values = await form.validateFields();
      if (extraTransform) values = extraTransform(values);
      // Filter out undefined values so the backend doesn't receive empty updates
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== undefined)
      );
      await apiClient.updateSettings(selectedBotId, payload);
      message.success('设置保存成功');
      // Keep support_telegram in sync between welcome and wallet tabs
      if (payload.support_telegram !== undefined) {
        if (tabKey === 'welcome') {
          walletForm.setFieldValue('support_telegram', payload.support_telegram);
        } else if (tabKey === 'wallet') {
          welcomeForm.setFieldValue('support_telegram', payload.support_telegram);
        }
      }
    } catch (error: any) {
      if (error?.errorFields) {
        // Ant Design validation error – already shown inline
        return;
      }
      console.error('Failed to save settings:', error);
      message.error(error?.response?.data?.error || error?.response?.data?.message || error?.message || '保存失败，请重试');
    } finally {
      setSavingTab(null);
    }
  };

  const transformWelcomeValues = (values: any) => {
    return {
      welcome_message: values.welcome_message ?? '',
      welcome_image_url: values.welcome_image_url ?? '',
      official_group_urls: (values.official_group_urls || []).map((item: { url: string }) => item.url).filter(Boolean),
      official_channel_urls: (values.official_channel_urls || []).map((item: { url: string }) => item.url).filter(Boolean),
      support_telegram: values.support_telegram ?? '',
    };
  };

  const SaveButton: React.FC<{ tabKey: string; form: ReturnType<typeof Form.useForm>[0]; transform?: (v: any) => any }> = ({ tabKey, form, transform }) => (
    <div style={{ marginTop: 16, textAlign: 'right' }}>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={savingTab === tabKey}
        onClick={() => saveTab(tabKey, form, transform)}
        disabled={!selectedBotId}
      >
        保存本页设置
      </Button>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Bot设置</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理各Bot的配置参数</p>
        </div>
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
      </div>

      <Spin spinning={loading}>
        <Tabs defaultActiveKey="welcome">
          <TabPane tab="欢迎语" key="welcome">
            <Card>
              <Form form={welcomeForm} layout="vertical">
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
                      placeholder="上传图片后将自动填入图片路径，也可手动输入"
                    />
                  </Form.Item>
                </Form.Item>

                <Form.Item label="官方群组链接（添加后自动显示群组按钮）">
                  <Form.List name="official_group_urls">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                            <Form.Item {...restField} name={[name, 'url']} style={{ marginBottom: 0, flex: 1, minWidth: 320 }}>
                              <Input placeholder="https://t.me/xxxxx" />
                            </Form.Item>
                            <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                          添加群组
                        </Button>
                      </>
                    )}
                  </Form.List>
                </Form.Item>

                <Form.Item label="官方频道链接（添加后自动显示频道按钮）">
                  <Form.List name="official_channel_urls">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                            <Form.Item {...restField} name={[name, 'url']} style={{ marginBottom: 0, flex: 1, minWidth: 320 }}>
                              <Input placeholder="https://t.me/xxxxx" />
                            </Form.Item>
                            <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                          添加频道
                        </Button>
                      </>
                    )}
                  </Form.List>
                </Form.Item>

                <Divider>客服设置</Divider>
                <Form.Item
                  name="support_telegram"
                  label="客服 Telegram（联系客服按钮跳转账号）"
                  extra="设置后，用户在Bot钱包页面点击「联系客服」按钮，将直接跳转到此 Telegram 账号的聊天窗口"
                >
                  <Input placeholder="例如：@your_support_bot 或 your_support_username" />
                </Form.Item>
              </Form>
              <SaveButton tabKey="welcome" form={welcomeForm} transform={transformWelcomeValues} />
            </Card>
          </TabPane>

          <TabPane tab="奖励设置" key="rewards">
            <Card>
              <Form form={rewardsForm} layout="vertical">
                <Form.Item name="follow_reward" label="关注奖励 (USDT)">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="invite_reward" label="邀请奖励 (USDT)">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Form>
              <SaveButton tabKey="rewards" form={rewardsForm} />
            </Card>
          </TabPane>

          <TabPane tab="钱包设置" key="wallet">
            <Card>
              <Form form={walletForm} layout="vertical">
                <Form.Item
                  name="support_telegram"
                  label="客服 Telegram 用户名（用户点击'联系客服'按钮将直接跳转此账号）"
                  extra="设置后，用户在Bot钱包页面点击「联系客服」按钮，将直接跳转到此 Telegram 账号的聊天窗口"
                >
                  <Input placeholder="例如：@your_support_bot 或 your_support_username" />
                </Form.Item>
                <Form.Item
                  name="wallet_tip_message"
                  label="充值页提示语（显示在 Bot 充值地址消息底部）"
                  extra="用户在 Bot 查看充值地址时，该提示语会显示在地址下方，例如：请复制地址并向该地址转账，转账完成后大约1-3分钟系统将自动确认"
                >
                  <Input.TextArea rows={3} placeholder="请复制地址并向该地址转账，转账完成后大约1-3分钟系统将自动确认" />
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
              </Form>
              <SaveButton tabKey="wallet" form={walletForm} />
            </Card>
          </TabPane>

          <TabPane tab="充值设置" key="deposit">
            <Card>
              <Form form={depositForm} layout="vertical">
                <Form.Item name="deposit_confirm_blocks" label="充值确认块数">
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Form>
              <SaveButton tabKey="deposit" form={depositForm} />
            </Card>
          </TabPane>
        </Tabs>
      </Spin>
    </div>
  );
};
