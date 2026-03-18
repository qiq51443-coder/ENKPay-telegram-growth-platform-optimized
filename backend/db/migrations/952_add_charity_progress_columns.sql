-- Migration 952: Add progress_override and progress_images to charity_projects
-- These columns are required by:
--   - backend/src/routes/charity.ts (SELECT, INSERT, UPDATE)
--   - admin-panel/src/pages/CharityProjects.tsx (form fields)
--   - mini-app/src/pages/Charity.tsx (display)
-- Using IF NOT EXISTS / conditional logic to be fully idempotent.

-- Add progress_override: admin can manually set progress percentage (0-100)
-- NULL means auto-calculate from raised_amount / target_amount
ALTER TABLE charity_projects 
  ADD COLUMN IF NOT EXISTS progress_override DECIMAL(5, 2) 
  CHECK (progress_override IS NULL OR (progress_override >= 0 AND progress_override <= 100));

-- Add progress_images: array of image URLs (base64 data URLs or http URLs) for project progress
ALTER TABLE charity_projects 
  ADD COLUMN IF NOT EXISTS progress_images TEXT[] DEFAULT '{}';
