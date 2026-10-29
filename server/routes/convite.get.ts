import type { H3Event } from 'h3';

export default defineEventHandler((event: H3Event) => {
    const config = useRuntimeConfig(event);
    const destination = String(config.public.botInvite || '/');

    return sendRedirect(event, destination, 302);
});
