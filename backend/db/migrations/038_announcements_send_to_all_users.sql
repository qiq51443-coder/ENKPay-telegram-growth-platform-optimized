-- Migration 038: Add send_to_all_users column to announcements table
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS send_to_all_users BOOLEAN NOT NULL DEFAULT FALSE;
