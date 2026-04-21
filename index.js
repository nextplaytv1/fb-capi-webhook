const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PIXEL_ID = process.env.PIXEL_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QUALIFIED_STAGE = process.env.QUALIFIED_STAGE || "Qualificado";

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

    // Pega o estágio atual — Twenty envia como "QUALIFICADO"
    const stage = record?.estagio || record?.stage?.name || record?.stageName || "";
    console.log("Estágio atual:", stage);

    // Compara sem acento e maiúsculas
    const stageNorm = stage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const targetNorm = QUALIFIED_STAGE.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (!stageNorm.includes(targetNorm)) {
      return res.status(200).json({ message: `Estágio '${stage}' ignorado` });
    }

    // Monta os dados do lead (formato Twenty)
    const email = record?.emails?.primaryEmail || null;
    const phone = record?.phones?.primaryPhoneNumber || null;
    const firstName = record?.name?.firstName || null;
    const lastName = record?.name?.lastName || null;

    console.log("Lead qualificado detectado! Enviando para o Facebook...");

    // Monta user_data apenas com campos preenchidos
    const userData = {};
    if (email) userData.em = [hashData(email)];
    if (phone) userData.ph = [hashData(phone)];
    if (firstName) userData.fn = [hashData(firstName)];
    if (lastName) userData.ln = [hashData(lastName)];

    const eventData = {
      data: [
        {
          event_name: "QualifiedLead",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "system_generated",
          user_data: userData,
        },
      ],
    };

    // Envia para o Facebook
    const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
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
});
