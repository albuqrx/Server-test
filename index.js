const express = require('express');
const bodyParser = require('body-parser');
const admin = require('./firebase');
require('dotenv').config();

const crypto = require('crypto');
const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;

// ✅ Проверка подписи Telegram
function verifyTelegram(initDataString, botToken) {
  const params = new URLSearchParams(initDataString);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckArray = [];
  params.forEach((value, key) => {
    dataCheckArray.push(`${key}=${value}`);
  });
  dataCheckArray.sort();
  const dataCheckString = dataCheckArray.join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return hmac === hash;
}

// 🔁 Обработка крутки колеса
app.post('/submit_spin', async (req, res) => {
  const { init_data, result_index } = req.body;

  if (!init_data || typeof result_index !== 'number') {
    return res.status(400).json({ error: 'Missing init_data or result_index' });
  }

  // ✅ Верификация Telegram WebApp
  if (!verifyTelegram(init_data, TELEGRAM_BOT_TOKEN)) {
    return res.status(403).json({ error: 'Invalid Telegram signature' });
  }

  // ✅ Извлекаем пользователя
  const params = new URLSearchParams(init_data);
  const user = JSON.parse(params.get('user') || '{}');
  const user_id = String(user.id || 'unknown');
  const username = user.username || 'anonymous';

  // 🔄 Работа с Firestore
  try {
    const spinsRef = admin.collection('spins').doc(user_id);
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
        spins: admin.FieldValue.increment(1),
        last_spin: Date.now()
      });
    }

    const updatedDoc = await spinsRef.get();
    const updated = updatedDoc.data();

    // 🏆 Получаем приз по индексу
    const prizeRef = admin.collection('prizes').doc(String(result_index));
    const prizeDoc = await prizeRef.get();

    if (!prizeDoc.exists) {
      return res.status(404).json({ error: 'Prize not found' });
    }

    const prize = prizeDoc.data().text;

    // ✅ Ответ
    res.json({
      ok: true,
      spins: updated.spins,
      prize
    });

  } catch (err) {
    console.error('🔥 Firestore error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 🔎 Тест Firestore
app.get('/test-firestore', async (req, res) => {
  try {
    const testDoc = await admin.collection('spins').limit(1).get();
    if (testDoc.empty) {
      return res.json({ ok: true, message: 'Firestore подключена, но коллекция пустая.' });
    }

    const data = [];
    testDoc.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });

    res.json({ ok: true, message: 'Firestore подключена!', data });
  } catch (err) {
    console.error('❌ Ошибка Firestore:', err);
    res.status(500).json({ ok: false, message: 'Ошибка подключения к Firestore', error: err.message });
  }
});

// 🏠 Корень сервера
app.get('/', (req, res) => {
  res.send('Сервер работает! Добро пожаловать!');
});

// 🚀 Старт сервера
app.listen(3000, () => {
  console.log('🚀 Сервер запущен на http://localhost:3000');
});