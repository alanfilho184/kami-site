import type { H3Event } from 'h3';

export default defineEventHandler((event: H3Event) => {
    return sendRedirect(event, '/#recursos', 302);
});
