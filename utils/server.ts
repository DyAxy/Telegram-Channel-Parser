// server.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import * as Routers from "./routers";
import { logger } from "..";

const initServer = async () => {
    try {
        const app = new Hono();

        const corsWhitelist = (Bun.env.CORS_WHITELIST ?? "")
            .split(",")
            .map(origin => origin.trim())
            .filter(Boolean);
        logger.info(`CORS whitelist: ${corsWhitelist.join(", ")}`);

        app.use("*", cors({
            origin: corsWhitelist.length ? corsWhitelist : "*",
            allowMethods: ['GET', 'POST', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
            maxAge: 3600,
            credentials: true,
        }));

        app.use(Routers.loggerHandler);
        app.onError(Routers.errorHandler);

        app.get("/*", Routers.cacheControl({ maxAge: 86400 }), serveStatic({
            root: "./static",
        }));

        for (const router of Routers.routers) {
            const handlers = router.middleware ? [...router.middleware, router.handler] : [router.handler];
            app.on(router.method, router.path, ...handlers);
        }

        const host = Bun.env.HOST;
        const port = parseInt(Bun.env.PORT ?? "3000");

        if (!host) {
            throw new Error("HOST environment variable is not set");
        }

        logger.info("Starting the server...");

        const server = Bun.serve({
            hostname: host,
            port: port,
            fetch: app.fetch,
            error(error: Error) {
                logger.error(`Server error: ${error}`);
                return new Response("Internal Server Error", { status: 500 });
            },
        });

        logger.info(`Server started at ${host}:${port}`);
        return server;

    } catch (error) {
        logger.error(`Failed to start server: ${error}`);
        throw error;
    }
};

export default initServer;
