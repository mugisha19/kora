import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { enableMocks } from './app/mocks/enable-mocks';

// In mock builds the in-browser API must be listening before the app's first request.
enableMocks()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err: unknown) => console.error(err));
