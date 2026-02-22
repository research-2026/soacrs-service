// src/http/types/express.d.ts

import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}
