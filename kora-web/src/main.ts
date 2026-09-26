import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { enableMocks } from './app/mocks/enable-mocks';

// In mock builds the in-browser API must be listening before the app's first request. If it fails
// to start, boot anyway: requests then fail visibly instead of the page staying blank.
enableMocks()
  .catch((err: unknown) => console.error('[mock api] failed to start', err))
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err: unknown) => console.error(err));
