import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors} from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { provideRouter } from '@angular/router';
import { timeoutInterceptor } from './core/interceptors/timeout-interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
 provideHttpClient(
    withInterceptors([authInterceptor, timeoutInterceptor])
  ),
    provideRouter(routes)
  ]
};
