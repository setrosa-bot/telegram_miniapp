# 🤖 Telegram Mini App - Digital Account Shop 🛒📱

ប្រព័ន្ធ **Telegram Mini App** និង **Telegram Bot** សម្រាប់លក់ Account Premium (CapCut Pro, ChatGPT, Canva Pro, Netflix 4K, etc.) ជាមួយ Admin Control Panel និងប្រព័ន្ធ Broadcast Alert ជូនដំណឹង automatic ទៅកាន់ Users!

---

## 📁 រចនាសម្ព័ន្ធ Project (Project Structure)

```
Bot Telegram Mini App/
├── app.py              ← FastAPI Backend Server + Telegram Bot Polling Runner
├── bot.py              ← Telegram Bot Handlers (/start, /admin, Broadcast Engine)
├── database.py         ← Dynamic SQLite Database (Users, Products, Stock, Orders, Alerts)
├── config.py           ← Environment Configuration & Settings
├── start.py            ← Runner Script (uvicorn start)
├── requirements.txt    ← Python Dependencies
├── .env.example        ← Environment Template
├── .env                ← Configuration (BOT_TOKEN, ADMIN_IDS, etc.)
└── webapp/             ← Telegram Mini App Frontend UI
    ├── index.html      ← Main WebApp Interface
    ├── css/
    │   └── style.css   ← Glassmorphism Dark Theme
    └── js/
        └── app.js      ← Telegram WebApp SDK & API Client Logic
```

---

## ⚡ របៀបដំឡើង និង ដំណើរការ (Quick Setup Guide)

### 1. ដំឡើង Python Dependencies
```bash
pip install -r requirements.txt
```

### 2. រៀបចំ `.env` File
កែសម្រួល `.env` ហើយដាក់ Bot Token និង Admin Telegram ID របស់អ្នក៖
```env
BOT_TOKEN=your_bot_token_from_botfather
ADMIN_IDS=123456789
WEBAPP_URL=http://localhost:8000
HOST=0.0.0.0
PORT=8000

# ព័ត៌មានបង់ប្រាក់ KHQR / Bank Details
ABA_NAME=DIGITAL STORE
ABA_NUMBER=000 123 456
ACLEDA_NUMBER=012345678
WING_NUMBER=012345678
USDT_ADDRESS=TYourUsdtAddressHere
```

### 3. ដំឡើង Bot ក្នុង @BotFather ( Telegram WebApp Setup )
1. បើក Telegram → ស្វែងរក **@BotFather**
2. ផ្ញើ `/newbot` → ដាក់ឈ្មោះ Bot និង Username (ឧ. `DigitalPremiumShop_bot`)
3. ចម្លង **Token** យកមកដាក់ក្នុង `.env` ត្រង់ `BOT_TOKEN=`
4. ផ្ញើ `/setmenubutton` ទៅ **@BotFather**៖
   - ជ្រើសរើស Bot របស់អ្នក
   - ជ្រើសរើស **Configure menu button**
   - ផ្ញើ WebApp URL របស់អ្នក (ឧ. `https://your-domain.com` ឬ Link ngrok/localtunnel)
   - ដាក់ឈ្មោះប៊ូតុង៖ `🛒 បើកហាង (Shop)`

### 4. ដំណើរការ Server & Bot
```bash
python start.py
```

---

## 👑 របៀបប្រើប្រាស់ Admin Panel & Alert Feature

### ➕ 1. បន្ថែមទំនិញថ្មី (Add New Product):
- ចូល Mini App → ជ្រើសរើស Tab **Admin**
- ចុច **➕ Add Product**
- បំពេញ ឈ្មោះ, ប្រភេទ, តម្លៃ, រយៈពេល, រូបភាព URL, និង Stock អាខោន ( email|password|pin )
- គ្រីសត្រង់ **"📢 Send Broadcast Alert to All Users Immediately!"** រួចចុច រក្សាទុក
- ប្រព័ន្ធនឹងបង្កើតទំនិញផង និង **Auto Broadcast Alert** ទៅកាន់ Telegram Chat របស់ Users ទាំងអស់ភ្លាមៗ!

### 📢 2. ផ្ញើសារ Alert ដោយដៃ (Broadcast Alert):
- ក្នុង Admin Tab → ចុច **📢 Alert All**
- បំពេញ ចំណងជើង, ខ្លឹមសារសារ, និង រូបភាព
- ប្រព័ន្ធនឹងផ្ញើសារ Alert រៀបចំស្អាត មានប៊ូតុង "🛒 មើលទំនិញ" ទៅ Telegram Users ទាំងអស់!

### 🔑 3. បន្ថែម Stock អាខោន (Add Account Credentials):
- ក្នុង Admin Tab → ចុច **🔑 Add Stock**
- ជ្រើសរើស Product រួច Paste បញ្ជី Account (១ បន្ទាត់ = ១ អាខោន)
- ចុច បញ្ចូល Stock

---

## 🛠️ Tech Stack
- **Backend:** Python 3.11+, FastAPI, python-telegram-bot (v21 async), aiosqlite
- **Frontend:** Telegram WebApp SDK (`@twa-dev/sdk`), Modern Vanilla JS (ES6+), Modern HTML5 & CSS3 Glassmorphism UI
- **Database:** SQLite (Async)
