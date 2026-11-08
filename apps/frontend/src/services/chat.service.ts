import { apiClient } from './api';
import {
  ApiResponse,
  ChatRoom,
  ChatMessage,
  ChatConversation,
  ChatNotification,
  ChatUserBlock,
  ChatReport,
} from '@tradegrid/shared-types';
import {
  SendChatMessageInput,
  SendDirectMessageInput,
  ChatPaginationQueryInput,
  CreateReportInput,
} from '@tradegrid/validation';

export const chatApiService = {
  // Rooms
  async listRooms(): Promise<ChatRoom[]> {
    const res = await apiClient.get<ApiResponse<{ rooms: ChatRoom[] }>>('/chat/rooms');
    return res.data.data.rooms;
  },

  async getRoom(slug: string): Promise<ChatRoom> {
    const res = await apiClient.get<ApiResponse<ChatRoom>>(`/chat/rooms/${slug}`);
    return res.data.data;
  },

  async getRoomMessages(slug: string, params?: ChatPaginationQueryInput): Promise<ChatMessage[]> {
    const res = await apiClient.get<ApiResponse<{ messages: ChatMessage[] }>>(`/chat/rooms/${slug}/messages`, {
      params,
    });
    return res.data.data.messages;
  },

  async sendRoomMessage(slug: string, data: SendChatMessageInput): Promise<ChatMessage> {
    const res = await apiClient.post<ApiResponse<ChatMessage>>(`/chat/rooms/${slug}/messages`, data);
    return res.data.data;
  },

  // Users Autocomplete
  async searchUsers(q: string, limit = 20): Promise<{ id: number; username: string; role: string }[]> {
    const res = await apiClient.get<ApiResponse<{ users: { id: number; username: string; role: string }[] }>>(
      '/chat/users/search',
      { params: { q, limit } }
    );
    return res.data.data.users;
  },

  // Direct Messaging
  async listConversations(): Promise<ChatConversation[]> {
    const res = await apiClient.get<ApiResponse<{ conversations: ChatConversation[] }>>('/chat/conversations');
    return res.data.data.conversations;
  },

  async getOrCreateConversation(recipientId: number): Promise<ChatConversation> {
    const res = await apiClient.post<ApiResponse<ChatConversation>>('/chat/conversations', { recipientId });
    return res.data.data;
  },

  async getConversationMessages(
    conversationId: number,
    params?: ChatPaginationQueryInput
  ): Promise<ChatMessage[]> {
    const res = await apiClient.get<ApiResponse<{ messages: ChatMessage[] }>>(
      `/chat/conversations/${conversationId}/messages`,
      { params }
    );
    return res.data.data.messages;
  },

  async sendDirectMessage(data: SendDirectMessageInput): Promise<ChatMessage> {
    const res = await apiClient.post<ApiResponse<ChatMessage>>('/chat/direct', data);
    return res.data.data;
  },

  async markConversationRead(conversationId: number, messageId?: number): Promise<void> {
    await apiClient.post(`/chat/conversations/${conversationId}/read`, { messageId });
  },

  // Notifications
  async getNotifications(unreadOnly = false): Promise<{ notifications: ChatNotification[]; unreadCount: number }> {
    const res = await apiClient.get<ApiResponse<{ notifications: ChatNotification[]; unreadCount: number }>>(
      '/chat/notifications',
      { params: { unreadOnly } }
    );
    return res.data.data;
  },

  async markNotificationRead(id: number): Promise<void> {
    await apiClient.post(`/chat/notifications/${id}/read`, {});
  },

  async markAllNotificationsRead(): Promise<void> {
    await apiClient.post('/chat/notifications/read-all', {});
  },

  // User Blocking
  async listBlockedUsers(): Promise<ChatUserBlock[]> {
    const res = await apiClient.get<ApiResponse<{ blocked: ChatUserBlock[] }>>('/chat/blocks');
    return res.data.data.blocked;
  },

  async blockUser(userId: number, reason?: string): Promise<ChatUserBlock> {
    const res = await apiClient.post<ApiResponse<ChatUserBlock>>('/chat/blocks', { userId, reason });
    return res.data.data;
  },

  async unblockUser(userId: number): Promise<void> {
    await apiClient.delete(`/chat/blocks/${userId}`);
  },

  // Reporting
  async createReport(data: CreateReportInput): Promise<ChatReport> {
    const res = await apiClient.post<ApiResponse<ChatReport>>('/chat/reports', data);
    return res.data.data;
  },
};
