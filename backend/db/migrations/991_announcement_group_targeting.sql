-- Add group targeting fields to announcements
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'announcements' AND column_name = 'announcement_bot_id') THEN
    ALTER TABLE announcements ADD COLUMN announcement_bot_id UUID REFERENCES bots(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'announcements' AND column_name = 'target_group_ids') THEN
    ALTER TABLE announcements ADD COLUMN target_group_ids TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- Add media_url to broadcasts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'broadcasts' AND column_name = 'media_url') THEN
    ALTER TABLE broadcasts ADD COLUMN media_url TEXT;
  END IF;
END $$;
