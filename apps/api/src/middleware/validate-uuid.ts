import { Request, Response, NextFunction } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuidParam(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    if (value && !UUID_REGEX.test(value)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAM', message: `Invalid UUID format for ${paramName}` },
      });
    }
    next();
  };
}
