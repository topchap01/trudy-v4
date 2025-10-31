import 'express';
declare module 'express-serve-static-core' {
  interface Response {
    flushHeaders?: () => void;
  }
}


