import { join } from "path";
import { readFileSync } from "fs";
import type { Context } from "hono";
import { logger as HonoLogger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

import { logger } from "..";
import * as SQLite from "./sqlite";

export const loggerHandler = HonoLogger(
  (message: string, ...rest: string[]) => {
    logger.info(message + " " + rest.join(" "));
  }
);

export const errorHandler = (err: Error, c: Context) => {
  logger.error(err.message);
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof Error) {
    return c.json({ error: err.message }, 500);
  }
  return c.text("An unknown error occurred", 500);
};

const pkgPath = join(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

export const routers: Router[] = [
  {
    method: "OPTIONS",
    path: ["/api/v1/"],
    handler: async (c: Context) => {
      return c.status(204);
    },
  },
  {
    method: "GET",
    path: ["/api/v1/version"],
    handler: async (c: Context) => {
      return c.json({
        name: pkg.name,
        version: pkg.version,
        ts: Date.now(),
      });
    },
  },
  {
    method: "GET",
    path: ["/api/v1/status"],
    handler: async (c: Context) => {
      return c.text("OK");
    },
  },
  {
    method: "GET",
    path: ["/api/v1/me"],
    handler: async (c: Context) => {
      const result = await SQLite.getMe();
      return c.json(JSON.parse(result));
    },
  },
  {
    method: "GET",
    path: ["/api/v1/list"],
    handler: async (c: Context) => {
      let page: string | number | undefined = c.req.query("page");
      if (!page) {
        page = 1;
      } else if (typeof page === "string") {
        page = parseInt(page);
      }
      const messages = await SQLite.getMessages();
      const pageSize = parseInt(Bun.env.CHANNEL_PAGE_SIZE!);
      const pages = Math.ceil(messages.length / pageSize);
      if (page < 1 || page > pages) {
        throw Error("Invalid page number");
      }
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const data = messages.slice(start, end);
      return c.json({ data, pages });
    },
  },
];
