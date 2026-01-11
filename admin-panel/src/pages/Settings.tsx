import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Loading } from '../components/Common/Loading';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import apiClient from '../services/api';
import { Bot, Settings as SettingsType } from '../services/types';

export const Settings: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBots();
  }, []);

  useEffect(() => {
    if (selectedBotId) {
      fetchSettings();
    }
  }, [selectedBotId]);

  const fetchBots = async () => {
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || []);
      if (response.bots && response.bots.length > 0) {
        setSelectedBotId(response.bots[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSettings(selectedBotId);
      setSettings(response.settings);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiClient.updateSettings(selectedBotId, settings);
      alert('保存成功');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof SettingsType, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  if (loading && !settings) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
          <p className="text-gray-600 mt-1">配置平台参数和奖励规则</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <Select
              label="选择 Bot"
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              options={bots.map((bot) => ({ value: bot.id, label: bot.name }))}
            />
          </div>

          {settings && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">平台配置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="平台名称"
                    value={settings.platform_name || ''}
                    onChange={(e) => updateSetting('platform_name', e.target.value)}
                  />
                  <Input
                    label="平台链接"
                    value={settings.platform_url || ''}
                    onChange={(e) => updateSetting('platform_url', e.target.value)}
                  />
                  <Input
                    label="必需频道 ID"
                    value={settings.required_channel_id || ''}
                    onChange={(e) =>
                      updateSetting('required_channel_id', e.target.value)
                    }
                    placeholder="@channel_username"
                  />
                  <Input
                    label="必需群组 ID"
                    value={settings.required_group_id || ''}
                    onChange={(e) => updateSetting('required_group_id', e.target.value)}
                    placeholder="-1001234567890"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">奖励设置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="关注奖励 ($)"
                    type="number"
                    step="0.01"
                    value={settings.follow_reward}
                    onChange={(e) =>
                      updateSetting('follow_reward', parseFloat(e.target.value))
                    }
                  />
                  <Input
                    label="绑定奖励 ($)"
                    type="number"
                    step="0.01"
                    value={settings.bind_reward}
                    onChange={(e) =>
                      updateSetting('bind_reward', parseFloat(e.target.value))
                    }
                  />
                  <Input
                    label="截图奖励 ($)"
                    type="number"
                    step="0.01"
                    value={settings.screenshot_reward}
                    onChange={(e) =>
                      updateSetting('screenshot_reward', parseFloat(e.target.value))
                    }
                  />
                  <Input
                    label="邀请奖励 ($)"
                    type="number"
                    step="0.01"
                    value={settings.invite_reward}
                    onChange={(e) =>
                      updateSetting('invite_reward', parseFloat(e.target.value))
                    }
                  />
                  <Input
                    label="新用户积分"
                    type="number"
                    value={settings.new_user_credits}
                    onChange={(e) =>
                      updateSetting('new_user_credits', parseInt(e.target.value))
                    }
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">红包设置</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="最小红包金额 ($)"
                    type="number"
                    step="0.01"
                    value={settings.red_packet_min_amount}
                    onChange={(e) =>
                      updateSetting('red_packet_min_amount', parseFloat(e.target.value))
                    }
                  />
                  <Input
                    label="最大红包金额 ($)"
                    type="number"
                    step="0.01"
                    value={settings.red_packet_max_amount}
                    onChange={(e) =>
                      updateSetting('red_packet_max_amount', parseFloat(e.target.value))
                    }
                  />
                  <Input
                    label="最小提现金额 ($)"
                    type="number"
                    step="0.01"
                    value={settings.min_withdrawal_amount}
                    onChange={(e) =>
                      updateSetting(
                        'min_withdrawal_amount',
                        parseFloat(e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSave}
                  loading={saving}
                  variant="primary"
                  className="px-6"
                >
                  <Save className="w-4 h-4 mr-2" />
                  保存设置
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
