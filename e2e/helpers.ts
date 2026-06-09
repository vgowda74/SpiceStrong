/**
 * e2e/helpers.ts — Detox test helpers for SpiceStrong
 * Common utilities for all tests
 */

export async function waitForElement(testID: string, timeout = 5000) {
  await waitFor(element(by.id(testID))).toBeVisible().withTimeout(timeout);
}

export async function tapElement(testID: string) {
  await element(by.id(testID)).tap();
}

export async function tapText(text: string) {
  await element(by.text(text)).tap();
}

export async function typeText(testID: string, text: string) {
  await element(by.id(testID)).typeText(text);
}

export async function clearText(testID: string) {
  await element(by.id(testID)).clearText();
}

export async function scrollTo(testID: string, direction: 'up' | 'down' = 'down') {
  await waitFor(element(by.id(testID))).toBeVisible().withTimeout(5000);
  await element(by.id(testID)).scroll(1000, direction === 'down' ? 'down' : 'up');
}

export async function expectVisible(testID: string, timeout = 5000) {
  await expect(element(by.id(testID))).toBeVisible();
}

export async function expectNotVisible(testID: string) {
  await expect(element(by.id(testID))).not.toBeVisible();
}

export async function expectText(testID: string, text: string) {
  await expect(element(by.id(testID))).toHaveText(text);
}

export async function multiTap(testID: string, times = 2) {
  await element(by.id(testID)).multiTap(times);
}

export async function longPress(testID: string, duration = 2000) {
  await element(by.id(testID)).longPress();
}

export async function swipeLeft(testID: string) {
  await element(by.id(testID)).swipe('left');
}

export async function swipeRight(testID: string) {
  await element(by.id(testID)).swipe('right');
}

export async function getRecipeCardByName(name: string) {
  return element(by.text(name));
}

export async function dismissKeyboard() {
  await device.sendUserInteraction({ type: 'keyboard', key: 'backspace' });
}
