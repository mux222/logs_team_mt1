import { createClient } from '@supabase/supabase-js';
import { User, Ticket, Ban } from './types';

// --- Local Database Fallback (IndexedDB) ---
const DB_NAME = 'MT_Logs_DB';
const DB_VERSION = 7;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'user' });
      }

      if (!db.objectStoreNames.contains('tickets')) {
        const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
        ticketStore.createIndex('creator', 'creator');
        ticketStore.createIndex('status', 'status');
      }

      if (!db.objectStoreNames.contains('bans')) {
        const banStore = db.createObjectStore('bans', { keyPath: 'id' });
        banStore.createIndex('discordId', 'discordId');
        banStore.createIndex('type', 'type');
        banStore.createIndex('createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('audit_logs')) {
        const logStore = db.createObjectStore('audit_logs', { keyPath: 'id' });
        logStore.createIndex('userId', 'userId');
        logStore.createIndex('timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('personal_notes')) {
        const noteStore = db.createObjectStore('personal_notes', { keyPath: 'id' });
        noteStore.createIndex('userId', 'userId');
        noteStore.createIndex('updatedAt', 'updatedAt');
      }
    };
  });
};

const localGetAll = <T>(storeName: string): Promise<T[]> => {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const localPutItem = <T>(storeName: string, item: T): Promise<void> => {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

const localDeleteItem = (storeName: string, key: any): Promise<void> => {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};


// --- Supabase Config ---
// Typecast import.meta to avoid strict property checks of dev environments
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

// Create client only if configuration variables exist in env
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 1. Get all items
export const getAll = async <T>(storeName: string): Promise<T[]> => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(storeName)
        .select('*');

      if (error) {
        console.error(`خطأ أثناء جلب البيانات من Supabase لجدول ${storeName}:`, error);
        // Fallback to local storage
        return localGetAll<T>(storeName);
      }
      return (data as T[]) || [];
    } catch (e) {
      console.error(`خطأ مفاجئ أثناء الاتصال بـ Supabase:`, e);
      return localGetAll<T>(storeName);
    }
  }
  return localGetAll<T>(storeName);
};

// 2. Put / Save item
export const putItem = async <T>(storeName: string, item: T): Promise<void> => {
  if (supabase) {
    try {
      const { error } = await supabase
        .from(storeName)
        .upsert(item as any); // Cast to any to bypass extreme generic checks

      if (error) {
        console.error(`خطأ أثناء حفظ البيانات في Supabase لجدول ${storeName}:`, error);
        return localPutItem<T>(storeName, item);
      }
      return;
    } catch (e) {
      console.error(`خطأ مفاجئ أثناء الاتصال بـ Supabase لعملية الحفظ:`, e);
      return localPutItem<T>(storeName, item);
    }
  }
  return localPutItem<T>(storeName, item);
};

// 3. Delete item
export const deleteItem = async (storeName: string, key: any): Promise<void> => {
  if (supabase) {
    try {
      const idColumn = storeName === 'users' ? 'user' : 'id';
      const { error } = await supabase
        .from(storeName)
        .delete()
        .eq(idColumn, key);

      if (error) {
        console.error(`خطأ أثناء حذف البيانات من Supabase لجدول ${storeName}:`, error);
        return localDeleteItem(storeName, key);
      }
      return;
    } catch (e) {
      console.error(`خطأ مفاجئ أثناء الاتصال بـ Supabase لعملية الحذف:`, e);
      return localDeleteItem(storeName, key);
    }
  }
  return localDeleteItem(storeName, key);
};