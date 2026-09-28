import { getResponse } from 'msw';
import { installMockBroker } from './broker';
import { handlers } from './handlers';
import { after, before } from './outbox';

installMockBroker();

/**
 * Answers a request in-process (unit tests), with the outbox around the handlers exactly as in the
 * browser, where `startMockApi()` hooks the same steps to MSW's lifecycle events.
 */
export async function respond(request: Request): Promise<Response | undefined> {
  const key = crypto.randomUUID();
  const audited = request.clone();
  before(key, audited);
  const response = await getResponse(handlers, request);
  if (response) await after(key, audited, response.clone());
  return response;
}
