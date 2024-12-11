import fs from "fs";
import { Database } from "bun:sqlite";

import { logger } from "..";
import type { ZlibCompressionOptions } from "bun";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib"; // alias: bun

const MAX_CONTENT_LENGTH = 1000000; // ~1MB
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms, = 1 second

export const initDatabase = async (): Promise<Database> => {
  logger.info("Initializing database...");
  const dbPath = Bun.env.MESSAGE_SQLITE_FILE || "./database/messages.db";
  const dbDir = dbPath.substring(0, dbPath.lastIndexOf("/"));

  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const isNew = !fs.existsSync(dbPath);
    const database = new Database(dbPath);

    database.exec("PRAGMA foreign_keys = ON;");
    database.exec("PRAGMA journal_mode = WAL;");

    if (isNew) {
      const initSQL = fs.readFileSync("./database/init.sql", "utf8");
      database.transaction(() => {
        database.exec(initSQL);
        const stmt = database.prepare(`
          INSERT INTO config (channel, version) 
          VALUES (?, ?)
        `);
        stmt.run(Bun.env.CHANNEL_ID!, 1);
      })();
    } else {
      const stmt = database.prepare("SELECT * FROM config LIMIT 1");
      const result = stmt.get() as DataConfig;
      if (result.channel !== Bun.env.CHANNEL_ID) {
        throw new Error("Database channel mismatch");
      }
    }
    logger.info("Database initialized successfully");
    return database;
  } catch (error: any) {
    logger.error(`Database initialization failed: ${error.message}`);
    process.exit(1);
  }
};

export class MessageManager {
  private database: Database;
  private static instance: MessageManager | null = null;
  private retryCount: Map<string, number> = new Map();

  private constructor(database: Database) {
    this.database = database;
  }

  public static getInstance(database: Database): MessageManager {
    if (!MessageManager.instance) {
      MessageManager.instance = new MessageManager(database);
    }
    return MessageManager.instance;
  }

