-- Invert `prefixRepliesAsHelper` meaning in application code:
--   false → prefix lines with "StreamCoreHelper · " (default)
--   true  → raw broadcaster messages (no label)
-- Flip existing rows so behaviour stays the same for users who already configured the old switch.
UPDATE "BotSettings" SET "prefixRepliesAsHelper" = NOT "prefixRepliesAsHelper";
