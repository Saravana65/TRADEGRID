import { Request, Response, NextFunction } from 'express';
import { ChatService } from './chat.service';
import {
  sendChatMessageSchema,
  sendDirectMessageSchema,
  chatPaginationQuerySchema,
  userSearchQuerySchema,
  createBlockSchema,
  createReportSchema,
  reviewReportSchema,
} from '@tradegrid/validation';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

export class ChatController {
  constructor(private chatService: ChatService) {}

  // ==========================================================================
  // Chat Rooms
  // ==========================================================================

  listRooms = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rooms = await this.chatService.listRooms();
      sendSuccess(res, { rooms });
    } catch (err) {
      next(err);
    }
  };

  getRoom = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug;
      if (!slug) {
        throw new AppError(400, 'INVALID_SLUG', 'Room slug is required');
      }
      const room = await this.chatService.getRoomBySlug(slug);
      sendSuccess(res, room);
    } catch (err) {
      next(err);
    }
  };

  getRoomMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug;
      const query = chatPaginationQuerySchema.parse(req.query);
      const messages = await this.chatService.getRoomMessages(slug, query);
      sendSuccess(res, { messages });
    } catch (err) {
      next(err);
    }
  };

  sendRoomMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to post messages');
      }
      const slug = req.params.slug;
      const input = sendChatMessageSchema.parse(req.body);
      const message = await this.chatService.sendRoomMessage(userId, slug, input);
      sendSuccess(res, message, 'Message sent successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  // ==========================================================================
  // User Search
  // ==========================================================================

  searchUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const query = userSearchQuerySchema.parse(req.query);
      const users = await this.chatService.searchUsers(query.q, userId || 0, query.limit);
      sendSuccess(res, { users });
    } catch (err) {
      next(err);
    }
  };

  // ==========================================================================
  // Direct Messaging
  // ==========================================================================

  listConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const conversations = await this.chatService.listUserConversations(userId);
      sendSuccess(res, { conversations });
    } catch (err) {
      next(err);
    }
  };

  getOrCreateConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const recipientId = parseInt(req.body.recipientId, 10);
      if (isNaN(recipientId) || recipientId <= 0) {
        throw new AppError(400, 'INVALID_RECIPIENT', 'Valid recipient ID is required');
      }
      const conversation = await this.chatService.getOrCreateConversation(userId, recipientId);
      sendSuccess(res, conversation, 'Conversation retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  getConversationMessages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const conversationId = parseInt(req.params.id, 10);
      if (isNaN(conversationId) || conversationId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid conversation ID');
      }
      const query = chatPaginationQuerySchema.parse(req.query);
      const messages = await this.chatService.getConversationMessages(
        conversationId,
        userId,
        query
      );
      sendSuccess(res, { messages });
    } catch (err) {
      next(err);
    }
  };

  sendDirectMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const input = sendDirectMessageSchema.parse(req.body);
      const message = await this.chatService.sendDirectMessage(userId, input);
      sendSuccess(res, message, 'Direct message sent successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  markConversationRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const conversationId = parseInt(req.params.id, 10);
      if (isNaN(conversationId) || conversationId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid conversation ID');
      }
      const messageId = req.body.messageId ? parseInt(req.body.messageId, 10) : undefined;
      await this.chatService.markConversationRead(conversationId, userId, messageId);
      sendSuccess(res, { message: 'Conversation marked as read' });
    } catch (err) {
      next(err);
    }
  };

  // ==========================================================================
  // Notifications
  // ==========================================================================

  getNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const result = await this.chatService.getUserNotifications(userId, { limit, unreadOnly });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  markNotificationRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid notification ID');
      }
      await this.chatService.markNotificationRead(id, userId);
      sendSuccess(res, { message: 'Notification marked as read' });
    } catch (err) {
      next(err);
    }
  };

  markAllNotificationsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      await this.chatService.markAllNotificationsRead(userId);
      sendSuccess(res, { message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  };

  // ==========================================================================
  // Blocking Controls
  // ==========================================================================

  listBlockedUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const blocked = await this.chatService.listBlockedUsers(userId);
      sendSuccess(res, { blocked });
    } catch (err) {
      next(err);
    }
  };

  blockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const input = createBlockSchema.parse(req.body);
      const block = await this.chatService.blockUser(userId, input.userId, input.reason);
      sendSuccess(res, block, 'User blocked successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  unblockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const targetUserId = parseInt(req.params.userId, 10);
      if (isNaN(targetUserId) || targetUserId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid target user ID');
      }
      await this.chatService.unblockUser(userId, targetUserId);
      sendSuccess(res, { message: 'User unblocked successfully' });
    } catch (err) {
      next(err);
    }
  };

  // ==========================================================================
  // Reporting & Moderation
  // ==========================================================================

  createReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to file reports');
      }
      const input = createReportSchema.parse(req.body);
      const report = await this.chatService.createReport(userId, input);
      sendSuccess(res, report, 'Report submitted successfully and queued for review', 201);
    } catch (err) {
      next(err);
    }
  };

  listReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as any;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const result = await this.chatService.listReports({ status, limit, offset });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  reviewReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const reportId = parseInt(req.params.id, 10);
      if (isNaN(reportId) || reportId <= 0) {
        throw new AppError(400, 'INVALID_ID', 'Invalid report ID');
      }
      const input = reviewReportSchema.parse(req.body);
      const updated = await this.chatService.reviewReport(reportId, userId, input);
      sendSuccess(res, updated, 'Report reviewed successfully');
    } catch (err) {
      next(err);
    }
  };
}
