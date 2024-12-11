interface DataMessages {
  // 详细参见 ./database/init.sql
  id: number;
  message_id: number;
  content: string;
  created_at: number;
  updated_at: number;
  last_updated_at: number;
}
interface DataConfigMe {
  title: string;
  description: string;
  photo: string;
}
interface DataConfig {
  channel: string;
  version: number;
  data: DataConfigMe;
}

type MiddlewareHandler = (c: Context, next: () => Promise<void>) => Promise<void>;

interface Router {
  method: string | string[];
  path: string[];
  middleware?: MiddlewareHandler[];
  handler: (c: Context) => HandlerResponse;
}

type ImageFormat = 'avif' | 'webp' | 'jpeg';
type ImageProcessConfig = {
  quality?: number;
  effort?: number;
  isLossless?: boolean;
  format?: ImageFormat;
};
interface ProcessStats {
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
  reductionPercent: number;
}
