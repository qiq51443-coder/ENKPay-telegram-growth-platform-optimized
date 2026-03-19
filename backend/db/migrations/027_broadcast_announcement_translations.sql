-- Migration 027: Add multilingual translation fields to broadcasts and announcements

-- broadcasts: add content_translations (JSONB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'broadcasts' AND column_name = 'content_translations') THEN
    ALTER TABLE broadcasts ADD COLUMN content_translations JSONB DEFAULT '{}';
  END IF;
END $$;

-- broadcasts: add title_translations (JSONB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'broadcasts' AND column_name = 'title_translations') THEN
    ALTER TABLE broadcasts ADD COLUMN title_translations JSONB DEFAULT '{}';
  END IF;
END $$;

-- announcements: add content_translations (JSONB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'announcements' AND column_name = 'content_translations') THEN
    ALTER TABLE announcements ADD COLUMN content_translations JSONB DEFAULT '{}';
  END IF;
END $$;

-- announcements: add title_translations (JSONB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'announcements' AND column_name = 'title_translations') THEN
    ALTER TABLE announcements ADD COLUMN title_translations JSONB DEFAULT '{}';
  END IF;
END $$;
