import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface AppEvents {
  'user:registered': { userId: number; email: string; username: string };
  'user:login': { userId: number; email: string; ip?: string };
  'user:logout': { userId: number };
  'market:halt': { symbol?: string; reason: string };
  'market:resume': { symbol?: string };
}

class AppEventEmitter extends EventEmitter {
  emitEvent<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): boolean {
    logger.debug(`[Event Emitted] ${event}`, payload);
    return super.emit(event, payload);
  }

  onEvent<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): this {
    return super.on(event, listener);
  }
}

export const eventBus = new AppEventEmitter();
