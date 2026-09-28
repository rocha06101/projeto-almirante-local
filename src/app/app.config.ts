import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { provideRouter } from '@angular/router';
import { timeoutInterceptor } from './core/interceptors/timeout-interceptor';
import { routes } from './app.routes';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AuthService } from './core/services/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor, timeoutInterceptor])
    ),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables())
  ]
};
