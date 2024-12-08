
DROP TABLE IF EXISTS "messages";
CREATE TABLE "messages" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "message_id" Integer NOT NULL,
  "content" TEXT NOT NULL
);