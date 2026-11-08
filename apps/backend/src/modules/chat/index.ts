import { chatRepo, ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { createChatRouter, createAdminChatRouter } from './chat.router';
import { userRepository } from '../users/user.repository';
import { instrumentRepository } from '../market';
import { realtimeService } from '../../websocket/realtime.service';

// Default Module Singletons
export const chatService = new ChatService(
  chatRepo,
  userRepository,
  instrumentRepository,
  realtimeService
);

export const chatController = new ChatController(chatService);
export const chatRouter = createChatRouter(chatController);
export const adminChatRouter = createAdminChatRouter(chatController);

export * from './chat.types';
export * from './chat.repository';
export * from './chat.service';
export * from './chat.controller';
export * from './chat.router';
