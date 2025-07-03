const express = require('express');
const bodyParser = require('body-parser');
const admin = require('./firebase');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Проверка подписи Telegram initData
function verifyTelegram(initData, hash) {
  const crypto = require('crypto');
  const secret = crypto.createHash('sha256').update(process.env.BOT_TOKEN).digest();
  const check = crypto.createHmac('sha256', secret).update(initData).digest('hex');
  return check === hash;
}

// 🔁 Маршрут подсчёта круток колеса
app.post('/submit_spin', async (req, res) => {
  const { init_data, result_index } = req.body;

  if (!init_data || typeof result_index !== "number") {
    return res.status(400).json({ error: "invalid payload" });
  }

  const url = new URLSearchParams(init_data);
  const user = JSON.parse(url.get("user") || "{}");
  const hash = url.get("hash");

  if (!verifyTelegram(init_data.split("&hash=")[0], hash)) {
    return res.status(403).json({ error: "Invalid Telegram signature" });
  }

  const user_id = String(user.id);
  const username = user.username || 'anonymous';

  const db = admin.firestore();
  const spinsRef = db.collection("spins").doc(user_id);
  const doc = await spinsRef.get();
  const data = doc.exists ? doc.data() : null;

  if (!data) {
    await spinsRef.set({
      username,
      spins: 1,
      last_spin: Date.now()
    });
  } else {
    await spinsRef.update({
      spins: admin.firestore.FieldValue.increment(1),
      last_spin: Date.now()
    });
  }

  const updatedDoc = await spinsRef.get();
  const updated = updatedDoc.data();

  // 🔽 Получаем приз из коллекции prizes
  const prizeRef = db.collection("prizes").doc(String(result_index));
  const prizeDoc = await prizeRef.get();

  if (!prizeDoc.exists) {
    return res.status(404).json({ error: "Prize not found" });
  }

  const prize = prizeDoc.data().text;

  // 🔚 Ответ клиенту
  res.json({
    ok: true,
    spins: updated.spins,
    prize
  });
});

// Запуск сервера
app.listen(3000, () => {
  console.log("🚀 Сервер запущен на http://localhost:3000");
});