# Telegram Channel Parser

<div align="center">
  <img src="./assets/banner.png" alt="banner" style="width: 75%;">
</div>

将 *Telegram* 的频道内的消息转换为 Base64 编码后的图片 + *Markdown* 文字的内容，并存储到本地 SQLite 数据库。  
内置 *HTTP* 服务器，可通过 *RESTful API* 灵活调用。  
基于 *Telegram MTProto* 协议，相比于 Telegram Bot API 可以更加灵活的导入、监听频道的所有消息。  

## :sparkles: 主要特性

- :arrows_counterclockwise: 启动后自动同步频道历史消息
- :satellite: 监听 Telegram 频道动态：
  - :incoming_envelope: 新消息推送
  - :pencil2: 消息编辑时自动更新
  - :wastebasket: 消息删除时自动同步
- :floppy_disk: 基于 SQLite3 实现的本地高性能、持久化存储
- :rocket: 基于 Hono 的 RESTful API：
  - :bar_chart: 便捷的消息查询接口
  - :zap: 高性能数据访问
  - :wrench: 易于扩展的接口设计

## 免责声明

> [!WARNING]
> 警告： Telegram MTProto API 的限制比 Bot API 更为严格，使用本项目存在账号被封禁的风险。  
> 我们强烈建议您了解这些风险后再使用本项目。使用本项目即表示您已知晓并愿意承担所有风险，请勿因封号问题提交 Issue。

**Telegram讨论组：** https://t.me/dyaogroup

## 申请 Telegram Developer API

