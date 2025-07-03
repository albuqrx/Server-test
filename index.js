const express = require('express');
const bodyParser = require('body-parser');
const admin = require('./firebase');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;

// ✅ Проверка подписи Telegram
function verifyTelegram(initDataString, botToken) {
  const parsed = new URLSearchParams(initDataString);
  const hash = parsed.get('hash');
  parsed.delete('hash');

  const dataCheckArray = [];
  parsed.forEach((value, key) => {
    dataCheckArray.push(`${key}=${value}`);
  });
  dataCheckArray.sort();

  const dataCheckString = dataCheckArray.join('\n');
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');


  console.log("➡️  Проверка подписи Telegram:");
  console.log("dataCheckString:", dataCheckString);
  console.log("hash из initData:", hash);
  console.log("рассчитанный HMAC:", hmac);

  return hmac === hash;
}

// 🔁 Обработка крутки колеса
app.post('/submit_spin', async (req, res) => {
  console.log("📩 Получен запрос /submit_spin");
  console.log("📩 Payload от клиента:", JSON.stringify(req.body, null, 2));

  const { init_data, result_index } = req.body;

  if (!init_data || typeof result_index !== "number") {
    console.warn("⚠️ Неверный payload (init_data или result_index):", req.body);
    return res.status(400).json({ error: "invalid payload" });
  }

  const params = new URLSearchParams(init_data);
  const userJson = params.get("user");
  const hash = params.get("hash");

  if (!userJson || !hash) {
    console.error("❌ Нет user или hash в init_data");
    return res.status(400).json({ error: "missing user or hash" });
  }

  const isValid = verifyTelegram(init_data, TELEGRAM_BOT_TOKEN);

  if (!isValid) {
    console.error("❌ Подпись Telegram неверна");
    return res.status(403).json({ error: "Invalid Telegram signature" });
  }

  let user;
  try {
    user = JSON.parse(userJson);
  } catch (e) {
    console.error("❌ Ошибка парсинга user JSON:", e.message);
    return res.status(400).json({ error: "invalid user json" });
  }

  const user_id = String(user.id);
  const username = user.username || 'anonymous';

  console.log(`✅ Подтверждён пользователь: ${username} (${user_id})`);

  // Firestore: запись/обновление
  const spinsRef = admin.collection("spins").doc(user_id);
  const doc = await spinsRef.get();
  const existing = doc.exists ? doc.data() : null;

  if (!existing) {
    console.log("🆕 Новый пользователь. Создаём документ");
    await spinsRef.set({
      username: username,
      spins: 1,
      last_spin: Date.now()
    });
  } else {
    console.log("🔁 Увеличиваем счётчик круток");
    await spinsRef.update({
      spins: admin.firestore.FieldValue.increment(1),
      last_spin: Date.now()
    });
  }

  const updated = (await spinsRef.get()).data();
  console.log("📊 Текущие данные:", updated);

  // 🎁 Получение приза
  const prizeRef = admin.collection("prizes").doc(String(result_index));
  const prizeDoc = await prizeRef.get();

  if (!prizeDoc.exists) {
    console.warn(`❌ Приз с индексом ${result_index} не найден`);
    return res.status(404).json({ error: "Prize not found" });
  }

  const prize = prizeDoc.data().text;

  res.json({
    ok: true,
    spins: updated.spins,
    prize: prize
  });
});

// 🔍 Проверка подключения к Firestore
app.get('/test-firestore', async (req, res) => {
  try {
    const test = await admin.collection("spins").limit(1).get();
    if (test.empty) {
      return res.json({ ok: true, message: "Firestore подключена, но коллекция пустая." });
    }

    const data = [];
    test.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });

    res.json({ ok: true, message: "Firestore работает!", data });
  } catch (e) {
    console.error("🔥 Ошибка Firestore:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Домашняя страница
app.get('/', (req, res) => {
  res.send("🎯 Сервер Telegram Lucky Spin работает!");
});

// 🚀 Старт сервера
app.listen(3000, () => {
  console.log("🚀 Сервер запущен на http://localhost:3000");
});
