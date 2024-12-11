import bigInt from "big-integer";
import { Api } from "telegram";
import { client, logger } from "..";
import { NewMessageEvent } from "telegram/events";
import type { DeletedMessageEvent } from "telegram/events/DeletedMessage";
import sharp from "sharp";

import * as SQLite from "./sqlite";

export const getMe = async () => {
  const channel = (await client.getEntity(Bun.env.CHANNEL_ID!)) as Api.Channel;
  const fullChannel = await client.invoke(
    new Api.channels.GetFullChannel({
      channel: Bun.env.CHANNEL_ID!,
    })
  );
  const result = await client.downloadProfilePhoto(Bun.env.CHANNEL_ID!);
  return {
    title: channel.title,
    description: fullChannel.fullChat.about,
    photo: "data:image/jpeg;base64," + (result as Buffer).toString("base64"),
  };
};
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
  if (!(message.media instanceof Api.MessageMediaPhoto) ||
    !(message.media.photo instanceof Api.Photo)) {
    return "";
  }

  try {
    const jpegBuffer = await client.downloadMedia(message, {}) as Buffer;
    if (!jpegBuffer) return "";

    const imageQuality = parseInt(Bun.env.IMAGE_QUALITY ?? "80");
    const effortLevel = parseInt(Bun.env.IMAGE_EFFORT_LEVEL ?? "6");
    const isLossless = Bun.env.IMAGE_LOSSLESS === 'true' || Bun.env.IMAGE_LOSSLESS === '1';
    let format = (Bun.env.IMAGE_ENCODE_FORMAT ?? "avif").toLowerCase();

    const originalImage = sharp(jpegBuffer);
    const originalMetadata = await originalImage.metadata();
    const originalSize = jpegBuffer.length;

    logger.debug(`Original image: ${originalMetadata.width}x${originalMetadata.height}px, ${(originalSize / 1024).toFixed(3)}KB`);
    logger.debug(`Using Format: ${format} (${imageQuality}%), effortLevel: ${effortLevel}, isLossless: ${isLossless}`);

    const prefix = {
      "avif": "data:image/avif;base64",
      "webp": "data:image/webp;base64",
      "jpeg": "data:image/jpeg;base64"
    } as const;

    let processedImage = sharp(jpegBuffer);
    let outputBuffer: Buffer;

    switch (format) {
      case 'avif':
        outputBuffer = await processedImage
          .avif({
            quality: imageQuality,
            effort: effortLevel,
            lossless: isLossless
          })
          .toBuffer();
        break;

      case 'webp':
        outputBuffer = await processedImage
          .webp({
            quality: imageQuality,
            effort: effortLevel,
            lossless: isLossless
          })
          .toBuffer();
        break;

      case 'jpeg':
        outputBuffer = jpegBuffer;
        break;

      default:
        console.warn(`Unsupported image format: ${format}, fallback to JPEG`);
        outputBuffer = jpegBuffer;
        format = 'jpeg';
    }

    const processedMetadata = await sharp(outputBuffer).metadata();
    const processedSize = outputBuffer.length;
    const compressionRatio = (originalSize / processedSize).toFixed(2);

    logger.debug(`Processed image: ${processedMetadata.width}x${processedMetadata.height}px, ${(processedSize / 1024).toFixed(3)}KB`);
    logger.debug(`Compression ratio: ${compressionRatio}x (${(100 - (processedSize / originalSize * 100)).toFixed(3)}% reduction)`);

    return `${prefix[format as keyof typeof prefix]},${outputBuffer.toString('base64')}`;

  } catch (error) {
    console.error('Error processing photo:', error);
    return "";
  }
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
