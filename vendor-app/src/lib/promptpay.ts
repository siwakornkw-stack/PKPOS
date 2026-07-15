// PromptPay QR payload (EMVCo, Bank of Thailand spec). Built fully offline — no network.
// Accepts a mobile number (0812345678), a 13-digit national/tax ID, or a 15-digit e-wallet ID.

function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), uppercase hex.
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const AID = "A000000677010111";

export function isValidPromptPay(target: string): boolean {
  const id = target.replace(/\D/g, "");
  return id.length === 9 || id.length === 10 || id.length === 13 || id.length === 15;
}

export function promptPayPayload(target: string, amount: number): string {
  const id = target.replace(/\D/g, "");

  let account: string;
  if (id.length === 15) {
    account = tlv("00", AID) + tlv("03", id); // e-wallet
  } else if (id.length === 13) {
    account = tlv("00", AID) + tlv("02", id); // national / tax ID
  } else {
    account = tlv("00", AID) + tlv("01", "0066" + id.slice(-9)); // mobile
  }

  const body =
    tlv("00", "01") +
    tlv("01", amount > 0 ? "12" : "11") +
    tlv("29", account) +
    tlv("53", "764") + // THB
    (amount > 0 ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "TH");

  const withTag = body + "6304";
  return withTag + crc16(withTag);
}
