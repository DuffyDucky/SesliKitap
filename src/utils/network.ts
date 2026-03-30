import { announce } from './tts';

export async function checkNetwork(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

export async function requireNetwork(): Promise<boolean> {
  const online = await checkNetwork();
  if (!online) {
    await announce.noInternet();
  }
  return online;
}
