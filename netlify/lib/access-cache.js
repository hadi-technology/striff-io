// What GitHub last told the functions about one signed-in token: who it is, which installations it
// sees, and which repositories it sees under each. Shared by every function instance through
// Netlify Blobs, so the dashboard's first request answers the authorization questions the next
// ones ask, instead of each proxy asking GitHub again with the caller's rate limit.
//
// Not a function: this directory is outside netlify/functions, so it is bundled into the functions
// that import it and never deployed as an endpoint of its own.
//
// The rules that keep this safe:
//   - Keyed by the SHA-256 of the whole token. The token itself is never stored, and one token's
//     entries are only ever read under that token's own hash.
//   - Only a complete, successful answer from GitHub is written. A failure, a rate limit or a list
//     cut short is never stored, so nothing here can say "no access" on GitHub's behalf.
//   - Callers grant from an entry and never refuse from one: anything not found here is asked of
//     GitHub again.
//   - Every value carries the time it was written, and is absent once ACCESS_TTL_MS old.
//   - Any error reading the store is a miss, never a grant.
//   - No per-instance copy: signing out deletes a token's entries from the store, and a copy held
//     by some other warm instance would go on granting after that.
import crypto from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";

/** How long anything GitHub said stays usable. */
export const ACCESS_TTL_MS = 5 * 60 * 1000;
/** The Netlify Blobs store holding these entries, and nothing else. */
export const STORE_NAME = "dashboard-access";
const FORMAT = 1;
/** A value written by an instance whose clock runs ahead may look this far in the future. */
const CLOCK_SKEW_MS = 30 * 1000;
/** The store is an optimisation: waiting longer than this for it costs more than asking GitHub. */
const STORE_TIMEOUT_MS = 1500;

let openStore = (event) => {
  // Lambda compatibility mode: the store's address and credentials arrive on the event.
  connectLambda(event);
  return getStore(STORE_NAME);
};

/** SHA-256 of the whole token, hex. */
export function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function fresh(value, now) {
  return !!value
    && typeof value === "object"
    && value.v === FORMAT
    && Number.isFinite(value.at)
    && value.at <= now + CLOCK_SKEW_MS
    && now - value.at < ACCESS_TTL_MS;
}

function withTimeout(promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${STORE_TIMEOUT_MS} ms`)),
      STORE_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

const strings = (list) => Array.isArray(list) && list.every((item) => typeof item === "string");

/**
 * The cache for one request's token.
 *
 * @param event the Lambda-style event, which carries the store's credentials
 * @param ghToken the caller's GitHub token, hashed here and not kept
 */
export function accessCache(event, ghToken) {
  const prefix = `${tokenHash(ghToken)}/`;
  let store;
  try {
    store = openStore(event);
  } catch (e) {
    // Outside Netlify's runtime there is no store; every read is then a miss and every check asks
    // GitHub, as before this cache existed.
    console.error("access cache: store unavailable, asking GitHub instead:", e?.message);
    store = null;
  }

  async function read(key, valid) {
    if (!store) return null;
    try {
      const value = await withTimeout(store.get(prefix + key, { type: "json" }), "access cache read");
      return fresh(value, Date.now()) && valid(value) ? value : null;
    } catch (e) {
      console.error("access cache: read failed, asking GitHub instead:", e?.message);
      return null;
    }
  }

  async function write(key, fields) {
    if (!store) return;
    try {
      await withTimeout(store.setJSON(prefix + key, { v: FORMAT, at: Date.now(), ...fields }),
        "access cache write");
    } catch (e) {
      console.error("access cache: write failed:", e?.message);
    }
  }

  return {
    /** @return the login GitHub gave for this token, or null */
    async login() {
      const value = await read("login", (v) => typeof v.login === "string" && v.login.length > 0);
      return value ? value.login : null;
    },
    rememberLogin(login) {
      return write("login", { login });
    },

    /** @return the ids (strings) of every installation this token sees, or null */
    async installationIds() {
      const value = await read("installations", (v) => strings(v.ids));
      return value ? value.ids : null;
    },
    /** @param ids every installation this token sees: a complete list, never a partial one */
    rememberInstallationIds(ids) {
      return write("installations", { ids: ids.map(String) });
    },

    /** @return every repository full name, lowercased, this token sees under it, or null */
    async repositoryNames(installationId) {
      const value = await read(`installations/${installationId}/repositories`, (v) => strings(v.names));
      return value ? value.names : null;
    },
    /** @param names every repository this token sees under it: a complete list, never a partial one */
    rememberRepositoryNames(installationId, names) {
      return write(`installations/${installationId}/repositories`,
        { names: names.filter((name) => typeof name === "string").map((name) => name.toLowerCase()) });
    },

    /** Deletes everything held for this token. Best-effort and time-boxed. */
    async forget() {
      if (!store) return;
      try {
        const { blobs } = await withTimeout(store.list({ prefix }), "access cache list");
        await withTimeout(Promise.all((blobs || []).map((blob) => store.delete(blob.key))),
          "access cache delete");
      } catch (e) {
        console.error("access cache: could not forget a token:", e?.message);
      }
    },
  };
}

/** For tests only: replaces how the store is opened. */
export const testing = {
  useStore(open) {
    openStore = open;
  },
};
