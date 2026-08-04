const DEFAULT_HOMEKIT_NAME = 'Homematic IP Device';
const MAX_HOMEKIT_NAME_LENGTH = 64;

/**
 * Converts Homematic IP labels to names accepted by HAP-NodeJS.
 *
 * HAP names must start and end with a Unicode letter or number. In between,
 * only a deliberately small punctuation set is accepted. Keep this utility
 * independent of HAP internals so the same rules apply to accessories and
 * services, including before a PlatformAccessory is constructed.
 */
export function sanitizeHomeKitName(name: string, fallback = DEFAULT_HOMEKIT_NAME): string {
  const sanitized = name
    .normalize('NFC')
    .replace(/[\u2010-\u2015\u2212]/gu, '-')
    .replace(/[^\p{L}\p{N}\p{Zs}\u2019'&!._:;()/,-]+/gu, ' ')
    .replace(/\p{Zs}+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '');

  const shortened = Array.from(sanitized).slice(0, MAX_HOMEKIT_NAME_LENGTH).join('')
    .replace(/[^\p{L}\p{N}]+$/u, '');
  if (shortened) {
    return shortened;
  }

  const safeFallback = fallback === name ? DEFAULT_HOMEKIT_NAME : sanitizeHomeKitName(fallback, DEFAULT_HOMEKIT_NAME);
  return safeFallback || DEFAULT_HOMEKIT_NAME;
}
