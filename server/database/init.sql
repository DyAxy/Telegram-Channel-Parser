-- 初始化 sqlite
DROP TABLE IF EXISTS "messages";

-- 主表
CREATE TABLE "messages" (
  -- 索引唯一 id
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  -- 消息 id
  "message_id" INTEGER NOT NULL UNIQUE,
  -- 内容缓存 (已加密)
  "content" TEXT NOT NULL,
  -- Unix 时间戳
  "created_at" INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  "updated_at" INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建索引
CREATE UNIQUE INDEX "idx_messages_message_id" ON "messages" ("message_id");

-- 确保字段 readonly
CREATE TRIGGER messages_prevent_id_modification
BEFORE UPDATE ON messages
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN OLD.id != NEW.id THEN
            RAISE(ABORT, 'Cannot modify id field')
    END;
END;

-- 自动更新 updated_at
CREATE TRIGGER messages_update_timestamp
AFTER UPDATE ON messages
BEGIN
    UPDATE messages 
    SET updated_at = strftime('%s', 'now')
    WHERE id = NEW.id;
END;