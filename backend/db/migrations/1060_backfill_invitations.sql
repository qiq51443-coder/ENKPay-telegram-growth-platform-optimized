-- Backfill invitations from users.invited_by for historical records
INSERT INTO invitations (inviter_id, invitee_id)
SELECT invited_by, id
FROM users
WHERE invited_by IS NOT NULL
ON CONFLICT (inviter_id, invitee_id) DO NOTHING;
