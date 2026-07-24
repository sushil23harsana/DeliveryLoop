-- Releases have been created as 'Preparing' since day one, because no action
-- ever moved them onwards. Now that 'Preparing' means "hidden from the client",
-- every release a client is currently testing would disappear from their portal
-- the moment the new code deploys.
--
-- Anything that shows evidence of real testing — filed feedback, a checklist the
-- client has started, or a start date that has already passed — is moved to
-- 'Testing' so it stays visible. Genuine drafts stay 'Preparing'.
--
-- Must be applied BEFORE the code deploy (migration-first ordering).
UPDATE `releases` SET `status` = 'Testing'
WHERE `status` = 'Preparing'
  AND (
    `id` IN (SELECT DISTINCT `release_id` FROM `tickets`)
    OR `id` IN (SELECT `release_id` FROM `checklist_items` WHERE `state` <> 'Not tested')
    OR `start_date` <= date('now')
  );
