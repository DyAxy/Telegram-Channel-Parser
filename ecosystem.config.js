module.exports = {
    apps: [
        {
            name: "telegram-channel-parser-api",
            script: "bun",
            args: "run index.ts",
            watch: false,
            instances: 1,
            autorestart: true,
            max_memory_restart: "1G",
            // 从.env文件加载环境变量
            env_file: ".env",
            env: {
                NODE_ENV: "production",
            },
            env_development: {
                NODE_ENV: "development",
            },
            error_file: "logs/error.log",
            out_file: "logs/out.log",
            time: true,
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
            // 日志轮转，防止日志文件过大
            log_rotate: true,
            max_size: "10M", // 单个日志文件最大大小
            retain: 7,      // 保留的日志文件数量
            compress: true,  // 压缩旧日志文件
            dateFormat: "YYYY-MM-DD_HH", // example: 2024-07-21_00
            rotateInterval: "0 0 * * *",  // crontab 风格
        },
    ],
};