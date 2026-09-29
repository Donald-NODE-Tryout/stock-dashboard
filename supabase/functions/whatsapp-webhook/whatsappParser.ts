export interface ExtractedWhatsAppMessage {
  shouldProcess: boolean;
  ignoreReason?: string;
  messageId: string;
  messageText: string;
  replyJid: string;
  tenDigitPhone: string;
  pushName: string;
}

// In-memory cache for mapping Meta Linked Identity (LID) to 10-digit WhatsApp numbers
export const LID_PHONE_CACHE: Record<string, string> = {};

// Optional static mappings via environment variable: LID_PHONE_MAPPINGS="LID1:PHONE1,LID2:PHONE2"
try {
  const envMappings = Deno.env.get("LID_PHONE_MAPPINGS");
  if (envMappings) {
    envMappings.split(",").forEach((pair: string) => {
      const [lid, phone] = pair.split(":");
      if (lid && phone) {
        LID_PHONE_CACHE[lid.trim()] = phone.trim();
      }
    });
  }
} catch {}

export function registerLidMapping(lid: string, phone: string) {
  if (lid && phone) {
    const cleanLid = lid.replace(/\D/g, "");
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanLid && cleanPhone.length === 10) {
      LID_PHONE_CACHE[cleanLid] = cleanPhone;
    }
  }
}

export function parseWhatsAppWebhook(payload: any): ExtractedWhatsAppMessage {
  const emptyResult = (reason: string): ExtractedWhatsAppMessage => ({
    shouldProcess: false,
    ignoreReason: reason,
    messageId: "",
    messageText: "",
    replyJid: "",
    tenDigitPhone: "",
    pushName: ""
  });

  if (!payload) return emptyResult("Empty payload");

  // Handle both flat and nested Evolution API payloads
  const data = payload.data || payload;
  const key = data.key || {};

  // 1. Ignore bot's own outbound messages
  if (key.fromMe) return emptyResult("Message is fromMe");

  // 2. Extract Message ID
  const messageId: string = (key.id || data.id || payload.id || "").toString().trim();

  // 3. Extract Message Text
  const messageObj = data.message || {};
  const messageText = (
    messageObj.conversation ||
    messageObj.extendedTextMessage?.text ||
    data.text ||
    data.body?.text ||
    ""
  ).trim();

  if (!messageText) return emptyResult("No text found in message");

  // 4. Resolve Destination & True Phone Number (Handles Meta @lid updates)
  const incomingRemoteJid: string = key.remoteJid || data.senderNumber || payload.sender || "";
  const remoteJidAlt: string = key.remoteJidAlt || "";

  const isLid = incomingRemoteJid.toLowerCase().includes("@lid");
  const extractedLid = isLid ? incomingRemoteJid.split("@")[0].replace(/\D/g, "") : null;

  let phoneJidSource = "";

  if (isLid) {
    if (remoteJidAlt && !remoteJidAlt.toLowerCase().includes("@lid")) {
      phoneJidSource = remoteJidAlt;
      if (extractedLid) registerLidMapping(extractedLid, remoteJidAlt);
    } else if (data.sender && !data.sender.toLowerCase().includes("@lid")) {
      phoneJidSource = data.sender;
      if (extractedLid) registerLidMapping(extractedLid, data.sender);
    } else if (extractedLid && LID_PHONE_CACHE[extractedLid]) {
      phoneJidSource = LID_PHONE_CACHE[extractedLid];
    } else {
      // NEVER slice the last 10 digits of an internal Meta LID as a phone number!
      return emptyResult(`Unresolvable WhatsApp LID (${incomingRemoteJid}) without phone mapping`);
    }
  } else {
    phoneJidSource = incomingRemoteJid;
  }

  const rawDigits = phoneJidSource.replace(/\D/g, "");
  const tenDigitPhone = rawDigits.slice(-10);

  if (!tenDigitPhone || tenDigitPhone.length < 10) {
    return emptyResult("Could not extract a valid 10-digit phone number");
  }

  // replyJid: Evolution API sends replies to the active chat thread (the incoming remoteJid)
  const replyJid = incomingRemoteJid || phoneJidSource;
  const pushName = data.pushName || "User";

  return {
    shouldProcess: true,
    messageId,
    messageText,
    replyJid,
    tenDigitPhone,
    pushName
  };
}