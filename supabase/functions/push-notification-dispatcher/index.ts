import { handlePushNotificationDispatch } from "./handler.ts";

Deno.serve((req) => handlePushNotificationDispatch(req));
