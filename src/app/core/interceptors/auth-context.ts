import { HttpContextToken } from '@angular/common/http';

/** Marca requisições que não devem levar o header Authorization (login, refresh e CSRF anônimo). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
