import React, { useState, useEffect } from 'react';
import {
  Button, Input, Modal, Space, Tag, Tooltip, message, Spin, Divider, Empty,
} from 'antd';
import {
  PlusOutlined, DownloadOutlined, SettingOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const STORAGE_KEY = 'enkpay_custom_emojis';

interface CustomEmoji {
  id: string;
  fallback: string;
  label: string;
  thumbnailFileId?: string;
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

const normalizeEmoji = (raw: any): CustomEmoji | null => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;

  const fallback = typeof raw?.fallback === 'string' && raw.fallback.trim()
    ? raw.fallback.trim()
    : '⭐';
  const label = typeof raw?.label === 'string' && raw.label.trim()
    ? raw.label.trim()
    : `${fallback} 自定义表情`;
  const thumbnailRaw = typeof raw?.thumbnailFileId === 'string'
    ? raw.thumbnailFileId
    : raw?.thumbnail_file_id;
  const thumbnailFileId = typeof thumbnailRaw === 'string' && thumbnailRaw.trim()
    ? thumbnailRaw.trim()
    : undefined;

  return { id, fallback, label, thumbnailFileId };
};

const normalizeEmojiList = (raw: any): CustomEmoji[] => {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const emojis: CustomEmoji[] = [];
  raw.forEach((item) => {
    const emoji = normalizeEmoji(item);
    if (!emoji || seen.has(emoji.id)) return;
    seen.add(emoji.id);
    emojis.push(emoji);
  });
  return emojis;
};

const loadSaved = (): CustomEmoji[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeEmojiList(JSON.parse(raw));
  } catch (err) {
    console.warn('Failed to load emoji list from localStorage, using defaults:', err);
  }
  return DEFAULT_EMOJIS;
};

const saveToDisk = (emojis: CustomEmoji[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis));
};