  private async retry<T>(operation: () => Promise<T>, key: string): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      const currentRetries = this.retryCount.get(key) || 0;
      if (currentRetries < MAX_RETRIES && this.isRetryableError(error)) {
        this.retryCount.set(key, currentRetries + 1);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return this.retry(operation, key);
      }
      this.retryCount.delete(key);
      throw error;
    }
  }

  private isRetryableError(error: Error): boolean {
    return (
      error.message.includes("database is locked") ||
      error.message.includes("busy") ||
      error.message.includes("no response")
    );
  }

  private compress(data: string): string {
    try {
      if (typeof data !== "string") {
        throw new TypeError("Input must be a string");
      }

      const params = {
        [constants.BROTLI_PARAM_QUALITY]: parseInt(Bun.env.CONTENT_ENCODE_CPU_LEVEL ?? "4"),
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.length
      };

      const originalLength = data.length;
      const originalSize = Buffer.from(data).length;

      logger.debug(`Original content: ${originalLength} chars, ${(originalSize / 1024).toFixed(3)}KB`);
      logger.debug(`Brotli Quality: ${params[constants.BROTLI_PARAM_QUALITY]}`);

      const compressedData = brotliCompressSync(data, { params });
      const compressedSize = compressedData.length;
      const base64Result = compressedData.toString("base64");
      const compressionRatio = (originalSize / compressedSize).toFixed(2);
      const reductionPercent = (100 - (compressedSize / originalSize * 100)).toFixed(3);

      logger.debug(`Compressed size: ${(compressedSize / 1024).toFixed(2)}KB`);
      logger.debug(`Compression ratio: ${compressionRatio}x (${reductionPercent}% reduction)`);
      logger.debug(`Base64 result length: ${base64Result.length} chars`);

      return base64Result;
    } catch (error: any) {
      throw new Error(`Compression failed: ${error.message}`);
    }
  }

  private decompress(data: string): string {
    try {
      if (typeof data !== "string") {
        throw new TypeError("Input must be a string");
      }
      const compressedData = Buffer.from(data, "base64");
      const decompressedData = brotliDecompressSync(new Uint8Array(compressedData));
      return decompressedData.toString();
    } catch (error: any) {
      throw new Error(`Decompression failed: ${error.message}`);
    }
  }

  public async messageExists(messageId: number): Promise<boolean> {
    return this.retry(async () => {
      this.validateMessageId(messageId);
      const stmt = this.database.prepare(
        "SELECT 1 FROM messages WHERE message_id = ? LIMIT 1"
      );
      return stmt.get(messageId) !== null;
    }, `messageExists_${messageId}`);
  }

  public async deleteMessage(messageId: number): Promise<void> {
    return this.retry(async () => {
      this.validateMessageId(messageId);
      const exists = await this.messageExists(messageId);
      if (exists) {
        const result = this.database.transaction(() => {
          const stmt = this.database.prepare(
            "DELETE FROM messages WHERE message_id = ?"
          );
          return stmt.run(messageId);
        })();
        if (result.changes === 0) {
          throw new Error("Message not found");
        }
      }
    }, `deleteMessage_${messageId}`);
  }

  public async getMessage(messageId: number): Promise<DataMessages | null> {
    return this.retry(async () => {
      this.validateMessageId(messageId);

      const stmt = this.database.prepare(`
        SELECT rowid as id, message_id, content, created_at, updated_at, last_updated_at 
        FROM messages 
        WHERE message_id = ? 
        LIMIT 1
      `);

      const message = stmt.get(messageId) as DataMessages | null;

      if (!message) return null;

      return {
        id: message.id,
        message_id: message.message_id,
        content: this.decompress(message.content),
        created_at: message.created_at,
        updated_at: message.updated_at,
        last_updated_at: message.last_updated_at,
      };
    }, `getMessage_${messageId}`);
  }

  public async getMessages(): Promise<DataMessages[]> {
    return this.retry(async () => {
      const stmt = this.database.prepare(
        "SELECT rowid as id, message_id, content, created_at, updated_at, last_updated_at FROM messages"
      );
      const messages = stmt.all() as Array<DataMessages>;
      messages.sort((a, b) => b.message_id - a.message_id);
      return messages.map((message) => ({
        id: message.id,
        message_id: message.message_id,
        content: this.decompress(message.content),
        created_at: message.created_at,
        updated_at: message.updated_at,
        last_updated_at: message.last_updated_at,
      }));
    }, "getMessages");
  }

  public async insertMessage(
    messageId: number,
    content: string
  ): Promise<void> {
    return this.retry(async () => {
      this.validateMessageId(messageId);
      this.validateContent(content);

      const exists = await this.messageExists(messageId);
      if (exists) {
        throw new Error(`Message with ID ${messageId} already exists`);
      }

      const compressedContent = this.compress(content);
      const contentObejct = JSON.parse(content);
      const created_at = new Date(contentObejct.createDate).getTime();
      const updated_at = new Date(contentObejct.editedDate || contentObejct.createDate).getTime();

      this.database.transaction(() => {
        const stmt = this.database.prepare(`
          INSERT INTO messages (message_id, content, created_at, updated_at, last_updated_at) 
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(messageId, compressedContent, created_at, updated_at, Math.floor(Date.now() / 1000));
      })();
    }, `insertMessage_${messageId}`);
  }

  public async updateMessage(
    messageId: number,
    content: string
  ): Promise<void> {
    return this.retry(async () => {
      this.validateMessageId(messageId);
      this.validateContent(content);

      const compressedContent = this.compress(content);
      const now = Date.now();

      const result = this.database.transaction(() => {
        const stmt = this.database.prepare(`
          UPDATE messages 
          SET content = ?, updated_at = ? 
          WHERE message_id = ?
        `);
        return stmt.run(compressedContent, now, messageId);
      })();

      if (result.changes === 0) {
        throw new Error(`Message with ID ${messageId} not found`);
      }
    }, `updateMessage_${messageId}`);
  }

  private validateMessageId(messageId: number): void {
    if (
      !Number.isInteger(messageId) ||
      messageId <= 0 ||
      messageId > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        "Invalid message ID: must be a positive integer within safe range"
      );
    }
  }

  private validateContent(content: string): void {
    if (typeof content !== "string") {
      throw new TypeError("Content must be a string");
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      throw new Error("Content cannot be empty");
    }

    if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_LENGTH) {
      throw new Error(
        `Content exceeds maximum length limit of ${MAX_CONTENT_LENGTH} bytes`
      );
    }
  }

  public async getMessageCount(): Promise<number> {
    return this.retry(async () => {
      const stmt = this.database.prepare(
        "SELECT COUNT(*) as count FROM messages"
      );
      const result = stmt.get() as { count: number };
      return result.count;
    }, "getMessageCount");
  }
  public async getMe(): Promise<string> {
    return this.retry(async () => {
      const stmt = this.database.prepare(`
        SELECT data 
        FROM config
      `);
      const { data } = stmt.get() as { data: string };
      return data;
    }, "updateMe");
  }
  public async updateMe(data: string): Promise<void> {
    return this.retry(async () => {
      const stmt = this.database.prepare(`
        UPDATE config 
        SET data = ?
      `);
      stmt.run(data);
    }, "updateMe");
  }
}

// 单例模式的工厂函数
let messageManagerInstance: MessageManager | null = null;
let databaseInstance: Database | null = null;

export const getMessageManager = async (): Promise<MessageManager> => {
  if (!messageManagerInstance) {
    if (!databaseInstance) {
      databaseInstance = await initDatabase();
    }
    messageManagerInstance = MessageManager.getInstance(databaseInstance);
  }
  return messageManagerInstance;
};

// 导出异步工具函数
export const getMessages = async (): Promise<DataMessages[]> => {
  const manager = await getMessageManager();
  return manager.getMessages();
};

export const insertMessage = async (
  messageId: number,
  content: string
): Promise<void> => {
  const manager = await getMessageManager();
  return manager.insertMessage(messageId, content);
};

export const deleteMessage = async (messageId: number): Promise<void> => {
  const manager = await getMessageManager();
  return manager.deleteMessage(messageId);
};

export const getMessage = async (
  messageId: number
): Promise<DataMessages | null> => {
  const manager = await getMessageManager();
  return manager.getMessage(messageId);
};

export const updateMessage = async (
  messageId: number,
  content: string
): Promise<void> => {
  const manager = await getMessageManager();
  return manager.updateMessage(messageId, content);
};

export const getMessageCount = async (): Promise<number> => {
  const manager = await getMessageManager();
  return manager.getMessageCount();
};

export const messageExists = async (messageId: number): Promise<boolean> => {
  const manager = await getMessageManager();
  return manager.messageExists(messageId);
};

export const getMe = async (): Promise<string> => {
  const manager = await getMessageManager();
  return manager.getMe();
};

export const updateMe = async (data: string): Promise<void> => {
  const manager = await getMessageManager();
  return manager.updateMe(data);
};
