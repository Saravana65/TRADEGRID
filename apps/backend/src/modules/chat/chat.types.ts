import { Knex } from 'knex';
import {
  ChatRoom,
  ChatMessage,
  ChatConversation,
  ChatMessageMention,
  ChatNotification,
  ChatUserBlock,
  ChatReport,
  ChatRoomType,
  ChatReportReason,
  ChatReportStatus,
  UserRole,
} from '@tradegrid/shared-types';

export interface ChatRoomRecord {
  id: number;
  slug: string;
  name: string;
  type: ChatRoomType;
  symbol: string | null;
  description: string | null;
  is_active: boolean;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface ChatConversationRecord {
  id: number;
  user1_id: number;
  user2_id: number;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChatConversationParticipantRecord {
  id: number;
  conversation_id: number;
  user_id: number;
  last_read_message_id: number | null;
  last_read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessageRecord {
  id: number;
  room_id: number | null;
  conversation_id: number | null;
  sender_id: number;
  content: string;
  idempotency_key: string | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessageMentionRecord {
  id: number;
  message_id: number;
  mentioned_user_id: number;
  room_id: number | null;
  conversation_id: number | null;
  created_at: Date;
}

export interface ChatNotificationRecord {
  id: number;
  user_id: number;
  type: 'MENTION' | 'DIRECT_MESSAGE' | 'SYSTEM';
  title: string;
  content: string;
  reference_id: number | null;
  reference_type: string | null;
  reference_slug: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

export interface ChatUserBlockRecord {
  id: number;
  blocker_id: number;
  blocked_id: number;
  reason: string | null;
  created_at: Date;
}

export interface ChatReportRecord {
  id: number;
  reporter_id: number;
  reported_user_id: number | null;
  message_id: number | null;
  reason: ChatReportReason;
  description: string | null;
  status: ChatReportStatus;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IChatRepository {
  transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T>;

  // Rooms
  findRooms(): Promise<ChatRoomRecord[]>;
  findRoomById(id: number, trx?: Knex.Transaction): Promise<ChatRoomRecord | null>;
  findRoomBySlug(slug: string, trx?: Knex.Transaction): Promise<ChatRoomRecord | null>;
  findRoomBySymbol(symbol: string, trx?: Knex.Transaction): Promise<ChatRoomRecord | null>;
  createRoom(
    data: {
      slug: string;
      name: string;
      type: ChatRoomType;
      symbol?: string | null;
      description?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatRoomRecord>;
  incrementRoomMessageCount(roomId: number, trx?: Knex.Transaction): Promise<void>;

  // Conversations
  findConversationById(id: number, trx?: Knex.Transaction): Promise<ChatConversationRecord | null>;
  findConversationBetweenUsers(
    user1Id: number,
    user2Id: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationRecord | null>;
  getUserConversations(userId: number): Promise<ChatConversationRecord[]>;
  createConversation(
    user1Id: number,
    user2Id: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationRecord>;
  updateConversationTimestamp(
    conversationId: number,
    lastMessageAt: Date,
    trx?: Knex.Transaction
  ): Promise<void>;

  // Participants
  getParticipants(conversationId: number): Promise<ChatConversationParticipantRecord[]>;
  getParticipant(
    conversationId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationParticipantRecord | null>;
  createParticipant(
    conversationId: number,
    userId: number,
    trx?: Knex.Transaction
  ): Promise<ChatConversationParticipantRecord>;
  updateParticipantReadCursor(
    conversationId: number,
    userId: number,
    lastReadMessageId: number,
    trx?: Knex.Transaction
  ): Promise<void>;

  // Messages
  findMessageById(id: number, trx?: Knex.Transaction): Promise<ChatMessageRecord | null>;
  findMessageByIdempotencyKey(
    idempotencyKey: string,
    trx?: Knex.Transaction
  ): Promise<ChatMessageRecord | null>;
  listRoomMessages(
    roomId: number,
    options?: { limit?: number; beforeId?: number; afterId?: number }
  ): Promise<ChatMessageRecord[]>;
  listConversationMessages(
    conversationId: number,
    options?: { limit?: number; beforeId?: number; afterId?: number }
  ): Promise<ChatMessageRecord[]>;
  countUnreadConversationMessages(
    conversationId: number,
    lastReadMessageId: number | null,
    userId: number
  ): Promise<number>;
  createMessage(
    data: {
      roomId?: number | null;
      conversationId?: number | null;
      senderId: number;
      content: string;
      idempotencyKey?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatMessageRecord>;
  softDeleteMessage(id: number, trx?: Knex.Transaction): Promise<void>;

  // Mentions
  createMentions(
    mentions: {
      messageId: number;
      mentionedUserId: number;
      roomId?: number | null;
      conversationId?: number | null;
    }[],
    trx?: Knex.Transaction
  ): Promise<void>;
  getUserMentions(userId: number, limit?: number): Promise<ChatMessageMentionRecord[]>;

  // Notifications
  createNotification(
    data: {
      userId: number;
      type: 'MENTION' | 'DIRECT_MESSAGE' | 'SYSTEM';
      title: string;
      content: string;
      referenceId?: number | null;
      referenceType?: string | null;
      referenceSlug?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatNotificationRecord>;
  getUserNotifications(
    userId: number,
    options?: { limit?: number; unreadOnly?: boolean }
  ): Promise<ChatNotificationRecord[]>;
  countUnreadNotifications(userId: number): Promise<number>;
  markNotificationAsRead(id: number, userId: number, trx?: Knex.Transaction): Promise<void>;
  markAllNotificationsAsRead(userId: number, trx?: Knex.Transaction): Promise<void>;

  // Blocks
  isUserBlocked(blockerId: number, blockedId: number): Promise<boolean>;
  isBlockedEitherWay(userA: number, userB: number): Promise<boolean>;
  listBlockedUsers(blockerId: number): Promise<ChatUserBlockRecord[]>;
  createBlock(blockerId: number, blockedId: number, reason?: string | null): Promise<ChatUserBlockRecord>;
  deleteBlock(blockerId: number, blockedId: number): Promise<boolean>;

  // Reports & Moderation
  createReport(
    data: {
      reporterId: number;
      reportedUserId?: number | null;
      messageId?: number | null;
      reason: ChatReportReason;
      description?: string | null;
    },
    trx?: Knex.Transaction
  ): Promise<ChatReportRecord>;
  listReports(options?: {
    status?: ChatReportStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ChatReportRecord[]; total: number }>;
  findReportById(id: number): Promise<ChatReportRecord | null>;
  updateReportStatus(
    id: number,
    status: ChatReportStatus,
    reviewedBy: number,
    trx?: Knex.Transaction
  ): Promise<ChatReportRecord | null>;
}
