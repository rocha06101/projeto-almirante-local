import { HttpInterceptorFn } from '@angular/common/http';
import { timeout } from 'rxjs/operators';

export const timeoutInterceptor: HttpInterceptorFn = (req, next) => {
  // 90 segundos para a API acordar
  return next(req).pipe(timeout(90000));
};