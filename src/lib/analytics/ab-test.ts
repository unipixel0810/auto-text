import { getSessionId } from './session';

/**
 * A/B Test Variants
 */
export type ABVariant = 'A' | 'B';

/**
 * A/B Test Event Types
 */
export type ABEventType = 'impression' | 'click';

/**
 * Cookie-based variant assignment
 */
export function getABVariant(experimentName: string): ABVariant {
  if (typeof window === 'undefined') return 'A';

  const cookieName = `ab-variant-${experimentName}`;
  const match = document.cookie.match(new RegExp('(^| )' + cookieName + '=([^;]+)'));
  
  if (match) {
    return match[2] as ABVariant;
  }

  // Randomly assign A or B (50:50)
  const variant: ABVariant = Math.random() < 0.5 ? 'A' : 'B';
  
  // Save to cookie for 30 days
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  document.cookie = `${cookieName}=${variant}; expires=${expires.toUTCString()}; path=/`;

  return variant;
}

/**
 * Track A/B test event
 */
export async function trackABEvent(
  experimentName: string,
  variant: ABVariant,
  eventType: ABEventType
) {
  try {
    await fetch('/api/analytics/track-ab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        experiment_name: experimentName,
        variant,
        event_type: eventType,
        session_id: getSessionId(),
      }),
    });
  } catch (err) {
    console.error('[AB-Test] Failed to track event:', err);
  }
}

/**
 * Initialize A/B tests for elements with data-ab-test attribute
 */
export function initABTests() {
  if (typeof window === 'undefined') return;

  const elements = document.querySelectorAll('[data-ab-test]:not([data-ab-initialized])');
  
  elements.forEach((el) => {
    const experimentName = el.getAttribute('data-ab-test');
    if (!experimentName) return;

    // Mark as initialized to prevent duplicate processing
    el.setAttribute('data-ab-initialized', 'true');

    const variant = getABVariant(experimentName);
    
    // 1. Track impression
    trackABEvent(experimentName, variant, 'impression');

    // 2. Apply B variant text if assigned
    if (variant === 'B') {
      const variantBText = el.getAttribute('data-ab-variant-b');
      if (variantBText) {
        // Find text content within the element (preserve structure)
        const textNodes = Array.from(el.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
        if (textNodes.length > 0) {
          // Replace first text node, remove others
          textNodes.forEach((node, idx) => {
            if (idx === 0) {
              node.textContent = variantBText;
            } else {
              node.remove();
            }
          });
        } else {
          // If no text nodes, check for common patterns
          const span = el.querySelector('span:last-child');
          if (span && span.textContent) {
            span.textContent = variantBText;
          } else {
            el.textContent = variantBText;
          }
        }
      }
    }

    // 3. Track click (use capture to ensure we catch the event)
    const clickHandler = () => {
      trackABEvent(experimentName, variant, 'click');
    };
    el.addEventListener('click', clickHandler, { capture: true });
  });
}
