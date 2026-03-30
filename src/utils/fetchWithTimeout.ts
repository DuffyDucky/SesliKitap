export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Bağlantı zaman aşımına uğradı (${timeoutMs / 1000}s)`)),
      timeoutMs
    );
  });

  return Promise.race([fetch(url, options), timeoutPromise]);
}
