import { Request, Response, NextFunction } from 'express';
import { userRepository, IUserRepository } from './user.repository';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

export class UsersController {
  constructor(private readonly userRepo: IUserRepository = userRepository) {}

  getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const users = await this.userRepo.findAll(limit, offset);
      sendSuccess(res, { users, limit, offset }, 'Users retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body;

      const updated = await this.userRepo.updateStatus(id, status);
      if (!updated) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Target user does not exist');
      }

      sendSuccess(
        res,
        {
          id: updated.id,
          email: updated.email,
          username: updated.username,
          role: updated.role,
          status: updated.status,
        },
        `User status updated to ${status}`
      );
    } catch (error) {
      next(error);
    }
  };
}

export const usersController = new UsersController();
