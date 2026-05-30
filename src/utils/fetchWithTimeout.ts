export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Bağlantı zaman aşımına uğradı (${timeoutMs / 1000}s)`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([fetch(url, options), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
