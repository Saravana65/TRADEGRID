import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from './auth.service';
import { sendSuccess } from '../../utils/response';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await this.service.register(req.body, ip, userAgent);
      sendSuccess(res, result, 'User registered successfully', 201);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await this.service.login(req.body, ip, userAgent);
      sendSuccess(res, result, 'Login successful', 200);
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await this.service.refresh(req.body.refreshToken, ip, userAgent);
      sendSuccess(res, result, 'Token refreshed successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.body.refreshToken;
      await this.service.logout(refreshToken);
      sendSuccess(res, { loggedOut: true }, 'Logged out successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const user = await this.service.getProfile(userId);
      sendSuccess(res, { user }, 'Profile retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
