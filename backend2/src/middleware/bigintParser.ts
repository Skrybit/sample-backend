import { RequestHandler } from 'express';

export const bigintParser: RequestHandler = (_req, res, next) => {
  const originalJson = res.json;
  res.json = function (obj) {
    const sanitized = JSON.parse(
      JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
    );
    return originalJson.call(this, sanitized);
  };
  next();
};
