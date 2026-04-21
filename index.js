const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PIXEL_ID = process.env.PIXEL_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QUALIFIED_STAGE = process.env.QUALIFIED_STAGE || "Qualificado";
const TEST_EVENT_CODE = process.env.TEST_EVENT_CODE || null;

function hashData(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("Webhook recebido:", JSON.stringify(body, null, 2));

    const record = body?.record || body?.data?.record;

    if (!record) {
      return res.status(200).json({ message: "Evento ignorado - sem record" });
    }

    const stage = record?.estagio || record?.stage?.name || record?.stageName || "";
    console.log("Estágio atual:", stage);

    const stageNorm = stage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const targetNorm = QUALIFIED_STAGE.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (!stageNorm.includes(targetNorm)) {
      return res.status(200).json({ message: `Estágio '${stage}' ignorado` });
    }

    const phone = record?.phones?.primaryPhoneNumber
      ? record.phones.primaryPhoneCallingCode.replace("+", "") + record.phones.primaryPhoneNumber
      : null;
    const firstName = record?.name?.firstName || null;
    const lastName = record?.name?.lastName || null;
    const email = record?.emails?.primaryEmail || null;

    console.log("Lead qualificado detectado! Enviando para o Facebook...");

    const userData = {};
    if (phone) userData.ph = [hashData(phone)];
    if (email) userData.em = [hashData(email)];
    if (firstName) userData.fn = [hashData(firstName)];
    if (lastName) userData.ln = [hashData(lastName)];

    const eventPayload = {
      event_name: "QualifiedLead",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "system_generated",
      custom_data: {
        event_source: "crm",
        lead_event_source: "Twenty CRM"
      },
      user_data: userData,
    };

    const eventData = { data: [eventPayload] };

    if (TEST_EVENT_CODE) {
      eventData.test_event_code = TEST_EVENT_CODE;
      console.log("Usando test_event_code:", TEST_EVENT_CODE);
    }

    // Atualizado para v25.0
    const url = `https://graph.facebook.com/v25.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    });

    const result = await response.json();
    console.log("Resposta do Facebook:", JSON.stringify(result, null, 2));

    if (result.error) {
      console.error("Erro do Facebook:", result.error);
      return res.status(500).json({ error: result.error });
    }

    return res.status(200).json({ success: true, facebook: result });
  } catch (err) {
    console.error("Erro no webhook:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Pixel ID: ${PIXEL_ID}`);
  console.log(`Estágio monitorado: ${QUALIFIED_STAGE}`);
  console.log(`Test Event Code: ${TEST_EVENT_CODE || "não configurado"}`);
});
