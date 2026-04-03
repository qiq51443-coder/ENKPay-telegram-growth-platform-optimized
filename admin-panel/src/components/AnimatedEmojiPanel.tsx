import React, { useState, useEffect } from 'react';
import {
  Button, Input, Modal, Space, Tag, Tooltip, message, Spin, Divider, Empty,
} from 'antd';
import {
  SmileOutlined, PlusOutlined, DeleteOutlined, DownloadOutlined, SettingOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const STORAGE_KEY = 'enkpay_custom_emojis';

interface CustomEmoji {
  id: string;
  fallback: string;
  label: string;
}

interface AnimatedEmojiPanelProps {
  /** Called when an emoji is clicked; receives the full <tg-emoji> tag string */
  onInsert: (tag: string) => void;
}

const DEFAULT_EMOJIS: CustomEmoji[] = [
  { id: '5471952986970267163', fallback: '🔥', label: '🔥 火焰' },
  { id: '5449767077127979601', fallback: '⭐', label: '⭐ 星星' },
  { id: '5357419756283924461', fallback: '👑', label: '👑 皇冠' },
  { id: '5461151367724015569', fallback: '💎', label: '💎 钻石' },
  { id: '5440539497383087970', fallback: '🎉', label: '🎉 庆祝' },
  { id: '5388823707011509811', fallback: '💰', label: '💰 金钱' },
  { id: '5346026631252222062', fallback: '🚀', label: '🚀 火箭' },
];

const loadSaved = (): CustomEmoji[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_EMOJIS;
};

const saveToDisk = (emojis: CustomEmoji[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis));
};

