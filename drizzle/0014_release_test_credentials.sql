-- Testers cannot test what they cannot sign into. The credentials for a UAT
-- environment were being emailed or pasted into chat, so a client landing in the
-- portal still had to go hunting for them. They live on the release because they
-- change with the build.
--
-- These are throwaway test-environment credentials stored in plain text, and the
-- UI says so at the point of entry. Never put a real account here.
ALTER TABLE `releases` ADD COLUMN `test_credentials` TEXT NOT NULL DEFAULT '';
