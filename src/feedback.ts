// Send feedback: an email to us, opened in the person's own mail app, with the app's version and the kind of
// device filled in below the space for their words. They see it all, and can change it, before sending
// (the privacy policy says so). Nothing is sent by the app itself.

export const FEEDBACK_ADDRESS = 'hello@fullgrown.garden';
export const PRIVACY_URL = 'https://fullgrown.garden/privacy/';
export const TERMS_URL = 'https://fullgrown.garden/terms/';

/** The mailto: link: "FullGrown feedback", and the version and device under a line. */
export function feedbackLink(version: string, device: string): string {
  const body = `\n\n\n---\nFullGrown ${version} · ${device}`;
  return `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent('FullGrown feedback')}&body=${encodeURIComponent(body)}`;
}
