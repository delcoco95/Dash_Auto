// Toutes les requêtes vers le backend passent par le proxy Next.js `/api/backend/*`.
// Le proxy vérifie la session (cookie signé) puis ajoute la clé secrète côté serveur :
// le backend n'est plus joignable directement depuis le navigateur.
export const API_URL = '/api/backend'
