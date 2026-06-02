/**
 * libraryStore saf fabrikasını AsyncStorage'a bağlayan singleton. Ekranlar
 * (Reader/Library) bunu import eder. node:test ile test edilmez (RN importu).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLibraryStore } from './libraryStore';

export const libraryStore = createLibraryStore({
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
});
