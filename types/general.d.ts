interface DataMessages {
  id: number;
  message_id: number;
  content: string;
}

interface Router {
  method: string | string[];
  path: string[];
  handler: (c: Context) => HandlerResponse;
}
