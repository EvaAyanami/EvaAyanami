/** Erreur HTTP avec message destiné à l'utilisateur (en français). */
export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = 'Accès refusé') => new HttpError(403, msg);
