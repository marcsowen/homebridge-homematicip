import type {HmIPDevice} from 'homematicip-cloud-client-ts';

const SECRET_KEY = /^(?:auth|authToken|clientAuth|clientAuthToken|password|pin|secret|token)$/iu;
const PRIVATE_TEXT_KEY = /^(?:address|city|email|label|location|name|phone|postalCode|street)$/iu;
const PRIVATE_VALUE_KEY = /^(?:accessCode|codeSelections|lastStatusUpdate|latitude|longitude|ssid|userCode)$/iu;
const ID_KEY = /^(?:channel|device|group|home|room|zone)?Id$/iu;
const IDS_KEY = /^(?:channel|device|group|home|room|zone)?Ids$/iu;

class DeviceRecordRedactor {
  private readonly identifiers = new Map<string, string>();
  private nextIdentifier = 1;

  public redact(value: unknown, key?: string): unknown {
    if (key && SECRET_KEY.test(key)) {
      return '<redacted-secret>';
    }
    if (key && PRIVATE_TEXT_KEY.test(key)) {
      return '<redacted>';
    }
    if (key && PRIVATE_VALUE_KEY.test(key)) {
      return '<redacted>';
    }
    if (key && (ID_KEY.test(key) || key === 'serializedGlobalTradeItemNumber')) {
      return this.redactIdentifier(value);
    }
    if (key && (IDS_KEY.test(key) || key === 'groups' || key === 'defaultLinkedGroup')) {
      return Array.isArray(value)
        ? value.map(identifier => this.redactIdentifier(identifier))
        : this.redactIdentifier(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.redact(item));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        this.redact(entryValue, entryKey),
      ]));
    }
    return value;
  }

  private redactIdentifier(value: unknown): unknown {
    if (typeof value !== 'string') {
      return '<redacted-id>';
    }
    let replacement = this.identifiers.get(value);
    if (!replacement) {
      replacement = `<redacted-id-${this.nextIdentifier}>`;
      this.nextIdentifier += 1;
      this.identifiers.set(value, replacement);
    }
    return replacement;
  }
}

/**
 * Produces a shareable device record while retaining protocol structure and
 * non-identifying state values needed to implement new device adapters.
 */
export function redactHmIPDeviceRecord(device: HmIPDevice): Readonly<Record<string, unknown>> {
  return new DeviceRecordRedactor().redact(device) as Readonly<Record<string, unknown>>;
}
