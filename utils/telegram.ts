import bigInt from "big-integer";
import { Api } from "telegram";
import { client, logger } from "..";
import { NewMessageEvent } from "telegram/events";
import type { DeletedMessageEvent } from "telegram/events/DeletedMessage";

import * as SQLite from "./sqlite";

export const getLastMessage = async () => {
  try {
    if (!Bun.env.CHANNEL_ID) {
      throw Error("Channel ID is not set");
    }
    logger.info(`Getting last message from channel: ${Bun.env.CHANNEL_ID}`);
    const result = await client.invoke(
      new Api.messages.GetHistory({
        peer: Bun.env.CHANNEL_ID!,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit: 1,
        maxId: 0,
        minId: 0,
        hash: bigInt.zero,
      })
    );
    if (!(result instanceof Api.messages.ChannelMessages)) {
      throw Error("No messages found");
    }
    return result;
  } catch (e) {
    logger.error((e as Error).message);
    throw e;
  }
};
const parseMessageToMarkdown = (message: Api.Message) => {
  let markdownMessage = message.message;
  const entityReplacements: { [key: number]: string } = {};

  if (message.entities) {
    for (const entity of message.entities) {
      if (entity instanceof Api.MessageEntityUrl) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `[${text}](${text})`;
      } else if (entity instanceof Api.MessageEntityBold) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `**${text}**`;
      } else if (entity instanceof Api.MessageEntityItalic) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `*${text}*`;
      } else if (entity instanceof Api.MessageEntityCode) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `\`${text}\``;
      } else if (entity instanceof Api.MessageEntityPre) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[
          entity.offset
        ] = `\`\`\`${entity.language}\n${text}\`\`\``;
      } else if (entity instanceof Api.MessageEntityTextUrl) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `[${text}](${entity.url})`;
      } else if (entity instanceof Api.MessageEntityUnderline) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `__${text}__`;
      } else if (entity instanceof Api.MessageEntityStrike) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `~~${text}~~`;
      } else if (entity instanceof Api.MessageEntityCustomEmoji) {
        // @TODO Support CustomEmoji
      } else if (entity instanceof Api.MessageEntityBlockquote) {
        const text = message.message.substring(
          entity.offset,
          entity.offset + entity.length
        );
        entityReplacements[entity.offset] = `> ${text}\n`;
      }
    }
    const sortedOffsets = Object.keys(entityReplacements)
      .map(Number)
      .sort((a, b) => b - a);
    for (const offset of sortedOffsets) {
      const length =
        message.entities.find((e) => e.offset === offset)?.length || 0;
      markdownMessage =
        markdownMessage.slice(0, offset) +
        entityReplacements[offset] +
        markdownMessage.slice(offset + length);
    }
  }
  return markdownMessage;
};

const parsePhotoFromMessage = async (message: Api.Message) => {
  if (message.media instanceof Api.MessageMediaPhoto) {
    if (message.media.photo instanceof Api.Photo) {
      const result = await client.downloadMedia(message);
      // @TODO Support media upload
      return "data:image/jpeg;base64," + (result as Buffer).toString("base64");
    }
  }
  return "";
};

const parseMessage = async (messages: Api.Message[]) => {
  const parsedMessages = [];

  for (const message of messages) {
    if (message.message) {
      parsedMessages.push({
        message_id: message.id,
        content: {
          text: parseMessageToMarkdown(message),
          image: await parsePhotoFromMessage(message),
          entities: message.entities,
          createDate: message.date,
          editedDate: message.editDate,
        },
      });
    }
  }
  return parsedMessages;
};
export const getMessages = async (minId: number, maxId: number) => {
  const result = await client.getMessages(Bun.env.CHANNEL_ID!, {
    minId,
    maxId,
  });
  return parseMessage(result);
};
export const handleNewMessage = async (event: NewMessageEvent) => {
  const message = event.message;
  if (message.chat instanceof Api.Channel) {
    if (message.chat.username !== Bun.env.CHANNEL_ID!) return;
    if (!message.chat.broadcast) return;

    logger.info(`New message: ${message.id}`);
    const messages = await parseMessage([message]);
    for (const message of messages) {
      SQLite.insertMessage(message.message_id, JSON.stringify(message.content));
    }
  }
};
export const handleEditedMessage = async (event: NewMessageEvent) => {
  const message = event.message;
  if (message.chat instanceof Api.Channel) {
    if (message.chat.username !== Bun.env.CHANNEL_ID!) return;
    if (!message.chat.broadcast) return;

    logger.info(`Edited message: ${message.id}`);
    const messages = await parseMessage([message]);
    for (const message of messages) {
      SQLite.updateMessage(message.message_id, JSON.stringify(message.content));
    }
  }
};
export const handleDeleteMessage = async (event: DeletedMessageEvent) => {
  if (event.peer instanceof Api.PeerChannel) {
    const history = await client.invoke(
      new Api.messages.GetHistory({
        peer: event.peer,
        limit: event.deletedIds.length,
      })
    );
    if (!(history instanceof Api.messages.ChannelMessages)) return;
    if (!(history.chats[0] instanceof Api.Channel)) return;

    if (history.chats[0].username !== Bun.env.CHANNEL_ID!) return;
    if (!history.chats[0].broadcast) return;

    const result = await client.getMessages(Bun.env.CHANNEL_ID!, {
      ids: event.deletedIds,
    });
    for (let i = 0; i < result.length; i++) {
      const res = result[i];
      if (!res) {
        const id = event.deletedIds[i];
        logger.info(`Delete message: ${id}`);
        SQLite.deleteMessage(id);
      }
    }
  }
};
