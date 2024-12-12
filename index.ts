import fs from "fs";
import readline from "readline";

import { Api, Logger, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { EditedMessage } from "telegram/events/EditedMessage";
import { DeletedMessage } from "telegram/events/DeletedMessage";
import { LogLevel } from "telegram/extensions/Logger";

export const logger = new Logger();

import * as SQLite from "./utils/sqlite";
import * as Telegram from "./utils/telegram";
import initServer from "./utils/server"

export const database = SQLite.initDatabase();

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'none': LogLevel.NONE,
  'error': LogLevel.ERROR,
  'warn': LogLevel.WARN,
  'info': LogLevel.INFO,
  'debug': LogLevel.DEBUG
};

logger.setLevel(LOG_LEVEL_MAP[Bun.env.LOG_LEVEL ?? 'debug'] ?? LogLevel.DEBUG);

const initTelegram = async () => {
  const sessionPath = Bun.env.SESSION_FILE || "./.session";
  logger.info(`Initializing Telegram with session file: ${sessionPath}`);
  const getSession = () => {
    try {
      return fs.readFileSync(sessionPath, "utf8");
    } catch (err) {
      return "";
    }
  };

  // Save the session
  const saveSession = (session: any) => {
    try {
      logger.info(`Saving session to ${sessionPath}`);
      fs.writeFileSync(sessionPath, session);
    } catch (err) {
      logger.error((err as Error).message);
    }
  };

  const apiId = parseInt(Bun.env.API_ID!);
  const apiHash = Bun.env.API_HASH!;
  const stringSession = new StringSession(getSession());

  logger.info(`Logging in to Telegram (API ID: ${apiId}), may take a while...`);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  client.setLogLevel(LogLevel.INFO);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await client.start({
    phoneNumber: async () =>
      new Promise((resolve) =>
        rl.question("Please enter your number:\n", resolve)
      ),
    password: async () =>
      new Promise((resolve) =>
        rl.question("Please enter your password:\n", resolve)
      ),
    phoneCode: async () =>
      new Promise((resolve) =>
        rl.question("Please enter the code you received:\n", resolve)
      ),
    onError: (e) => logger.error(e.message),
  });

  // Initialize the handlers
  logger.info("Initializing Telegram handlers...");
  client.addEventHandler(Telegram.handleNewMessage, new NewMessage({}));
  client.addEventHandler(Telegram.handleEditedMessage, new EditedMessage({}));
  client.addEventHandler(Telegram.handleDeleteMessage, new DeletedMessage({}));
  // Save the session
  saveSession(client.session.save());
  logger.info("Telegram logged in");
  // Initialize the config

  return client;
};

export const client = await initTelegram();

const checkConfig = async () => {
  const result = await Telegram.getMe();
  SQLite.updateMe(JSON.stringify(result));
};

await checkConfig();

const checkDatabase = async () => {
  try {
    logger.info("Checking database...");
    const savedMessages = (await SQLite.getMessages()) as DataMessages[];
    const lastMessage = await Telegram.getLastMessage();
    const startId =
      savedMessages.length === 0 ? 0 : savedMessages[0].message_id;
    const endId = lastMessage.messages[0].id + 1;
    const itemsPerTimes = 500;

    if (startId + 1 < endId) {
      logger.info("Fetching messages...");
      const times = Math.ceil((endId - startId) / itemsPerTimes);
      const messages = [];
      for (let i = 0; i < times; i++) {
        const minId = startId + i * itemsPerTimes;
        const maxId =
          minId + itemsPerTimes > endId ? endId : minId + itemsPerTimes;

        const result = await Telegram.getMessages(minId, maxId);
        messages.push(...result);
        break;
      }
      messages.sort((a, b) => a.message_id - b.message_id);
      for (const message of messages) {
        SQLite.insertMessage(
          message.message_id,
          JSON.stringify(message.content)
        );
      }
      logger.info("Fetch messages done");
    } else {
      logger.info("No new messages");
    }
  } catch (err) {
    process.exit(1);
  }
};
await checkDatabase();


initServer();