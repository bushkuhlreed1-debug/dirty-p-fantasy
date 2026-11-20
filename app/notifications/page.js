import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";
import NotificationButton from "../components/NotificationButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Subscribe to Notifications | Dirty P Fantasy",
  description: "Turn on mobile alerts for Dirty P Fantasy football.",
};

export default async function NotificationsPage() {
  let owners = [];
  let error = null;

  try {
    const league = await getLeagueData();
    owners = (league.owners || []).map(owner => ({
      id: owner.id, name: owner.name
    }));
  } catch (caught) {
    console.error("Notification signup: league owners unavailable", caught);
    error = "We couldn't load the league owners. Try refreshing this page.";
  }

  return (
    <main className="page-shell dp-notification-page">
      <header className="site-header">
        <Link href="/" className="dp-notification-back">← Back to Dirty P</Link>
      </header>

      <section className="dp-notification-hero">
        <div className="dp-notification-icon" aria-hidden="true">🔔</div>
        <p className="eyebrow">DIRTY P · LIVE ALERTS</p>
        <h1>Subscribe to Notifications</h1>
        <p>Get fantasy scoring updates and game alerts delivered to your phone, even when Dirty P isn't open.</p>
      </section>

      <section className="dp-notification-steps" aria-labelledby="notification-setup-title">
        <h2 id="notification-setup-title">Using an iPhone? Do this first.</h2>
        <ol>
          <li><strong>Open Dirty P in Safari</strong> on your iPhone.</li>
          <li>Tap <strong>Share</strong> and choose <strong>Add to Home Screen</strong>. Select <strong>Open as Web App</strong> if offered.</li>
          <li>Open <strong>Dirty P</strong> from its new Home Screen icon and return to <strong>Alerts</strong>.</li>
          <li>Choose your league owner name, tap <strong>Subscribe to Notifications</strong>, and allow notifications.</li>
        </ol>
        <p>On other supported phones and browsers, you can subscribe below directly.</p>
      </section>

      {error ? (
        <p className="dp-notification-error" role="alert">{error}</p>
      ) : (
        <NotificationButton owners={owners} />
      )}

      <p className="dp-notification-footnote">
        You can use <strong>Send Test Notification</strong> after subscribing to confirm that alerts reach this device.
        Actual game alerts depend on ESPN updates and the alert checker running.
      </p>
    </main>
  );
}
