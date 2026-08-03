/**
 * Named conversion events for PostHog.
 *
 * The snippet in posthog.astro only gives autocapture and pageviews, which is enough to see
 * that traffic arrived and nothing about whether it converted: autocaptured clicks are keyed
 * on DOM position, so the same "Install App" button reports differently from the header, the
 * hero and the pricing cards, and a markup change silently renames the event.
 *
 * This is a single delegated listener rather than per-link handlers so that a CTA added later
 * is instrumented by virtue of pointing at the same URL, with no markup to remember.
 *
 * Events:
 *   install_app_clicked  { location, path }  intent to install the GitHub App
 *   extension_clicked    { location, path }  intent to install the browser extension
 *   example_engaged      { example, path }   opened a specific worked example
 *   report_viewed        { path }            scrolled the check report into view
 *
 * Pricing page views are already covered by $pageview with $pathname, so there is no separate
 * event for them.
 */

const INSTALL_URL_FRAGMENT = "github.com/apps/striff-app";
const EXTENSION_URL_FRAGMENT = "chromewebstore.google.com";

function capture(event, props) {
  // posthog.js stubs every method and queues calls until the real library loads, so this is
  // safe before init. The guard is for the case where the key is unset and it never loads.
  if (typeof window.posthog === "undefined" || !window.posthog.capture) return;
  window.posthog.capture(event, Object.assign({ path: window.location.pathname }, props));
}

/**
 * Where on the page the click happened. Derived from structure rather than a data attribute
 * on every CTA, so nothing has to be kept in sync by hand.
 */
function locationOf(el) {
  const tagged = el.closest("[data-analytics-location]");
  if (tagged) return tagged.getAttribute("data-analytics-location");
  if (el.closest("header")) return "header";
  if (el.closest("footer")) return "footer";
  if (el.closest("[data-mobile-menu]")) return "mobile_menu";
  if (el.closest(".final-cta")) return "final_cta";
  if (el.closest(".hero-section")) return "hero";
  if (el.closest("article")) return "pricing_card";
  const section = el.closest("section[id]");
  return section ? section.getAttribute("id") : "page";
}

export function initAnalytics() {
  document.addEventListener(
    "click",
    function (event) {
      const link = event.target && event.target.closest && event.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (href.includes(INSTALL_URL_FRAGMENT)) {
        capture("install_app_clicked", { location: locationOf(link) });
      } else if (href.includes(EXTENSION_URL_FRAGMENT)) {
        capture("extension_clicked", { location: locationOf(link) });
      }
    },
    // Capture phase: these links navigate away, and a bubbling listener can lose the race.
    true
  );

  // Opening a worked example is the clearest evaluation signal on the site: it separates
  // someone reading the headline from someone checking whether the findings are real.
  document.querySelectorAll("[data-tab-index]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      const repo = tab.querySelector(".example-tab-repo");
      capture("example_engaged", { example: repo ? repo.textContent.trim() : "unknown" });
    });
  });

  document.querySelectorAll(".example-accordion > summary").forEach(function (summary) {
    summary.addEventListener("click", function () {
      // <details> flips after the event, so !open here means it is about to open.
      if (summary.parentElement.open) return;
      const repo = summary.querySelector(".example-summary-repo, .example-summary-top");
      capture("example_engaged", { example: repo ? repo.textContent.trim().slice(0, 60) : "unknown" });
    });
  });

  // The check report is the proof asset. Reaching it is the difference between a bounce and
  // someone who actually evaluated the output.
  const report = document.getElementById("report");
  if (report && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          capture("report_viewed", {});
          observer.disconnect();
        });
      },
      { threshold: 0.25 }
    );
    observer.observe(report);
  }
}
