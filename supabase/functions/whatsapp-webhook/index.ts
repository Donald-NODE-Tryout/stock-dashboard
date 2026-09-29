import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.24.1"
import { parseWhatsAppWebhook } from "./whatsappParser.ts"

// In-memory cache to prevent duplicate webhook processing on network retries or Render wakeups
const recentMessageIds = new Map<string, number>();

const cleanupOldMessages = () => {
  const now = Date.now();
  for (const [id, ts] of recentMessageIds.entries()) {
    if (now - ts > 5 * 60 * 1000) {
      recentMessageIds.delete(id);
    }
  }
};

serve(async (req) => {
  try {
    const rawPayload = await req.json();

    // Parse WhatsApp payload and handle @lid resolution
    const parsed = parseWhatsAppWebhook(rawPayload);

    if (!parsed.shouldProcess) {
      return new Response(JSON.stringify({ status: "Ignored", reason: parsed.ignoreReason }), { status: 200 });
    }

    // Message Deduplication (In-Memory + Database Atomic Lock)
    if (parsed.messageId) {
      cleanupOldMessages();
      if (recentMessageIds.has(parsed.messageId)) {
        console.log(`⚠️ In-memory duplicate webhook message ignored: ${parsed.messageId}`);
        return new Response(JSON.stringify({ status: "Ignored", reason: "Duplicate message ID (memory)" }), { status: 200 });
      }
      recentMessageIds.set(parsed.messageId, Date.now());

      const supabaseUrl = Deno.env.get("SUPA_URL");
      const supabaseKey = Deno.env.get("SUPA_SERVICE_KEY");
      if (supabaseUrl && supabaseKey) {
        const dedupeClient = createClient(supabaseUrl, supabaseKey);
        const { error: insertErr } = await dedupeClient
          .from('processed_whatsapp_messages')
          .insert({ message_id: parsed.messageId });

        if (insertErr) {
          console.log(`⚠️ Database duplicate webhook message ignored: ${parsed.messageId} (${insertErr.message})`);
          return new Response(JSON.stringify({ status: "Ignored", reason: "Duplicate message ID (db)" }), { status: 200 });
        }
      }
    }

    const messageText = parsed.messageText;
    const incomingTenDigits = parsed.tenDigitPhone;

    console.log(`📱 [${incomingTenDigits}] (${parsed.pushName}) asked: ${messageText}`);

    const processAI = async () => {
      try {
        const supabaseUrl = Deno.env.get("SUPA_URL")!;
        const supabaseKey = Deno.env.get("SUPA_SERVICE_KEY")!;
        const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
        const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
        const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
        const instanceName = Deno.env.get("EVOLUTION_INSTANCE");

        const supabase = createClient(supabaseUrl, supabaseKey);

        const sendReply = async (text: string) => {
          if (evolutionUrl && evolutionKey && instanceName) {
            const sanitizedText = text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
            await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
              method: 'POST',
              headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: parsed.replyJid, text: sanitizedText })
            });
          }
        };

        const { data: empList } = await supabase
          .from('employee_register')
          .select('employee_id, employee_name, role, employment_status')
          .ilike('whatsapp_number', `%${incomingTenDigits}%`)
          .limit(1);

        const empData = empList && empList.length > 0 ? empList[0] : null;

        if (!empData || empData.employment_status?.trim().toUpperCase() !== 'ACTIVE') {
          await sendReply("❌ *Unauthorized*: Your WhatsApp number is not registered or your account is inactive.");
          return;
        }

        const userRole = empData.role;
        const userId = empData.employee_id;

        // READ ONLY: Read locations, products, real-time aggregated stock, and recent history
        const [locationsRes, productsRes, stockRes, ledgerRes, ticketsRes, historyRes] = await Promise.all([
          supabase.from('locations').select('location_id, location_name, status').eq('status', 'ACTIVE'),
          supabase.from('product_master').select('model_id, model_name, company, category, status'),
          supabase.from('dashboard_stock_view').select('model_id, location_id, qty'),
          supabase.from('dashboard_ledger_display').select('*').order('entry_number', { ascending: false }).limit(15),
          supabase.from('dispatch_tickets').select('*').order('created_at', { ascending: false }).limit(10),
          supabase.from('chat_history').select('role, content').eq('whatsapp_number', incomingTenDigits).order('created_at', { ascending: false }).limit(6)
        ]);

        const getLocationName = (locId: string | null | undefined) => {
          if (!locId) return null;
          const match = locationsRes.data?.find((l: any) => l.location_id === locId);
          return match ? match.location_name : locId;
        };

        // Real-time stock directly from database view (identical to web dashboard)
        const stockMap: Record<string, Record<string, number>> = {};
        stockRes.data?.forEach((row: any) => {
          const model = row.model_id;
          const locId = row.location_id;
          const qty = Number(row.qty) || 0;
          if (!stockMap[model]) stockMap[model] = {};
          stockMap[model][locId] = qty;
        });

        const liveStockList: string[] = [];
        for (const [model, locs] of Object.entries(stockMap)) {
          for (const [locId, qty] of Object.entries(locs)) {
            const locName = getLocationName(locId) || locId;
            liveStockList.push(`- Model: ${model} | Location: ${locName} (ID: ${locId}) | Current Stock: ${qty}`);
          }
        }
        const liveStockContext = liveStockList.join('\n') || "No stock records found.";

        const locationMap = locationsRes.data?.map((l: any) => `- ${l.location_name} (ID: ${l.location_id})`).join('\n') || "None";
        const productCatalog = productsRes.data?.map((p: any) => `- ${p.model_id} | Status: ${p.status}`).join('\n') || "None";
        
        // The view already provides resolved location names in 'from_location' and 'to_location'
        const recentLedger = ledgerRes.data?.slice(0, 15).map((l: any) => 
          `- ID: ${l.entry_id} | Date: ${l.date} | ${l.action}: ${l.qty}x ${l.model_id} (From: ${l.from_location || 'External'} -> To: ${l.to_location || 'External'})`
        ).join('\n') || "None";

        const recentTickets = ticketsRes.data?.map((t: any) => `- Ticket ${t.ticket_id}: ${t.qty}x ${t.model_id} from ${getLocationName(t.from_location) || t.from_location} [Status: ${t.ticket_status}]`).join('\n') || "None";
        const chatHistoryContext = (historyRes.data || []).reverse().map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n') || "No previous messages.";

        const tools = [{
          functionDeclarations: [
            {
              name: "record_ledger_transaction",
              description: "Record a stock movement (SALE, PURCHASE, TRANSFER, ADJUSTMENT, or ENTRY).",
              parameters: {
                type: "OBJECT",
                properties: {
                  action: { type: "STRING", description: "MUST be: PURCHASE, SALE, TRANSFER, ADJUSTMENT, or ENTRY" },
                  model_id: { type: "STRING", description: "The exact model_id from product catalog" },
                  qty: { type: "INTEGER", description: "Quantity of items" },
                  from_location: { type: "STRING", description: "Source location ID. Required for SALE and TRANSFER." },
                  to_location: { type: "STRING", description: "Destination location ID. Required for PURCHASE, ENTRY, and TRANSFER." },
                  remarks: { type: "STRING", description: "Any notes or reference details" }
                },
                required: ["action", "model_id", "qty"]
              }
            },
            {
              name: "delete_ledger_entry",
              description: "Delete/void an accidental ledger entry made TODAY.",
              parameters: {
                type: "OBJECT",
                properties: {
                  entry_id: { type: "STRING", description: "The exact entry_id (e.g. VI/ENT/1115)" },
                  reason: { type: "STRING", description: "Reason for deletion" }
                },
                required: ["entry_id"]
              }
            }
          ]
        }];

        const genAI = new GoogleGenerativeAI(geminiKey);

        const prompt = `You are an intelligent ERP inventory assistant.
User: ${empData.employee_name} | Role: ${userRole} | ID: ${userId}

CRITICAL RULES FOR LOGIC & EXECUTION:
1. CONTEXTUAL CONTINUATION (THE MEMORY RULE):
   - If the CURRENT USER MESSAGE is a short clarification (e.g., "Mota Mova", "Yes", "The Blue one") replying to a question you asked in the RECENT CONVERSATION HISTORY, DO NOT ask them to repeat the command. 
   - You MUST reconstruct their pending transaction from the history, combine it with their new short answer, and EXECUTE the tool call immediately.
2. SMART QUANTITY DEDUCTION:
   - For SALE or TRANSFER: If the user does not specify a 'from_location', check the LIVE CURRENT STOCK.
   - If ONLY ONE location has enough stock (>= requested quantity) to fulfill the order, ASSUME that location automatically and execute the tool.
   - If MULTIPLE locations have enough stock, DO NOT guess—ask the user to clarify.
3. LOCATION INHERITANCE:
   - If a location (e.g. "Mota Mova") is mentioned in a multi-item sentence, assume it applies to ALL items in that message unless another is specified.
4. PARTIAL EXECUTION:
   - If the user lists multiple items but one is ambiguous, execute tools ONLY for the clear items. Use conversational text to ask for clarification on the ambiguous one.
5. PERSONA & TONE:
   - NEVER speak like a robot ("As an AI assistant..."). Speak naturally and warmly like a sharp, reliable human teammate.
6. WHATSAPP FORMATTING:
   - Use single asterisks *bold* for bold text. Do NOT use markdown double asterisks.
   - Use the Unicode bullet '•' for lists.

ACTIVE LOCATIONS:
${locationMap}

PRODUCT CATALOG:
${productCatalog}

LIVE CURRENT STOCK:
${liveStockContext}

RECENT LEDGER TRANSACTIONS:
${recentLedger}

RECENT DISPATCH TICKETS:
${recentTickets}

RECENT CONVERSATION HISTORY:
${chatHistoryContext}

CURRENT USER MESSAGE:
"${messageText}"`;

        // Model Cascade for high availability: Primary gemini-3.8-flash -> Fallback gemini-3.7-flash -> gemini-3.5-flash
        const CANDIDATE_MODELS = [
          "gemini-3.8-flash",
          "gemini-3.7-flash",
          "gemini-3.5-flash"
        ];

        let result: any = null;
        let lastError: any = null;

        for (const modelName of CANDIDATE_MODELS) {
          try {
            const candidateModel = genAI.getGenerativeModel({ model: modelName });
            result = await candidateModel.generateContent({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              tools: tools
            });
            console.log(`🤖 AI responded successfully using model: ${modelName}`);
            break;
          } catch (err: any) {
            console.warn(`⚠️ Model ${modelName} call failed, trying next fallback...`, err?.message || err);
            lastError = err;
          }
        }

        if (!result) {
          throw lastError || new Error("All candidate Gemini models failed to respond.");
        }

        let aiReplyText = "";
        const actionReplies: string[] = [];
        const functionCalls = result.response.functionCalls();

        // 5. EXECUTE DATABASE ACTIONS
        if (functionCalls && functionCalls.length > 0) {
          for (const call of functionCalls) {
            
            // ACTION: DELETE
            if (call.name === "delete_ledger_entry") {
              if (!['ADMIN', 'BRANCH_MANAGER', 'SALES_HEAD'].includes(userRole)) {
                actionReplies.push(`❌ *Permission Denied*: Your role cannot delete entries.`);
                continue;
              }

              const { entry_id } = call.args as any;
              
              // Direct table read for verification
              const { data: existingEntry, error: fetchErr } = await supabase
                .from('ledger')
                .select('*')
                .eq('entry_id', entry_id)
                .single();

              if (fetchErr || !existingEntry) {
                actionReplies.push(`❌ *Not Found*: Entry *${entry_id}* was not found.`);
              } else {
                const todayStr = new Date().toISOString().split('T')[0];
                if (existingEntry.date !== todayStr) {
                  actionReplies.push(`❌ *Policy Restriction*: Entry *${entry_id}* was made on ${existingEntry.date}. Entries older than today cannot be deleted.`);
                } else {
                  // Direct table delete on 'ledger'
                  const { error: delErr } = await supabase.from('ledger').delete().eq('entry_id', entry_id);
                  
                  if (delErr) {
                    actionReplies.push(`❌ *Database Error*: ${delErr.message}`);
                  } else {
                    const model = existingEntry.model_id;
                    const qty = Number(existingEntry.qty);
                    if (!stockMap[model]) stockMap[model] = {};
                    if (existingEntry.from_location) stockMap[model][existingEntry.from_location] = (stockMap[model][existingEntry.from_location] || 0) + qty;
                    if (existingEntry.to_location) stockMap[model][existingEntry.to_location] = (stockMap[model][existingEntry.to_location] || 0) - qty;

                    const fromName = getLocationName(existingEntry.from_location);
                    const toName = getLocationName(existingEntry.to_location);
                    actionReplies.push(`🗑️ *Deleted Successfully!*\n• Voided: *${entry_id}* (${existingEntry.action} ${qty}x ${model})\n• Route: ${fromName || 'External'} ➔ ${toName || 'External'}`);
                  }
                }
              }
            }
            
            // ACTION: INSERT RECORD
            else if (call.name === "record_ledger_transaction") {
              if (!['ADMIN', 'BRANCH_MANAGER', 'SALES_HEAD'].includes(userRole)) {
                actionReplies.push(`❌ *Permission Denied*: Your role cannot record transactions.`);
                continue;
              }

              const { action, model_id, qty, from_location, to_location, remarks } = call.args as any;
              const actUpper = action.toUpperCase();
              const numQty = Number(qty);

              if (actUpper !== 'ADJUSTMENT' && numQty <= 0) {
                actionReplies.push(`❌ *Invalid Quantity*: Must be greater than 0.`);
                continue;
              }

              const prod = productsRes.data?.find((p: any) => p.model_id === model_id);
              if (!prod || prod.status !== 'ACTIVE') {
                actionReplies.push(`❌ *Error*: Product *${model_id}* is not ACTIVE.`);
                continue;
              }

              // STRICT STOCK GUARDRAIL
              const locToCheck = actUpper === 'ADJUSTMENT' && numQty < 0 ? from_location : from_location;
              const requiredQty = actUpper === 'ADJUSTMENT' && numQty < 0 ? Math.abs(numQty) : numQty;
              
              const availableStock = stockMap[model_id]?.[locToCheck] || 0;
              
              if (locToCheck && (actUpper === 'SALE' || actUpper === 'TRANSFER' || (actUpper === 'ADJUSTMENT' && numQty < 0))) {
                if (availableStock < requiredQty) {
                  const fromName = getLocationName(locToCheck) || locToCheck;
                  actionReplies.push(`❌ *Insufficient Stock!*\n• Location *${fromName}* only has *${availableStock}* unit(s) of *${model_id}*.\n• Cannot complete *${actUpper}* for ${requiredQty} unit(s).`);
                  continue;
                }
              }

              // INSERT directly into 'ledger' table.
              // Note: We omit 'entry_id' — the database sequence automatically assigns 'VI/ENT/XXXX'
              const { data: insertedEntry, error } = await supabase
                .from('ledger')
                .insert({
                  model_id,
                  action: actUpper,
                  from_location: from_location || null,
                  to_location: to_location || null,
                  qty: numQty,
                  remarks: remarks || "Logged via WhatsApp",
                  entry_by: userId,
                  date: new Date().toISOString().split('T')[0]
                })
                .select('entry_id')
                .single();

              if (error) {
                actionReplies.push(`❌ *Database Error*: ${error.message}`);
              } else {
                const entry_id = insertedEntry.entry_id;

                if (!stockMap[model_id]) stockMap[model_id] = {};
                if (from_location) stockMap[model_id][from_location] = (stockMap[model_id][from_location] || 0) - numQty;
                if (to_location) stockMap[model_id][to_location] = (stockMap[model_id][to_location] || 0) + numQty;

                const fromName = getLocationName(from_location);
                const toName = getLocationName(to_location);

                let movementText = "";
                if (actUpper === "SALE") movementText = `• Location: *${fromName || 'General'}*`;
                else if (actUpper === "PURCHASE" || actUpper === "ENTRY") movementText = `• Stored at: *${toName || 'General'}*`;
                else if (actUpper === "TRANSFER") movementText = `• Route: *${fromName}* ➔ *${toName}*`;
                else if (actUpper === "ADJUSTMENT") movementText = `• Adjusted at: *${fromName || toName || 'General'}*`;

                actionReplies.push(`✅ *Recorded Successfully!*\n• ID: *${entry_id}*\n• Action: *${actUpper}*\n• Item: *${numQty}x ${model_id}*\n${movementText}`);
              }
            }
          }
        }

        // 6. COMBINE RECEIPTS WITH CONVERSATIONAL TEXT
        if (actionReplies.length > 0) {
          aiReplyText = actionReplies.join("\n\n────────────────\n\n");
        }

        const conversationalText = result.response.text();
        if (conversationalText && conversationalText.trim() !== "") {
          if (aiReplyText !== "") {
             aiReplyText += `\n\n────────────────\n\n💬 ${conversationalText}`;
          } else {
             aiReplyText = conversationalText;
          }
        }

        await supabase.from('chat_history').insert([
          { whatsapp_number: incomingTenDigits, role: 'user', content: messageText },
          { whatsapp_number: incomingTenDigits, role: 'model', content: aiReplyText }
        ]);

        await sendReply(aiReplyText);

      } catch (err: any) {
        console.error("Background AI Error:", err);
      }
    };

    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(processAI());
    else processAI().catch(console.error);

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});