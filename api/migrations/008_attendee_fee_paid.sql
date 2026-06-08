-- 参加者の会費徴収済みフラグ。受付 (checked_in_at) とは別軸で、
-- 当日の会費徴収を別途トラッキングするための列。
-- Phase 1 の attendee.feePaid 相当。

ALTER TABLE event_attendees ADD COLUMN fee_paid INTEGER NOT NULL DEFAULT 0;
