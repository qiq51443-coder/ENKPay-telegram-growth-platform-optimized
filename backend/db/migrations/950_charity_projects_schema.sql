-- charity_projects table (used by charity.ts routes)
CREATE TABLE IF NOT EXISTS charity_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  goal_amount DECIMAL(10, 2) DEFAULT 0 CHECK (goal_amount >= 0),
  raised_amount DECIMAL(10, 2) DEFAULT 0 CHECK (raised_amount >= 0),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  organization TEXT,
  website_url TEXT,
  ambassador_telegram TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- charity_donations table (used by charity.ts donate endpoint)
CREATE TABLE IF NOT EXISTS charity_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES charity_projects(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- charity_banners table (used by charity.ts banners endpoints)
CREATE TABLE IF NOT EXISTS charity_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add wallet_balance column to users if not exists (used in charity donate)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(10, 2) DEFAULT 0;
