/**
 * The server address baked in at build time.
 *
 * Set `HOOPS_SERVER_URL` when building and every copy of that build points at
 * your server without anyone touching Settings. Empty when unset, which falls
 * back to localhost.
 */
declare const __HOOPS_SERVER_URL__: string;
