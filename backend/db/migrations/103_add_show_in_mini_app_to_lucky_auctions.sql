-- Migration 103: Add show_in_mini_app column to lucky_auctions table
-- This column controls whether an expired auction is displayed in the mini-app's "results" view
ALTER TABLE lucky_auctions
  ADD COLUMN IF NOT EXISTS show_in_mini_app BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN lucky_auctions.show_in_mini_app IS '已过期活动是否在迷你App开奖结果中展示';
