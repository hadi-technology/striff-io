const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const PLAN_NAMES = {
  starter: "Starter",
  team: "Team",
  scale: "Scale",
};

exports.handler = async (event) => {
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  const installationId =
    event.queryStringParameters?.installation_id;
  if (!installationId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing installation_id" }) };
  }

  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Stripe not configured" }) };
  }

  try {
    // Find Stripe customer by installation_id metadata
    const customerRes = await stripeGet(
      `customers/search?query=metadata['installation_id']:'${encodeURIComponent(installationId)}'`
    );
    if (!customerRes.data || customerRes.data.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasSubscription: false }),
      };
    }

    const customerId = customerRes.data[0].id;

    // Get active subscription
    const subRes = await stripeGet(`subscriptions?customer=${customerId}&status=active&limit=1`);
    const subscription = subRes.data && subRes.data.length > 0 ? subRes.data[0] : null;

    if (!subscription) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasSubscription: false }),
      };
    }

    // Derive plan name from price lookup
    const priceId = subscription.plan?.id || subscription.items?.data?.[0]?.price?.id;
    let planName = "Unknown";
    // Match price ID to plan
    for (const [key, envVar] of [
      ["Starter", process.env.STRIPE_STARTER_PRICE_ID],
      ["Team", process.env.STRIPE_TEAM_PRICE_ID],
      ["Scale", process.env.STRIPE_SCALE_PRICE_ID],
    ]) {
      if (envVar && priceId === envVar) {
        planName = key;
        break;
      }
    }

    // Create customer portal session
    const session = await stripePost("billing_portal/sessions", {
      customer: customerId,
      return_url: "https://striff.io/dashboard",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hasSubscription: true,
        planName: planName,
        status: subscription.status,
        portalUrl: session.url,
      }),
    };
  } catch (e) {
    console.error("Stripe portal error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

function parseCookie(header) {
  const cookies = {};
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });
  return res.json();
}

async function stripePost(path, params) {
  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return res.json();
}
