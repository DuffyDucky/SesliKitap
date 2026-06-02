/**
 * Saf çeviri modüllerini RN/Expo ile bağlar ve uygulama genelinde tek
 * (singleton) governor / store / job örneği sunar. ReaderScreen bunları kullanır.
 * Bu dosya node:test ile test edilmez (RN importları içerir).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { createGovernor, RPD_BUDGET, RPM_SPACING_MS } from './quotaGovernor';
import { createStore, type StoreFs } from './translationStore';
import { createJob } from './translationJob';
import { translateBlock } from './geminiTranslate';
import { googleTranslate } from './googleTranslate';
import { createResilientTranslate } from './resilientTranslate';
import { splitIntoBlocks } from './blocks';

export const quotaGovernor = createGovernor({
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  rpdBudget: RPD_BUDGET,
  rpmSpacingMs: RPM_SPACING_MS,
});

function translatedDir(): Directory {
  return new Directory(Paths.document, 'translated');
}

const fs: StoreFs = {
  readFile: async (name) => {
    const file = new File(translatedDir(), name);
    if (!file.exists) return null;
    try {
      return await file.text();
    } catch {
      return null;
    }
  },
  writeFile: async (name, data) => {
    const dir = translatedDir();
    if (!dir.exists) dir.create();
    const file = new File(dir, name);
    if (!file.exists) file.create();
    file.write(data);
  },
};

export const translationStore = createStore(fs);

// Gemini + Google Translate fallback + yer tutucu: tek blok kitabı durdurmaz.
const resilientTranslate = createResilientTranslate({
  gemini: translateBlock,
  google: googleTranslate,
});

export const translationJob = createJob({
  translateBlock: resilientTranslate,
  governor: quotaGovernor,
  store: translationStore,
  splitIntoBlocks,
});
