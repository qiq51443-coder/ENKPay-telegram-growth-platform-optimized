-- Migration: miniapp background group settings
-- 插入迷你 App 背景设置默认值

INSERT INTO system_settings (key, value, description, category, is_public)
VALUES (
  'miniapp_bg_groups',
  '{"groups":[],"rotation":"manual","current_group_id":null,"rotation_start":null}',
  '迷你App背景图片分组配置',
  'miniapp',
  true
)
ON CONFLICT (key) DO NOTHING;
