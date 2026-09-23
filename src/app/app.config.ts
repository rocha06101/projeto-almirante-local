import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideHttpClient, withInterceptors} from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { provideRouter } from '@angular/router';
import { timeoutInterceptor } from './core/interceptors/timeout-interceptor';
import { routes } from './app.routes';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    // O Bearer/credenciais e o CSRF ficam a cargo do authInterceptor + AuthService
    // (o backend usa X-CSRF-TOKEN obtido em /Auth/csrf, não o XSRF-TOKEN padrão do Angular).
    provideHttpClient(
      withInterceptors([authInterceptor, timeoutInterceptor])
    ),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    // Service worker só em produção; registra depois que o app estabiliza (ou em 30 s).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
