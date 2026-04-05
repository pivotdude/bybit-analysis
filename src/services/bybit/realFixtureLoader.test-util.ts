export async function loadRealBybitFixture<T>(name: string): Promise<T> {
  const file = Bun.file(new URL(`./__fixtures__/real/${name}.json`, import.meta.url));
  return (await file.json()) as T;
}
