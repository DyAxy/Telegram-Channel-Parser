interface DataMessages {
  // 详细参见 ./database/init.sql
  id: number;
  message_id: number;
  content: string;
  created_at: number;
  updated_at: number;
}
interface DataConfig {
  channel: string;
  version: number;
}

interface Router {
  method: string | string[];
  path: string[];
  handler: (c: Context) => HandlerResponse;
}