1. 在 [这里](https://my.telegram.org/ "这里") 登录你的 Telegram 账号
2. 点击“API development tools”，填入 *App title* 和 *Short name* 保存即可。
3. 需要保存 *api_id* 和 *api_hash*

> [!IMPORTANT]
> 请注意：**申请 API 属于高危操作**，特别是新注册的 Telegram 账号和使用 VoIP 语音号码注册的账号会加大封号概率，如被封号，请尽快向客服申诉申请解封，千万不要将 API 泄露给他人。

> 来自 Telegram X 安卓端的 *api_id* 和 *api_hash*，**并不保证可用性**
> API_ID=21724
> API_HASH=3e0cb5efcd52300aec5994fdfc5bdc16

## 启动程序

### 从构建启动

> [!IMPORTANT]
> 请注意：由 GitHub CI 自动构建的 x64 二进制包 **不支持没有 AVX2 的古董型号 CPU**，例如 Haswell 系列之前的 CPU。   
> 自动构建工作流正在使用 Ubuntu Intel x64 环境 + 交叉编译技术，因此如果无法正常运行，请选择 [从源码启动](#从源码启动) 或者提交 PR！

1. 在 [Releases](https://github.com/DyAxy/Telegram-Channel-Parser/releases) 页面根据自己的环境下载对应压缩包
2. 解压压缩包 (`tar -zxvf telegram-parser*.tar.gz`)
3. 进入解压后的目录 (`cd telegram-parser*`)
4. 修改权限 (`chmod +x telegram-parser*`)
5. 使用 `cp .env.example .env` 后修改 `.env` 的配置内容
6. 启动程序 (`./telegram-parser*`)
7. 根据提示输入手机号、Telegram 收到的验证码、二次密码等。
8. 第一次使用会创建数据库并拉取频道内容，后续每次启动只会拉取最新内容。
9. 如有开机自启动等需求，请参阅 [持久化服务](#持久化服务)

```
项目文件结构
├── database/               # 数据库目录
│   ├── init.sql            # 数据库初始化文件，请不要删除
|   ├── messages.db         # 存储消息的 SQLite 数据库
│   └── ...
├── static/                 # 前端静态目录
│   └── ...
├── .env                    # 环境变量文件
├── .session                # Session 文件（登陆后才会有）
├── telegram-parser_...     # 程序主文件
└── ...                     # 其他文件
```

### 从源码启动

1. 你需要使用 [Bun](https://bun.sh/ "Bun")（一款高性能的 Javascript 运行环境）来运行本程序。
   一键安装 Bun: `curl -fsSL https://bun.sh/install | bash`
2. 使用 `cp .env.example .env` 后修改 `.env` 的配置内容。
3. 使用 `bun install` 来安装所有依赖。
4. 使用 `bun run dev` 启动服务端。
5. 根据提示输入手机号、Telegram收到的验证码、二次密码等。
6. 第一次使用会创建数据库并拉取频道内容，后续每次启动只会拉取最新内容。
7. 如有开机自启动等需求，请参阅 [持久化服务](#持久化服务)

## 持久化服务
   
1. 本项目使用 pm2 进行服务管理，安装依赖 pm2：`bun i -g pm2`
2. 先使用 `bun run dev` 启动并成功登录后，关闭服务端
3. 确认 Session 登录成功后一键启动: `pm2 start ecosystem.config.js`

### 修改 .env.example 为 .env

修改 .env 中的对应配置，如果未修改则无法启动服务端

```ini
# 将 Telegram 获得的api_id api_hash 填入下方
API_ID=123456
API_HASH=1234567890abcdef1234567890abcdef

# 来自 Telegram X 安卓端的 api_id 和 api_hash，并不保证可用性
# API_ID=21724
# API_HASH=3e0cb5efcd52300aec5994fdfc5bdc16

# 频道名称，复制时去掉@
# 如果需要监听新消息/编辑消息/删除消息，需要加入该频道
CHANNEL_ID=test
# API分页功能，显示多少条内容一页
CHANNEL_PAGE_SIZE=10

# HTTP 监听 IP 和端口
HOST=0.0.0.0
PORT=3000

# 日志等级，默认 debug，生产环境请修改为 info 或 warn
# 可选 none | error | warn | info | debug
LOG_LEVEL=debug

# 性能优化
# 默认使用 Gzip 压缩文本消息，可选 0~9，0 即不压缩仅编码，9 即最大压缩，推荐范围 6~9
CONTENT_ENCODE_CPU_LEVEL=6
# 压缩时使用的内存级别，可选 1~9，推荐 8，如果压缩时出现 OOM 内存不足报错时可适当降低。
CONTENT_ENCODE_MEM_LEVEL=8

# 图片编码格式，当前支持 avif / webp / jpeg (原图格式)
# 推荐 avif > webp，如果需要兼容老旧浏览器（如 IE）时请选择 jpeg。
IMAGE_ENCODE_FORMAT=avif

# 【jpeg 原图格式不支持此选项】图片有损压缩比率，可选值：1-100。
# 值越低图片的肉眼观感越差、占存储空间越小，推荐 60~80，压缩比再高就推荐选择使用 jpeg 原图格式。
IMAGE_QUALITY=60

# 【jpeg 原图格式不支持此选项】图片编码压缩等级，可选值：0-9，推荐范围：6~8
# 等级越高压缩效果越好，图片的肉眼观感不变，但编码时消耗的 CPU 性能也越多，如果压缩时出现 OOM 内存不足报错时可适当降低。
IMAGE_EFFORT_LEVEL=6

# 【jpeg 原图格式不支持此选项】是否启用无损压缩，可选值：true / false，推荐: false
# 使用 avif / webp 无损压缩时有可能存在比原图还大的情况，如果有无损的需求请使用 jpeg 原图格式。
IMAGE_LOSSLESS=false

# Session 会话文件保存路径，不推荐修改
SESSION_FILE=./.session

# Message SQLite 数据库文件保存路径，不推荐修改
MESSAGE_SQLITE_FILE=./database/messages.db
```

## API 接口：

当前使用：`/api/v1/`

| 名称     | 路径      | 方法  | 参数 | 返回                               |
| -------- | --------- | ----- | ---- | ---------------------------------- |
| 版本信息 | `version` | `GET` | `无` | `{"name":"","version":"","ts": 0}` |
| 拉取列表 | `list`    | `GET` | `无` | `{"data":[],"total":0}`            |


... 待完善，可参见 ./utils/routers.ts 定义

## 删除本地缓存

如果要更换 IP 或者修改监听频道目标 / 账号，请务必执行以下操作：

> 注意：如果你修改了配置文件中的 `MESSAGE_SQLITE_FILE` 或 `SESSION_FILE` 路径，请相应地修改脚本，在此不做赘述。

```bash
bash ./clear-cache.sh [选项]

选项:
  -M, --message    删除消息缓存 (如果需要修改监听频道)
  -S, --session    删除会话缓存 (如果更换了 IP / 账号)

示例:
  ./clear-cache.sh -M          # 只删除消息缓存
  ./clear-cache.sh -S          # 只删除会话缓存
  ./clear-cache.sh -M -S       # 同时删除消息和会话缓存
```

## TODO List

- 完善对于新特性的 parser
  - `MessageEntityCustomEmoji` - 自定义 Emojipack
  - `MessageEntitySpoiler` - 消息剧透遮罩效果
  - `MessageMediaPhoto` - 图片剧透遮罩效果
- 修复在多张图片附图场景下的图片缺失问题（只能获取到第一张附图）
- 使用 MTProto + Bot API 混合结构
  - 对于同步历史消息使用 MTProto API
  - 对于新发送的消息采用 WebHook / Polling Bot API 实现
  - 好处：可以最大程度地降低账号被封锁的风险

## 开源协议

本项目基于 [*GPL-3.0*](./LICENSE) 开源协议，您可以在遵守协议的前提下自由使用、修改、分发本项目。