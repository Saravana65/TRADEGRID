import { create } from 'zustand';
import { socketService } from '../services/socket.service';

interface SocketState {
  isConnected: boolean;
  transport: string;
  activeRooms: string[];
  lastPingTime: number;

  // Actions
  initializeSocket: () => void;
  setConnected: (connected: boolean, transport?: string) => void;
  subscribeRoom: (room: string) => void;
  unsubscribeRoom: (room: string) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  isConnected: false,
  transport: 'polling',
  activeRooms: [],
  lastPingTime: Date.now(),

  initializeSocket: () => {
    const socket = socketService.connect();

    socket.on('connect', () => {
      set({
        isConnected: true,
        transport: socket.io?.engine?.transport?.name || 'websocket',
        lastPingTime: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('connect_error', () => {
      set({ isConnected: false });
    });
  },

  setConnected: (connected: boolean, transport = 'websocket') => {
    set({ isConnected: connected, transport });
  },

  subscribeRoom: (room: string) => {
    socketService.subscribe(room);
    const rooms = get().activeRooms;
    if (!rooms.includes(room)) {
      set({ activeRooms: [...rooms, room] });
    }
  },

  unsubscribeRoom: (room: string) => {
    socketService.unsubscribe(room);
    set({ activeRooms: get().activeRooms.filter((r) => r !== room) });
  },
}));
