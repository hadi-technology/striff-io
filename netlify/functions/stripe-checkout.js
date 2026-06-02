const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const PLANS = {
  starter: {
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
    name: "Starter",
  },
  team: {
    priceId: process.env.STRIPE_TEAM_PRICE_ID,
    name: "Team",
  },
  scale: {
    priceId: process.env.STRIPE_SCALE_PRICE_ID,
    name: "Scale",
  },
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { installation_id: installationId, plan } = body;
  if (!installationId || !plan) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing installation_id or plan" }),
    };
  }

  const planConfig = PLANS[plan];
  if (!planConfig || !planConfig.priceId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unknown plan: ${plan}` }),
    };
  }

  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Stripe not configured" }) };
  }

  try {
    // Find or create Stripe customer
    let customerId;
    const customerRes = await stripeGet(
      `customers?metadata[installation_id]=${encodeURIComponent(installationId)}`
    );

    if (customerRes.error) {
      console.error("Stripe customer lookup error:", JSON.stringify(customerRes.error));
      return { statusCode: 500, body: JSON.stringify({ error: `Stripe customer lookup failed: ${customerRes.error.message}` }) };
    }

    if (customerRes.data && customerRes.data.length > 0) {
      customerId = customerRes.data[0].id;
    } else {
      // Get GitHub user info for customer name
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = await userRes.json();

      const newCustomer = await stripePost("customers", {
        name: user.name || user.login,
        "metadata[installation_id]": installationId,
      });

      if (newCustomer.error) {
        console.error("Stripe customer create error:", JSON.stringify(newCustomer.error));
        return { statusCode: 500, body: JSON.stringify({ error: `Stripe customer create failed: ${newCustomer.error.message}` }) };
      }
      customerId = newCustomer.id;
    }

    // Create checkout session
    const session = await stripePost("checkout/sessions", {
      mode: "subscription",
      "payment_method_types[0]": "card",
      customer: customerId,
      "line_items[0][price]": planConfig.priceId,
      "line_items[0][quantity]": "1",
      success_url: `https://striff.io/dashboard`,
      cancel_url: `https://striff.io/dashboard`,
      "metadata[installation_id]": installationId,
    });

    if (session.error) {
      console.error("Stripe checkout error:", JSON.stringify(session.error));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Checkout failed: ${session.error.message}` }),
      };
    }

    if (!session.url) {
      console.error("Stripe checkout no URL:", JSON.stringify(session));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Checkout session returned no URL" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutUrl: session.url }),
    };
  } catch (e) {
    console.error("Stripe checkout exception:", e.message);
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
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
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
