import { authenticate } from "../shopify.server";
import db from "../db.server";
import logger from "../lib/logger.server";

// Webhooks are POST-only; answer crawler GETs with a 405 instead of letting
// React Router warn about rendering a component-less route.
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  logger.debug(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }

  return new Response();
};
