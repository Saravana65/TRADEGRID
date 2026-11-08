import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private subscribedChannels: Set<string> = new Set();
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  /**
   * Initializes or connects the Socket.IO client instance.
   */
  connect(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    const token = localStorage.getItem('tg_access_token') || localStorage.getItem('access_token');
    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin.replace(/^http/, 'ws');

    this.socket = io(wsUrl, {
      path: '/socket.io',
      auth: {
        token: token || undefined,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      // Re-subscribe to all active channels upon reconnect
      if (this.subscribedChannels.size > 0) {
        for (const channel of this.subscribedChannels) {
          this.socket?.emit('subscribe', { channel });
        }
      }
    });

    this.socket.on('disconnect', () => {
      // Auto-reconnect handled by socket.io
    });

    this.socket.on('error:unauthorized', (data: any) => {
      console.warn('[WS] Unauthorized subscription error:', data);
    });

    // Attach registered event listeners
    for (const [event, callbacks] of this.listeners.entries()) {
      for (const cb of callbacks) {
        this.socket.on(event, cb);
      }
    }

    return this.socket;
  }

  /**
   * Returns true if client is connected.
   */
  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  /**
   * Subscribes to a market, orderbook, trades, or private user channel.
   */
  subscribe(channel: string): void {
    this.subscribedChannels.add(channel);
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe', { channel });
    }
  }

  /**
   * Unsubscribes from a channel.
   */
  unsubscribe(channel: string): void {
    this.subscribedChannels.delete(channel);
    if (this.socket && this.socket.connected) {
      this.socket.emit('unsubscribe', { channel });
    }
  }

  /**
   * Requests a full L2 order book snapshot for recovery.
   */
  requestOrderBookSnapshot(symbol: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('orderbook:get_snapshot', { symbol: symbol.toUpperCase() });
    }
  }

  /**
   * Registers an event listener on the socket.
   */
  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Unregisters an event listener.
   */
  off(event: string, callback: (...args: any[]) => void): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Cleanly disconnects the socket client.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.subscribedChannels.clear();
  }
}

export const socketService = new SocketService();
