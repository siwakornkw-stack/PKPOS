// Generate a Thai PromptPay QR payload (EMVCo / Bank of Thailand standard).
// Works with a phone number or national/tax id - no merchant account required.

function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, "0") + value;
}

function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitizeTarget(id: string): { value: string; tag: string } {
  const digits = id.replace(/\D/g, "");
  if (digits.length >= 13) return { value: digits, tag: "02" }; // national / tax id
  // mobile: 0066 + 9 digits (drop leading 0)
  return { value: "0066" + digits.replace(/^0/, ""), tag: "01" };
}

export function promptPayPayload(id: string, amount?: number): string {
  const { value, tag } = sanitizeTarget(id);
  const merchant = tlv("29", tlv("00", "A000000677010111") + tlv(tag, value));

  const body =
    tlv("00", "01") +
    tlv("01", amount != null ? "12" : "11") + // 12 = dynamic (with amount)
    merchant +
    tlv("53", "764") + // THB
    (amount != null ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "TH");

  const toCrc = body + "6304";
  return toCrc + crc16(toCrc);
}
