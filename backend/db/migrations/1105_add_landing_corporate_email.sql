-- Add corporate email social field for landing page settings
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES ('landing_social_corporate_email', '""', '企业邮箱（官网社交入口）', 'landing', true)
ON CONFLICT (key) DO NOTHING;