export const AnimatedEmojiPanel: React.FC<AnimatedEmojiPanelProps> = ({ onInsert }) => {
  const [emojis, setEmojis] = useState<CustomEmoji[]>(loadSaved);
  const [manageOpen, setManageOpen] = useState(false);
  const [packName, setPackName] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchedEmojis, setFetchedEmojis] = useState<Array<{ id: string; fallback: string }>>([]);
  const [fetchedTitle, setFetchedTitle] = useState('');
  const [manualId, setManualId] = useState('');
  const [manualFallback, setManualFallback] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  useEffect(() => {
    saveToDisk(emojis);
  }, [emojis]);

  const handleInsert = (emoji: CustomEmoji) => {
    const tag = `<tg-emoji emoji-id="${emoji.id}">${emoji.fallback}</tg-emoji>`;
    onInsert(tag);
  };

  const handleFetchPack = async () => {
    if (!packName.trim()) {
      message.warning('请输入 Sticker Pack 名称');
      return;
    }
    setFetchLoading(true);
    setFetchedEmojis([]);
    setFetchedTitle('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/admin/sticker-set/${encodeURIComponent(packName.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFetchedEmojis(res.data.emojis || []);
      setFetchedTitle(res.data.title || packName);
      if ((res.data.emojis || []).length === 0) {
        message.warning('该 Pack 中没有找到 Custom Emoji 类型的贴纸（只支持 custom_emoji 类型）');
      } else {
        message.success(`已找到 ${res.data.emojis.length} 个动态表情`);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '获取失败，请检查 Pack 名称');
    } finally {
      setFetchLoading(false);
    }
  };

  const handleImportAll = () => {
    if (fetchedEmojis.length === 0) return;
    const newEmojis: CustomEmoji[] = fetchedEmojis.map((e, i) => ({
      id: e.id,
      fallback: e.fallback,
      label: `${e.fallback} ${fetchedTitle}-${i + 1}`,
    }));
    // Deduplicate by id
    const existing = new Set(emojis.map((e) => e.id));
    const toAdd = newEmojis.filter((e) => !existing.has(e.id));
    if (toAdd.length === 0) {
      message.info('所有表情已存在，无需重复添加');
      return;
    }
    setEmojis((prev) => [...prev, ...toAdd]);
    message.success(`已导入 ${toAdd.length} 个表情`);
  };

  const handleImportOne = (e: { id: string; fallback: string }, idx: number) => {
    if (emojis.some((x) => x.id === e.id)) {
      message.info('该表情已在列表中');
      return;
    }
    setEmojis((prev) => [
      ...prev,
      { id: e.id, fallback: e.fallback, label: `${e.fallback} ${fetchedTitle}-${idx + 1}` },
    ]);
    message.success('已添加');
  };

  const handleManualAdd = () => {
    if (!manualId.trim()) {
      message.warning('请输入 Emoji ID');
      return;
    }
    if (emojis.some((e) => e.id === manualId.trim())) {
      message.warning('该 Emoji ID 已存在');
      return;
    }
    setEmojis((prev) => [
      ...prev,
      {
        id: manualId.trim(),
        fallback: manualFallback.trim() || '⭐',
        label: manualLabel.trim() || `自定义-${Date.now()}`,
      },
    ]);
    setManualId('');
    setManualFallback('');
    setManualLabel('');
    message.success('已添加');
  };

  const handleDelete = (id: string) => {
    setEmojis((prev) => prev.filter((e) => e.id !== id));
  };

  const handleReset = () => {
    setEmojis(DEFAULT_EMOJIS);
    message.success('已重置为默认表情列表');
  };

  return (
    <div>
      {/* Quick-insert buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {emojis.length === 0 && (
          <span style={{ color: '#999', fontSize: 12 }}>暂无表情，点击右侧"管理"添加</span>
        )}
        {emojis.map((e) => (
          <Tooltip key={e.id} title={`ID: ${e.id}`} placement="top">
            <Button
              size="small"
              onClick={() => handleInsert(e)}
              style={{ padding: '0 8px' }}
            >
              {e.label}
            </Button>
          </Tooltip>
        ))}
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setManageOpen(true)}
          style={{ marginLeft: 4 }}
        >
          管理表情
        </Button>
      </div>

      {/* Management Modal */}
      <Modal
        title="动态表情管理"
        open={manageOpen}
        onCancel={() => setManageOpen(false)}
        footer={[
          <Button key="reset" danger onClick={handleReset}>
            重置为默认
          </Button>,
          <Button key="close" type="primary" onClick={() => setManageOpen(false)}>
            完成
          </Button>,
        ]}
        width={680}
      >
        {/* Section 1: Fetch from sticker pack */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            📦 从 Sticker Pack 导入
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            输入 Telegram Sticker Pack 的名称（t.me/addstickers/<b>名称</b>），点击拉取获取所有 Custom Emoji ID。
            只支持 <b>custom_emoji</b> 类型的贴纸包（普通贴纸包不含 emoji ID）。
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="Pack 名称，例如：LedScreenEmoji"
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              onPressEnter={handleFetchPack}
            />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleFetchPack}
              loading={fetchLoading}
              type="primary"
            >
              拉取
            </Button>
          </Space.Compact>

          {fetchLoading && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Spin tip="正在从 Telegram 拉取..." />
            </div>
          )}

          {!fetchLoading && fetchedEmojis.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Tag color="blue">{fetchedTitle}（共 {fetchedEmojis.length} 个）</Tag>
                <Button size="small" icon={<PlusOutlined />} onClick={handleImportAll}>
                  全部导入
                </Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 4, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                {fetchedEmojis.map((e, i) => (
                  <Tooltip key={e.id} title={`ID: ${e.id}`}>
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => handleImportOne(e, i)}
                    >
                      {e.fallback}
                    </Button>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          {!fetchLoading && fetchedEmojis.length === 0 && packName && (
            <Empty style={{ marginTop: 12 }} description="暂无结果，请先点击拉取" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Section 2: Manual add */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>✏️ 手动添加</div>
          <Space style={{ width: '100%' }} direction="vertical" size={6}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                style={{ width: '50%' }}
                placeholder="Emoji ID（数字）"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
              />
              <Input
                style={{ width: '20%' }}
                placeholder="替代字符"
                value={manualFallback}
                onChange={(e) => setManualFallback(e.target.value)}
                maxLength={2}
              />
              <Input
                style={{ width: '30%' }}
                placeholder="标签名"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
              />
            </Space.Compact>
            <Button icon={<PlusOutlined />} onClick={handleManualAdd} size="small">
              添加
            </Button>
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Section 3: Manage existing */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            🗂️ 当前表情列表（{emojis.length} 个）
          </div>
          {emojis.length === 0 ? (
            <Empty description="暂无表情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {emojis.map((e) => (
                <Tag
                  key={e.id}
                  closable
                  onClose={() => handleDelete(e.id)}
                  icon={<DeleteOutlined />}
                  style={{ cursor: 'default', fontSize: 12 }}
                >
                  {e.label}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AnimatedEmojiPanel;
