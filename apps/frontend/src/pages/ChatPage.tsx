import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Hash,
  Send,
  Bell,
  Shield,
  Search,
  Plus,
  AlertCircle,
  CheckCircle2,
  Globe,
  TrendingUp,
  UserX,
  Flag,
  AtSign,
} from 'lucide-react';
import {
  ChatRoom,
  ChatMessage,
  ChatConversation,
  ChatNotification,
  ChatUserBlock,
} from '@tradegrid/shared-types';
import { chatApiService } from '../services/chat.service';
import { socketService } from '../services/socket.service';
import { useAuthStore } from '../store/authStore';

export const ChatPage: React.FC = () => {
  const { user } = useAuthStore();

  // Navigation & Sub-views
  const [activeTab, setActiveTab] = useState<'GLOBAL' | 'SYMBOLS' | 'DIRECT' | 'NOTIFICATIONS' | 'SAFETY'>('GLOBAL');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomSlug, setSelectedRoomSlug] = useState<string>('global');
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  // Direct Messaging State
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);

  // Messages State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Mention Autocomplete State
  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: number; username: string }[]>([]);
  const [isMentionPopupOpen, setIsMentionPopupOpen] = useState<boolean>(false);

  // Notifications State
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  // Blocked Users State
  const [blockedUsers, setBlockedUsers] = useState<ChatUserBlock[]>([]);

  // Search & Filtering
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>('');

  // Modals
  const [isNewDmOpen, setIsNewDmOpen] = useState<boolean>(false);
  const [dmSearchQuery, setDmSearchQuery] = useState<string>('');
  const [dmSearchResults, setDmSearchResults] = useState<{ id: number; username: string; role: string }[]>([]);
  const [isReportingOpen, setIsReportingOpen] = useState<boolean>(false);
  const [reportTarget, setReportTarget] = useState<{ messageId?: number; reportedUserId?: number; username?: string }>({});
  const [reportReason, setReportReason] = useState<'SPAM' | 'HARASSMENT' | 'MANIPULATION' | 'OFFENSIVE' | 'OTHER'>('SPAM');
  const [reportDescription, setReportDescription] = useState<string>('');
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load Rooms, Conversations, Notifications
  const loadInitialData = useCallback(async () => {
    try {
      const [roomsList, convsList, notifsRes, blocksList] = await Promise.all([
        chatApiService.listRooms().catch(() => []),
        chatApiService.listConversations().catch(() => []),
        chatApiService.getNotifications().catch(() => ({ notifications: [], unreadCount: 0 })),
        chatApiService.listBlockedUsers().catch(() => []),
      ]);

      setRooms(roomsList);
      setConversations(convsList);
      setNotifications(notifsRes.notifications);
      setUnreadNotificationCount(notifsRes.unreadCount);
      setBlockedUsers(blocksList);

      const defaultGlobal = roomsList.find((r) => r.slug === 'global') || roomsList[0];
      if (defaultGlobal && !selectedRoom) {
        setSelectedRoom(defaultGlobal);
        setSelectedRoomSlug(defaultGlobal.slug);
      }
    } catch (err: any) {
      setChatError(err?.message || 'Failed to initialize chat');
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load messages whenever selected room or conversation changes
  const loadMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    setChatError(null);
    try {
      if (activeTab === 'DIRECT') {
        if (selectedConversationId) {
          const msgs = await chatApiService.getConversationMessages(selectedConversationId);
          setMessages(msgs.reverse());
          // Mark as read
          await chatApiService.markConversationRead(selectedConversationId);
          // Clear unread count locally
          setConversations((prev) =>
            prev.map((c) => (c.id === selectedConversationId ? { ...c, unreadCount: 0 } : c))
          );
        } else {
          setMessages([]);
        }
      } else {
        if (selectedRoomSlug) {
          const msgs = await chatApiService.getRoomMessages(selectedRoomSlug);
          setMessages(msgs.reverse());
        }
      }
    } catch (err: any) {
      setChatError(err?.response?.data?.error?.message || err?.message || 'Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [activeTab, selectedRoomSlug, selectedConversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Real-time Socket.IO Subscriptions
  useEffect(() => {
    socketService.connect();

    let currentChannel = '';
    if (activeTab === 'DIRECT' && selectedConversationId) {
      currentChannel = `chat:conversation:${selectedConversationId}`;
    } else if (selectedRoom) {
      currentChannel =
        selectedRoom.type === 'GLOBAL'
          ? 'chat:global'
          : `chat:symbol:${selectedRoom.symbol || selectedRoom.slug.replace(/^symbol-/, '').toUpperCase()}`;
    }

    if (currentChannel) {
      socketService.subscribe(currentChannel);
    }

    // Handle new room messages
    const handleNewRoomMessage = (event: any) => {
      if (event.roomSlug === selectedRoomSlug) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
      }
    };

    // Handle new direct messages
    const handleNewDirectMessage = (event: any) => {
      if (activeTab === 'DIRECT' && event.conversationId === selectedConversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
        chatApiService.markConversationRead(event.conversationId).catch(() => {});
      } else {
        // Update unread count in conversations list
        setConversations((prev) =>
          prev.map((c) =>
            c.id === event.conversationId ? { ...c, unreadCount: (c.unreadCount || 0) + 1, lastMessage: event.message } : c
          )
        );
      }
    };

    // Handle notifications (mentions & DMs)
    const handleNewNotification = (event: any) => {
      setNotifications((prev) => [event.notification, ...prev]);
      setUnreadNotificationCount((prev) => prev + 1);
    };

    // Handle typing indicators
    const handleTypingUpdate = (event: any) => {
      if (event.userId === user?.id) return;
      if (event.isTyping) {
        setTypingUsers((prev) => new Set(prev).add(event.username));
      } else {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(event.username);
          return next;
        });
      }
    };

    socketService.on('chat:message:new', handleNewRoomMessage);
    socketService.on('chat:direct:new', handleNewDirectMessage);
    socketService.on('chat:notification:new', handleNewNotification);
    socketService.on('chat:mention:new', handleNewNotification);
    socketService.on('chat:typing:update', handleTypingUpdate);

    return () => {
      if (currentChannel) {
        socketService.unsubscribe(currentChannel);
      }
      socketService.off('chat:message:new', handleNewRoomMessage);
      socketService.off('chat:direct:new', handleNewDirectMessage);
      socketService.off('chat:notification:new', handleNewNotification);
      socketService.off('chat:mention:new', handleNewNotification);
      socketService.off('chat:typing:update', handleTypingUpdate);
    };
  }, [activeTab, selectedRoom, selectedRoomSlug, selectedConversationId, user?.id]);

  // Handle Autocomplete Input
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setMessageInput(text);

    // Check for @mention trigger
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const query = text.slice(lastAtIndex + 1);
      if (!query.includes(' ') && query.length >= 1) {
        try {
          const results = await chatApiService.searchUsers(query, 5);
          setMentionSuggestions(results);
          setIsMentionPopupOpen(results.length > 0);
        } catch {
          setIsMentionPopupOpen(false);
        }
        return;
      }
    }
    setIsMentionPopupOpen(false);
  };

  const insertMention = (username: string) => {
    const lastAtIndex = messageInput.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const prefix = messageInput.slice(0, lastAtIndex);
      setMessageInput(`${prefix}@${username} `);
    }
    setIsMentionPopupOpen(false);
  };

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    setIsSending(true);
    setChatError(null);
    const content = messageInput.trim();
    const idempotencyKey = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (activeTab === 'DIRECT') {
        if (!activeConversation) {
          throw new Error('No direct conversation selected');
        }
        const otherUserId = activeConversation.otherUser?.id;
        if (!otherUserId) {
          throw new Error('Recipient not found');
        }
        const newMsg = await chatApiService.sendDirectMessage({
          recipientId: otherUserId,
          content,
          idempotencyKey,
        });
        setMessages((prev) => [...prev, newMsg]);
        setMessageInput('');
      } else {
        const newMsg = await chatApiService.sendRoomMessage(selectedRoomSlug, {
          content,
          idempotencyKey,
        });
        setMessages((prev) => [...prev, newMsg]);
        setMessageInput('');
      }
    } catch (err: any) {
      setChatError(err?.response?.data?.error?.message || err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // New Direct Message User Search
  const handleDmSearch = async (query: string) => {
    setDmSearchQuery(query);
    if (!query.trim()) {
      setDmSearchResults([]);
      return;
    }
    try {
      const results = await chatApiService.searchUsers(query.trim(), 10);
      setDmSearchResults(results);
    } catch {
      setDmSearchResults([]);
    }
  };

  const handleStartConversation = async (targetUserId: number) => {
    try {
      const conv = await chatApiService.getOrCreateConversation(targetUserId);
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
      setActiveConversation(conv);
      setSelectedConversationId(conv.id);
      setActiveTab('DIRECT');
      setIsNewDmOpen(false);
      setDmSearchQuery('');
    } catch (err: any) {
      setChatError(err?.response?.data?.error?.message || err?.message || 'Failed to start conversation');
    }
  };

  // Block / Unblock User
  const handleBlockUser = async (targetUserId: number, targetUsername: string) => {
    if (!confirm(`Are you sure you want to block @${targetUsername}? They will no longer be able to message you.`)) {
      return;
    }
    try {
      const block = await chatApiService.blockUser(targetUserId, 'User blocked via chat');
      setBlockedUsers((prev) => [block, ...prev]);
      alert(`User @${targetUsername} has been blocked.`);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || err?.message || 'Failed to block user');
    }
  };

  const handleUnblockUser = async (targetUserId: number) => {
    try {
      await chatApiService.unblockUser(targetUserId);
      setBlockedUsers((prev) => prev.filter((b) => b.blockedId !== targetUserId));
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || err?.message || 'Failed to unblock user');
    }
  };

  // Report Submission
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await chatApiService.createReport({
        messageId: reportTarget.messageId,
        reportedUserId: reportTarget.reportedUserId,
        reason: reportReason,
        description: reportDescription.trim() || undefined,
      });
      setReportSuccess('Thank you. Your report has been submitted to exchange moderators.');
      setTimeout(() => {
        setIsReportingOpen(false);
        setReportSuccess(null);
        setReportDescription('');
      }, 2000);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || err?.message || 'Failed to submit report');
    }
  };

  const symbolRooms = rooms.filter(
    (r) =>
      r.type === 'SYMBOL' &&
      (r.name.toLowerCase().includes(symbolSearchQuery.toLowerCase()) ||
        r.symbol?.toLowerCase().includes(symbolSearchQuery.toLowerCase()))
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#000000] text-slate-100 overflow-hidden">
      {/* 1. Left Navigation & Room Selector Panel */}
      <div className="w-80 flex-shrink-0 bg-[#0D0D0D] border-r border-slate-800/80 flex flex-col">
        {/* Top Header Tabs */}
        <div className="p-3 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('GLOBAL');
                const globalRoom = rooms.find((r) => r.slug === 'global');
                if (globalRoom) {
                  setSelectedRoom(globalRoom);
                  setSelectedRoomSlug(globalRoom.slug);
                }
              }}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'GLOBAL'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Global
            </button>
            <button
              onClick={() => setActiveTab('SYMBOLS')}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'SYMBOLS'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Stocks
            </button>
            <button
              onClick={() => setActiveTab('DIRECT')}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all relative ${
                activeTab === 'DIRECT'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              DMs
              {conversations.some((c) => (c.unreadCount || 0) > 0) && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse absolute top-1 right-1" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('NOTIFICATIONS')}
              className={`py-1.5 px-2 text-xs font-semibold rounded-md flex items-center justify-center transition-all relative ${
                activeTab === 'NOTIFICATIONS'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadNotificationCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1" />
              )}
            </button>
          </div>
        </div>

        {/* Tab-Specific Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === 'GLOBAL' && (
            <div className="space-y-3">
              <div
                onClick={() => {
                  const globalRoom = rooms.find((r) => r.slug === 'global');
                  if (globalRoom) {
                    setSelectedRoom(globalRoom);
                    setSelectedRoomSlug('global');
                  }
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedRoomSlug === 'global'
                    ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-200 shadow-sm'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate">Global Trader Arena</h4>
                    <p className="text-xs text-slate-400 truncate">Exchange-wide public chatroom</p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/30 border border-slate-800/80 text-xs text-slate-400 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  Community Guidelines
                </div>
                <p>Discuss market trends, price discovery, and trade catalysts constructively.</p>
                <p>To mention a trader, type <span className="text-cyan-400 font-mono">@username</span>.</p>
              </div>
            </div>
          )}

          {activeTab === 'SYMBOLS' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search stock ticker..."
                  value={symbolSearchQuery}
                  onChange={(e) => setSymbolSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              <div className="space-y-1.5">
                {symbolRooms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRoom(r);
                      setSelectedRoomSlug(r.slug);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-2.5 ${
                      selectedRoomSlug === r.slug
                        ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-200'
                        : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-slate-800/80 text-cyan-400 font-mono text-xs font-bold">
                      ${r.symbol}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{r.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{r.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'DIRECT' && (
            <div className="space-y-3">
              <button
                onClick={() => setIsNewDmOpen(true)}
                className="w-full py-2 px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                New Direct Message
              </button>

              <div className="space-y-1.5">
                {conversations.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No active conversations yet.<br />Start one by clicking New DM.
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setActiveConversation(c);
                        setSelectedConversationId(c.id);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-2.5 ${
                        selectedConversationId === c.id
                          ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-200'
                          : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-cyan-400 uppercase">
                        {c.otherUser?.username.slice(0, 2) || 'TR'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold truncate">@{c.otherUser?.username}</span>
                          {(c.unreadCount || 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-black font-bold text-[10px]">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {c.lastMessage?.content || 'No messages yet'}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'NOTIFICATIONS' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-slate-400">Activity & Mentions</span>
                <button
                  onClick={() => chatApiService.markAllNotificationsRead().then(() => setUnreadNotificationCount(0))}
                  className="text-[11px] text-cyan-400 hover:underline"
                >
                  Mark all read
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                      n.isRead ? 'bg-slate-900/20 border-slate-800/50 text-slate-400' : 'bg-slate-900/70 border-cyan-500/30 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1 text-cyan-400">
                        <AtSign className="w-3 h-3" />
                        {n.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{n.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'SAFETY' && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Blocked Traders</h4>
              {blockedUsers.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">You haven't blocked anyone.</div>
              ) : (
                blockedUsers.map((b) => (
                  <div key={b.id} className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">@{b.blockedUsername}</div>
                      <div className="text-[10px] text-slate-500">{b.reason || 'Blocked'}</div>
                    </div>
                    <button
                      onClick={() => handleUnblockUser(b.blockedId)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium"
                    >
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Safety & Settings Footer Link */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
          <button
            onClick={() => setActiveTab('SAFETY')}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            Safety & Blocked Users
          </button>
        </div>
      </div>

      {/* 2. Main Chat Feed Arena */}
      <div className="flex-1 flex flex-col bg-[#000000] relative">
        {/* Chat Room / DM Header */}
        <div className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-[#0A0E1A]/80 backdrop-blur">
          <div className="flex items-center gap-3">
            {activeTab === 'DIRECT' ? (
              <>
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-sm text-white uppercase shadow-md shadow-cyan-500/20">
                  {activeConversation?.otherUser?.username.slice(0, 2) || 'DM'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    @{activeConversation?.otherUser?.username || 'Direct Message'}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {activeConversation?.otherUser?.role || 'TRADER'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Direct End-to-End Encrypted Session</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  {selectedRoom?.type === 'GLOBAL' ? <Globe className="w-5 h-5" /> : <Hash className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    {selectedRoom?.name || 'Loading channel...'}
                    {selectedRoom?.symbol && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-[10px] font-bold">
                        ${selectedRoom.symbol}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">{selectedRoom?.description || 'Real-time trader discussion'}</p>
                </div>
              </>
            )}
          </div>

          {/* Typing Indicator */}
          {typingUsers.size > 0 && (
            <div className="text-xs text-cyan-400 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              {Array.from(typingUsers).join(', ')} is typing...
            </div>
          )}
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {chatError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {chatError}
            </div>
          )}

          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Loading chat history...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
              <MessageSquare className="w-10 h-10 stroke-[1.5] text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">No messages yet</p>
              <p className="text-xs text-slate-500">Be the first trader to start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`group flex items-start gap-3 transition-colors rounded-xl p-2 -mx-2 hover:bg-slate-900/30 ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isMine && (
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400 uppercase flex-shrink-0">
                      {msg.senderUsername?.slice(0, 2) || 'TR'}
                    </div>
                  )}

                  <div className={`max-w-xl space-y-1 ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-semibold ${isMine ? 'text-cyan-400' : 'text-slate-300'}`}>
                        @{msg.senderUsername}
                      </span>
                      {msg.senderRole === 'ADMIN' && (
                        <span className="px-1 py-0.2 rounded bg-rose-950 text-rose-400 text-[9px] font-bold border border-rose-800">
                          ADMIN
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {/* Message Hover Actions */}
                      {!isMine && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => {
                              setReportTarget({
                                messageId: msg.id,
                                reportedUserId: msg.senderId,
                                username: msg.senderUsername,
                              });
                              setIsReportingOpen(true);
                            }}
                            title="Report message"
                            className="text-slate-500 hover:text-amber-400"
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleBlockUser(msg.senderId, msg.senderUsername || 'Trader')}
                            title="Block user"
                            className="text-slate-500 hover:text-rose-400"
                          >
                            <UserX className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed ${
                        isMine
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-black rounded-tr-none shadow-sm'
                          : msg.isDeleted
                          ? 'bg-slate-100 dark:bg-[#121212] text-slate-400 dark:text-neutral-500 italic border border-slate-200 dark:border-[#222222]'
                          : 'bg-slate-100 dark:bg-[#171717] text-slate-900 dark:text-neutral-200 rounded-tl-none border border-slate-200 dark:border-[#262626]'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 3. Message Composer Panel */}
        <div className="p-4 border-t border-slate-800/80 bg-[#0A0E1A]/80 backdrop-blur relative">
          {/* Mention Autocomplete Dropdown Popup */}
          {isMentionPopupOpen && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50">
              <div className="text-[10px] uppercase font-bold text-slate-500 px-2 py-1">Mention Trader</div>
              {mentionSuggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => insertMention(s.username)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-xs flex items-center gap-2 transition-colors"
                >
                  <AtSign className="w-3 h-3 text-cyan-400" />
                  <span className="font-semibold text-slate-200">@{s.username}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              placeholder={
                activeTab === 'DIRECT'
                  ? `Message @${activeConversation?.otherUser?.username || 'Trader'}...`
                  : `Chat in ${selectedRoom?.name || 'this room'}... (type @username to mention)`
              }
              value={messageInput}
              onChange={handleInputChange}
              maxLength={1000}
              className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 transition-all"
            />
            <button
              type="submit"
              disabled={!messageInput.trim() || isSending}
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
          <div className="flex justify-between items-center px-1 pt-1.5 text-[10px] text-slate-500">
            <span>Press Enter to send</span>
            <span>{messageInput.length} / 1000</span>
          </div>
        </div>
      </div>

      {/* MODAL 1: New Direct Message User Search */}
      {isNewDmOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D0D0D] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                Start a Direct Message
              </h3>
              <button
                onClick={() => setIsNewDmOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search trader by username..."
                value={dmSearchQuery}
                onChange={(e) => handleDmSearch(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1">
              {dmSearchResults.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  {dmSearchQuery ? 'No traders found' : 'Type a username above to search'}
                </div>
              ) : (
                dmSearchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleStartConversation(u.id)}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-slate-900 flex items-center justify-between border border-transparent hover:border-slate-800 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold text-xs uppercase">
                        {u.username.slice(0, 2)}
                      </div>
                      <span className="text-xs font-semibold text-slate-200">@{u.username}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono">{u.role}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Report Message / User */}
      {isReportingOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0D0D0D] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400" />
                Report Inappropriate Content
              </h3>
              <button
                onClick={() => setIsReportingOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            {reportSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {reportSuccess}
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Reason</label>
                  <select
                    value={reportReason}
                    onChange={(e: any) => setReportReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="SPAM">Spam or unwanted advertising</option>
                    <option value="HARASSMENT">Harassment or bullying</option>
                    <option value="MANIPULATION">Market manipulation or deceptive claims</option>
                    <option value="OFFENSIVE">Offensive or abusive language</option>
                    <option value="OTHER">Other violation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Additional Context (optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide details for exchange moderators..."
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsReportingOpen(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