const TelegramEmojiImage: React.FC<{ emoji: Pick<CustomEmoji, 'fallback' | 'thumbnailFileId'>; size?: number }> = ({ emoji, size = 32 }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const loadThumbnail = async () => {
      setImgError(false);
      setImgSrc(null);

      if (!emoji.thumbnailFileId) return;

      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/admin/sticker-file/${encodeURIComponent(emoji.thumbnailFileId)}`, {
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          responseType: 'blob',
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setImgSrc(objectUrl);
      } catch (_err) {
        if (!cancelled) {
          setImgError(true);
        }
      }
    };

    loadThumbnail();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [emoji.thumbnailFileId]);

  if (imgSrc && !imgError) {
    return (
      <img
        src={imgSrc}
        alt={emoji.fallback}
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block' }}
        onError={() => {
          setImgError(true);
          setImgSrc(null);
        }}
      />
    );
  }

  return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>{emoji.fallback}</span>;
};

export const AnimatedEmojiPanel: React.FC<AnimatedEmojiPanelProps> = ({ onInsert }) => {
  const [emojis, setEmojis] = useState<CustomEmoji[]>(loadSaved);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [packName, setPackName] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchedEmojis, setFetchedEmojis] = useState<Array<{ id: string; fallback: string; thumbnail_file_id?: string }>>([]);
  const [fetchedTitle, setFetchedTitle] = useState('');
  const [manualId, setManualId] = useState('');
  const [manualFallback, setManualFallback] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [hadLocalCache] = useState(() => localStorage.getItem(STORAGE_KEY) !== null);

  useEffect(() => {
    saveToDisk(emojis);
  }, [emojis]);

  useEffect(() => {
    let cancelled = false;

    const syncLibrary = async () => {
      setLibraryLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: 'Bearer ' + token } : {};
        const res = await axios.get('/api/admin/custom-emojis', { headers });

        if (cancelled) return;

        const remoteList = normalizeEmojiList(res.data?.emojis);
        const localList = loadSaved();
        const nextList = res.data?.exists === false
          ? (remoteList.length > 0 ? remoteList : DEFAULT_EMOJIS)
          : remoteList;

        if (res.data?.exists === false && hadLocalCache) {
          setEmojis(localList);
          saveToDisk(localList);

          try {
            await axios.put('/api/admin/custom-emojis', { emojis: localList }, { headers });
          } catch (saveError) {
            console.warn('Failed to migrate cached emoji library to backend:', saveError);
          }
          return;
        }

        setEmojis(nextList);
        saveToDisk(nextList);
      } catch (error) {
        console.warn('Failed to load emoji library from backend, using local cache:', error);
      } finally {
        if (!cancelled) {
          setLibraryLoading(false);
        }
      }
    };

    syncLibrary();

    return () => {
      cancelled = true;
    };
  }, [hadLocalCache]);

  const persistEmojiLibrary = async (nextEmojis: CustomEmoji[], successText?: string) => {
    const normalized = normalizeEmojiList(nextEmojis);
    setEmojis(normalized);
    saveToDisk(normalized);

    try {
      const token = localStorage.getItem('token');
      await axios.put(
        '/api/admin/custom-emojis',
        { emojis: normalized },
        { headers: token ? { Authorization: 'Bearer ' + token } : {} }
      );
      if (successText) {
        message.success(successText);
      }
    } catch (error: any) {
      console.warn('Failed to save emoji library to backend:', error);
      message.warning(error.response?.data?.error || '已保存到本地缓存，但同步后端失败');
    }
  };

  const handleInsert = (emoji: CustomEmoji) => {
    const tag = `<tg-emoji emoji-id="${emoji.id}">${emoji.fallback}</tg-emoji>`;
    onInsert(tag);
  };

  const handleFetchPack = async () => {
    if (!packName.trim()) {
      message.warning('请输入 Sticker Pack 名称');
      return;
    }
    let name = packName.trim();
    const urlMatch = name.match(/(?:https?:\/\/)?(?:t\.me\/(?:addemoji|addstickers)\/)([A-Za-z0-9_]+)/i);
    if (urlMatch) {
      name = urlMatch[1];
    }
    setFetchLoading(true);
    setFetchedEmojis([]);
    setFetchedTitle('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/admin/sticker-set/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFetchedEmojis(res.data.emojis || []);
      setFetchedTitle(res.data.title || name);
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
      thumbnailFileId: e.thumbnail_file_id || undefined,
    }));
    // Deduplicate by id
    const existing = new Set(emojis.map((e) => e.id));
    const toAdd = newEmojis.filter((e) => !existing.has(e.id));
    if (toAdd.length === 0) {
      message.info('所有表情已存在，无需重复添加');
      return;
    }
    void persistEmojiLibrary([...emojis, ...toAdd], `已导入 ${toAdd.length} 个表情`);
  };

  const handleImportOne = (e: { id: string; fallback: string; thumbnail_file_id?: string }, idx: number) => {
    if (emojis.some((x) => x.id === e.id)) {
      message.info('该表情已在列表中');
      return;
    }
    void persistEmojiLibrary([
      ...emojis,
      {
        id: e.id,
        fallback: e.fallback,
        label: `${e.fallback} ${fetchedTitle}-${idx + 1}`,
        thumbnailFileId: e.thumbnail_file_id || undefined,
      },
    ], '已添加');
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
    void persistEmojiLibrary([
      ...emojis,
      {
        id: manualId.trim(),
        fallback: manualFallback.trim() || '⭐',
        label: manualLabel.trim() || `自定义表情 #${emojis.length + 1}`,
      },
    ], '已添加');
    setManualId('');
    setManualFallback('');
    setManualLabel('');
  };

  const handleDelete = (id: string) => {
    void persistEmojiLibrary(emojis.filter((e) => e.id !== id));
  };

  const handleReset = () => {
    void persistEmojiLibrary(DEFAULT_EMOJIS, '已重置为默认表情列表');
  };

  return (
    <div>
      {/* Quick-insert emoji grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {emojis.length === 0 && (
          <span style={{ color: '#999', fontSize: 12 }}>暂无表情，点击右侧"管理"添加</span>
        )}
        {libraryLoading && emojis.length === 0 && <Spin size="small" />}
        {emojis.map((e) => (
          <Tooltip key={e.id} title={e.label} placement="top">
            <button
              type="button"
              onClick={() => handleInsert(e)}
              style={{
                width: 36,
                height: 36,
                padding: 2,
                border: '1px solid transparent',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e2) => {
                e2.currentTarget.style.borderColor = '#1677ff';
                e2.currentTarget.style.background = '#e6f4ff';
              }}
              onMouseLeave={(e2) => {
                e2.currentTarget.style.borderColor = 'transparent';
                e2.currentTarget.style.background = 'transparent';
              }}
            >
              <TelegramEmojiImage emoji={e} size={28} />
            </button>
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
            也可直接粘贴完整 t.me 链接。
            只支持 <b>custom_emoji</b> 类型的贴纸包（普通贴纸包不含 emoji ID）。
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="Pack 名称或链接，例如：LedScreenEmoji 或 https://t.me/addemoji/PackName"
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 240, overflowY: 'auto', padding: 4, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                {fetchedEmojis.map((e, i) => (
                  <Tooltip key={e.id} title={`点击添加 | ID: ${e.id}`}>
                    <button
                      type="button"
                      onClick={() => handleImportOne(e, i)}
                      style={{
                        width: 44,
                        height: 44,
                        padding: 4,
                        border: '1px solid #d9d9d9',
                        borderRadius: 8,
                        background: '#fafafa',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e2) => {
                        e2.currentTarget.style.borderColor = '#1677ff';
                        e2.currentTarget.style.background = '#e6f4ff';
                      }}
                      onMouseLeave={(e2) => {
                        e2.currentTarget.style.borderColor = '#d9d9d9';
                        e2.currentTarget.style.background = '#fafafa';
                      }}
                    >
                      <TelegramEmojiImage emoji={{ fallback: e.fallback, thumbnailFileId: e.thumbnail_file_id }} size={32} />
                      <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 10, color: '#1677ff', fontWeight: 600 }}>+</span>
                    </button>
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
                maxLength={10}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {emojis.map((e) => (
                <Tooltip key={e.id} title={`${e.label} | ID: ${e.id}`}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <div style={{ width: 48, height: 48, border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
                      <TelegramEmojiImage emoji={e} size={36} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#ff4d4f',
                        color: '#fff',
                        fontSize: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AnimatedEmojiPanel;
