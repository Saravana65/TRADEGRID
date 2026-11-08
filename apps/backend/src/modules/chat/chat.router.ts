import { Router } from 'express';
import { ChatController } from './chat.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';

export function createChatRouter(controller: ChatController): Router {
  const router = Router();

  // 1. Chat Rooms & Messages
  router.get('/rooms', controller.listRooms);
  router.get('/rooms/:slug', controller.getRoom);
  router.get('/rooms/:slug/messages', controller.getRoomMessages);
  router.post('/rooms/:slug/messages', authenticate, controller.sendRoomMessage);

  // 2. User Search for Mentions & Direct Messaging
  router.get('/users/search', authenticate, controller.searchUsers);

  // 3. Direct Messaging
  router.get('/conversations', authenticate, controller.listConversations);
  router.post('/conversations', authenticate, controller.getOrCreateConversation);
  router.get('/conversations/:id/messages', authenticate, controller.getConversationMessages);
  router.post('/conversations/:id/read', authenticate, controller.markConversationRead);
  router.post('/direct', authenticate, controller.sendDirectMessage);

  // 4. Notifications
  router.get('/notifications', authenticate, controller.getNotifications);
  router.post('/notifications/:id/read', authenticate, controller.markNotificationRead);
  router.post('/notifications/read-all', authenticate, controller.markAllNotificationsRead);

  // 5. User Blocking Controls
  router.get('/blocks', authenticate, controller.listBlockedUsers);
  router.post('/blocks', authenticate, controller.blockUser);
  router.delete('/blocks/:userId', authenticate, controller.unblockUser);

  // 6. Community Reporting
  router.post('/reports', authenticate, controller.createReport);

  return router;
}

export function createAdminChatRouter(controller: ChatController): Router {
  const router = Router();

  // Guard all admin routes with authentication and ADMIN role check
  router.use(authenticate);
  router.use(requireRole('ADMIN'));

  // Moderation APIs
  router.get('/reports', controller.listReports);
  router.patch('/reports/:id', controller.reviewReport);

  return router;
}
