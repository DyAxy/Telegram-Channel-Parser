import { database } from "..";

// Planning Compression
const compress = (data: string) => {
  const compressedData = Bun.deflateSync(data);
  return Buffer.from(compressedData).toString("base64");
};
const decompress = (data: string) => {
  const base64Decompress = new Uint8Array(Buffer.from(data, "base64"));
  const decompressedData = Bun.inflateSync(base64Decompress);
  return Buffer.from(decompressedData).toString("utf-8");
};

export const insertMessage = (message_id: number, content: string) => {
  const stmt = database.query(
    "INSERT INTO messages (message_id,content) VALUES (?,?)"
  );
  stmt.run(message_id, content);
};
export const deleteMessage = (message_id: number) => {
  const stmt = database.query("DELETE FROM messages WHERE message_id = ?");
  stmt.run(message_id);
};
export const updateMessage = (message_id: number, content: string) => {
  const stmt = database.query(
    "UPDATE messages SET content = ? WHERE message_id = ?"
  );
  stmt.run(content, message_id);
};
export const getMessages = () => {
  const stmt = database.query("SELECT * FROM messages");
  return stmt.all();
};
