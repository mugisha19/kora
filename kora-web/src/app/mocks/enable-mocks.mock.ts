/** Mock builds: start the in-browser API before the app makes its first request. */
export async function enableMocks(): Promise<void> {
  const { startMockApi } = await import('./browser');
  await startMockApi();
}
