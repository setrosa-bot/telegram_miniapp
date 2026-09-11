import logging
import asyncio
import os
import datetime
import html
from typing import Optional
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, BotCommand
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
from config import BOT_TOKEN, WEBAPP_URL, DATABASE_PATH, PAYMENT_INFO, is_admin
import database as db
from telegram_alert import send_purchase_alert, send_account_delivery_dm, send_one_alert

logger = logging.getLogger(__name__)

# ─── KEYBOARDS & UI BUILDERS ───────────────────────────────────────────────────

def get_main_keyboard(user_id: int):
    """Clean single-button WebApp launcher without extra keyboard clutter."""
    kb = [
        [
            InlineKeyboardButton("🛍️ បើកហាងទំនិញ (Open Shop)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))
        ]
    ]
    if is_admin(user_id):
        kb.append([
            InlineKeyboardButton("👑 Admin Panel (គ្រប់គ្រង)", web_app=WebAppInfo(url=f"{WEBAPP_URL}#admin"))
        ])
    return InlineKeyboardMarkup(kb)

def get_back_keyboard():
    """Back button to return to main menu."""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")],
        [InlineKeyboardButton("🛒 បើកហាងទំនិញ (Open Shop)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))]
    ])

# ─── COMMAND HANDLERS ──────────────────────────────────────────────────────────

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command with clean, elegant layout."""
    user = update.effective_user
    if not user:
        return

    # Check for referral parameter or angpao parameter in /start
    referred_by = None
    if context.args and len(context.args) > 0:
        arg = context.args[0]
        if arg.startswith("ref_") and arg[4:].isdigit():
            possible_ref = int(arg[4:])
            if possible_ref != user.id:
                referred_by = possible_ref
        elif arg.startswith("angpao_"):
            angpao_code = arg[7:].strip()
            angpao_info = await db.get_angpao_details(angpao_code)
            if angpao_info:
                safe_sponsor = html.escape(angpao_info.get("creator_name", "Store Sponsor"))
                safe_msg = html.escape(angpao_info.get("message", "សូមសំណាងល្អ!"))
                angpao_text = (
                    f"🧧 <b>អបអរសាទរ! អ្នកបានទទួលកញ្ចប់អាំងប៉ាវ Lucky Angpao!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"👤 ម្ចាស់អាំងប៉ាវ៖ <b>{safe_sponsor}</b>\n"
                    f"💌 ពាក្យជូនពរ៖ <i>\"{safe_msg}\"</i>\n\n"
                    f"👇 <i>ចុចប៊ូតុងខាងក្រោមដើម្បីបើកយកប្រាក់សុទ្ធ Free ចូល Wallet ឥឡូវនេះ!</i>"
                )
                kb = InlineKeyboardMarkup([
                    [InlineKeyboardButton("🧧 ចុចបើកអាំងប៉ាវ (Open Angpao)", web_app=WebAppInfo(url=f"{WEBAPP_URL}#angpao={angpao_code}"))]
                ])
                if update.message:
                    await update.message.reply_text(angpao_text, parse_mode="HTML", reply_markup=kb)
                return

    # Upsert user to DB
    user_db = await db.upsert_user(user.id, user.username, user.full_name, referred_by)
    balance = user_db.get("balance", 0.0) if user_db else 0.0

    # Cache avatar photo if available
    try:
        if not user_db or not user_db.get("photo_url"):
            photos = await context.bot.get_user_profile_photos(user_id=user.id, limit=1)
            if photos and photos.total_count > 0 and photos.photos and len(photos.photos[0]) > 0:
                photo_size = photos.photos[0][-1]
                tg_file = await context.bot.get_file(photo_size.file_id)
                avatars_dir = os.path.join("data", "uploads", "avatars")
                os.makedirs(avatars_dir, exist_ok=True)
                file_dest = os.path.join(avatars_dir, f"{user.id}.jpg")
                await tg_file.download_to_drive(custom_path=file_dest)
                await db.update_user_photo(user.id, f"/uploads/avatars/{user.id}.jpg")
    except Exception as e:
        logger.debug(f"Could not cache user avatar on start: {e}")

    # Get VIP Tier Info
    vip = await db.get_user_vip_tier(user.id)
    safe_name = html.escape(user.full_name or "អតិថិជន")

    welcome_text = (
        f"💎 <b>DIGITAL PREMIUM STORE</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"👋 សួស្តី <b>{safe_name}</b>!\n\n"
        f"• 🆔 ID: <code>{user.id}</code>\n"
        f"• 💰 សមតុល្យ Balance: <b>${balance:.2f}</b>\n"
        f"• {vip['tier_badge']} កម្រិត: <b>{vip['tier_name']}</b> (Discount {vip['discount_percent']}%)\n\n"
        f"✨ <i>ចុចប៊ូតុងខាងក្រោមដើម្បីចូលទិញទំនិញ៖</i>"
    )

    if update.message:
        await update.message.reply_text(
            welcome_text,
            parse_mode="HTML",
            reply_markup=get_main_keyboard(user.id)
        )
    elif update.callback_query:
        await update.callback_query.edit_message_text(
            welcome_text,
            parse_mode="HTML",
            reply_markup=get_main_keyboard(user.id)
        )

async def shop_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /shop command to quickly open the Mini App."""
    user = update.effective_user
    text = (
        "🛒 **DIGITAL PREMIUM MINI APP**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "ចុចប៊ូតុងខាងក្រោមដើម្បីចូលមើលទំនិញ តម្លៃ និងកម្ម៉ង់ទិញភ្លាមៗ!"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✨ បើកហាងទំនិញឥឡូវនេះ (Open Shop)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))]
    ])
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)

async def wallet_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /wallet command to show balance & deposit options."""
    user = update.effective_user
    if not user:
        return

    user_db = await db.get_user(user.id)
    balance = user_db.get("balance", 0.0) if user_db else 0.0

    wallet_text = (
        "💳 **កាបូបលុយរបស់អ្នក (MY WALLET)**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"💰 **សមតុល្យបច្ចុប្បន្ន៖** `${balance:.2f}`\n\n"
        "💡 *អ្នកអាចប្រើប្រាស់សមតុល្យក្នុងកាបូបលុយដើម្បីទិញទំនិញបានភ្លាមៗ ដោយមិនចាំបាច់ផ្ញើស្លីបផ្ទៀងផ្ទាត់ម្តងទៀតឡើយ!*\n\n"
        "👇 **សូមចុចប៊ូតុងខាងក្រោមដើម្បីបញ្ចូលប្រាក់ (Top-up)៖**"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ បញ្ចូលប្រាក់ (Top-up Balance)", web_app=WebAppInfo(url=f"{WEBAPP_URL}#wallet"))],
        [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
    ])
    await update.message.reply_text(wallet_text, parse_mode="Markdown", reply_markup=kb)

async def myorders_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /myorders command to display purchased accounts and keys."""
    user = update.effective_user
    if not user:
        return

    orders = await db.get_user_orders(user.id)
    delivered = [o for o in orders if o.get("status") == "delivered"]

    if not delivered:
        text = (
            "📋 **ប្រវត្តិការទិញទំនិញ (MY ORDERS)**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "❌ អ្នកមិនទាន់មានការបញ្ជាទិញនៅឡើយទេ។\n\n"
            "👇 សូមចុចប៊ូតុងខាងក្រោមដើម្បីជ្រើសរើសទិញទំនិញ Premium៖"
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🛒 ទៅកាន់ហាងទំនិញ (Shop Now)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))],
            [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
        ])
        await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)
        return

    text = "📋 **អាខោនដែលអ្នកបានទិញរួចរាល់ (DELIVERED ACCOUNTS)**\n━━━━━━━━━━━━━━━━━━━━━\n"
    for idx, ord_item in enumerate(delivered[:5], 1):
        prod_name = ord_item.get("product_name", "Product")
        exp = ord_item.get("expiry_date", "N/A")
        creds = ord_item.get("credentials", "N/A")
        text += (
            f"🔹 **#{idx}. {prod_name}** (Order #{ord_item['id']})\n"
            f"📅 ផុតកំណត់៖ `{exp}`\n"
            f"🔑 គណនី/Key:\n`{creds}`\n\n"
        )

    text += "💡 *ដើម្បីមើលប្រវត្តិទាំងអស់ ឬសុំដូរអាខោន សូមចូលក្នុង Mini App!*"
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("📋 មើលក្នុង Mini App", web_app=WebAppInfo(url=f"{WEBAPP_URL}#orders"))],
        [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
    ])
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)

async def giveaway_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /giveaway or /free command to open the Free Giveaway section."""
    user = update.effective_user
    if not user:
        return
    text = (
        "🎁 **ចែកជូនអាខោន PREMIUM FREE (GIVEAWAYS)**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "ចូលរួម Telegram Group & Channel របស់យើងខ្ញុំ ដើម្បីទទួលយក Account Free ភ្លាមៗ!\n\n"
        "👇 សូមចុចប៊ូតុងខាងក្រោមដើម្បីចូលទៅជ្រើសរើស និងទទួលយក៖"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🎁 ទទួលយក Account Free ឥឡូវនេះ", web_app=WebAppInfo(url=f"{WEBAPP_URL}#giveaway"))],
        [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
    ])
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)

async def referral_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /referral command to show affiliate/referral stats and link."""
    user = update.effective_user
    if not user:
        return

    bot_info = await context.bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start=ref_{user.id}"

    ref_stats = await db.get_user_referral_stats(user.id)
    count = ref_stats.get("referrals_count", 0)
    earned = ref_stats.get("total_earned", 0.0)

    text = (
        "🎁 **ប្រព័ន្ធណែនាំរកប្រាក់ (REFERRAL PROGRAM)**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "ចែករំលែក Link របស់អ្នកទៅកាន់មិត្តភក្តិ ដើម្បីទទួលបានកម្រៃជើងសាររាល់ពេលដែលពួកគេទិញទំនិញ!\n\n"
        f"👥 ចំនួនអ្នកចុះឈ្មោះតាម Link: `{count}` នាក់\n"
        f"💵 ប្រាក់ចំណូលដែលទទួលបាន: `${earned:.2f}`\n\n"
        f"🔗 **Link ណែនាំផ្ទាល់ខ្លួនរបស់អ្នក៖**\n"
        f"`{ref_link}`\n\n"
        "💡 *ចុចលើ Link ដើម្បី Copy រួចផ្ញើទៅកាន់មិត្តភក្តិរបស់អ្នក!*"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("📤 ចែករំលែក Link នេះ", url=f"https://t.me/share/url?url={ref_link}&text=ទិញអាខោន Premium តម្លៃសមរម្យនៅទីនេះ!")],
        [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
    ])
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)

async def spin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /spin command for free daily lucky wheel rewards."""
    user = update.effective_user
    if not user:
        return
    res = await db.perform_user_spin(user.id)
    if res.get("success"):
        text = (
            "🎰 **DAILY LUCKY SPIN REWARD!** 🎁\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "🎉 **អបអរសាទរ!** អ្នកបានបង្វិលកង់សំណាងឈ្នះ៖\n\n"
            f"✨ **{res['reward_label']}** ✨\n\n"
            f"💰 សមតុល្យ Balance ថ្មីរបស់អ្នក៖ `${res['new_balance']:.2f}`\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "💡 *អ្នកអាចប្រើ Balance នេះទិញទំនិញភ្លាមៗ ឬបង្វិលម្តងទៀតនៅថ្ងៃស្អែក!*"
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🛒 ទៅកាន់ហាងទំនិញ (Shop Now)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))],
            [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
        ])
    else:
        rem = res.get("remaining_seconds", 0)
        hours = rem // 3600
        mins = (rem % 3600) // 60
        text = (
            "🎰 **DAILY LUCKY SPIN**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "⏳ **អ្នកបានបង្វិលកង់សំណាងរួចហើយថ្ងៃនេះ!**\n\n"
            f"⏱️ សូមរង់ចាំ **{hours} ម៉ោង {mins} នាទី** ទៀត ដើម្បីបង្វិលយករង្វាន់ថ្មី!\n\n"
            "💡 *អ្នកអាចបង្វិលបាន ១ដង រៀងរាល់ ២៤ ម៉ោង។*"
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("✨ បើក Mini App", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))],
            [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
        ])
    if update.message:
        await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)
    elif update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)

async def vip_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /vip and /profile command to display user tier loyalty perks."""
    user = update.effective_user
    if not user:
        return
    vip = await db.get_user_vip_tier(user.id)
    bar = format_progress_bar(vip.get("progress", 0))
    user_db = await db.get_user(user.id)
    balance = user_db.get("balance", 0.0) if user_db else 0.0

    text = (
        f"💎 **ប្រព័ន្ធកម្រិត VIP LOYALTY PROGRAM**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 អតិថិជន: **{user.full_name}**\n"
        f"• 💰 សមតុល្យ Balance: `${balance:.2f}`\n"
        f"• {vip['tier_badge']} កម្រិតបច្ចុប្បន្ន: **{vip['tier_name']}**\n"
        f"• 🏷️ សិទ្ធិបញ្ចុះតម្លៃ: **{vip['discount_percent']}% OFF**\n"
        f"• 🛒 ចំនួន Order ជោគជ័យ: `{vip['order_count']}` Orders\n"
        f"• 💵 ការចំណាយសរុប: `${vip['total_spent']:.2f}`\n"
    )
    if vip.get("next_tier"):
        text += (
            f"• 🎯 កម្រិតបន្ទាប់: **{vip['next_tier']}** (${vip['next_target']:.2f})\n"
            f"• 📈 Progress: `[{bar}] {vip['progress']}%`\n"
        )
    else:
        text += "👑 **អ្នកបានឈានដល់កម្រិតខ្ពស់បំផុត Diamond VIP ហើយ!** 🌟\n"

    text += (
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "✨ **អត្ថប្រយោជន៍ VIP Tiers:**\n"
        "• 🥉 Bronze ($0+): Auto Delivery 24/7\n"
        "• 🥈 Silver ($10+): បញ្ចុះតម្លៃ 3% & Support រហ័ស\n"
        "• 🥇 Gold ($30+): បញ្ចុះតម្លៃ 5% & Priority Warranty\n"
        "• 💎 Diamond ($80+): បញ្ចុះតម្លៃ 10% & VIP Priority!"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🛒 ទិញទំនិញឡើង Rank", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))],
        [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
    ])
    if update.message:
        await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)
    elif update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)

async def catalog_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /catalog command to browse store categories directly in chat."""
    categories = await db.get_categories()
    text = (
        "🛍️ **កាតាឡុកទំនិញក្នុង CHAT (IN-CHAT STORE)**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "សូមជ្រើសរើសប្រភេទ Categories ខាងក្រោមដើម្បីមើលបញ្ជីទំនិញ និងកុម្ម៉ង់ទិញភ្លាមៗ៖"
    )
    kb_rows = []
    for cat in categories:
        icon = cat.get('icon', '📦')
        name = cat.get('name', 'Category')
        cid = cat.get('id')
        kb_rows.append([InlineKeyboardButton(f"{icon} {name}", callback_data=f"cb_cat_{cid}")])
    
    kb_rows.append([InlineKeyboardButton("✨ បើក Mini App ពេញលេញ", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))])
    kb_rows.append([InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")])

    kb = InlineKeyboardMarkup(kb_rows)
    if update.message:
        await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)
    elif update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command for support, banking info and FAQ."""
    aba = PAYMENT_INFO.get("ABA", {})
    acleda = PAYMENT_INFO.get("ACLEDA", {})
    usdt = PAYMENT_INFO.get("USDT", {})

    help_text = (
        "📞 **សេវាបម្រើអតិថិជន & ជំនួយ (SUPPORT)**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "ប្រសិនបើអ្នកជួបបញ្ហាលើការទូទាត់ ឬអាខោន សូមទាក់ទងមកកាន់យើងខ្ញុំ៖\n\n"
        "📢 **Official Channel:** @smarttech_digital (https://t.me/smarttech_digital)\n"
        "👥 **Official Group:** @smarttech_digitals (https://t.me/smarttech_digitals)\n\n"
        "💳 **គណនីទូទាត់ប្រាក់ផ្លូវការ៖**\n"
        f"• 🔵 ABA: `{aba.get('number', '000 123 456')}` ({aba.get('name', 'DIGITAL STORE')})\n"
        f"• 🟢 ACLEDA: `{acleda.get('number', '012345678')}`\n"
        f"• 🟣 USDT (TRC20): `{usdt.get('address', 'TRC20_ADDRESS')}`\n\n"
        "🛡️ **គោលការណ៍ធានា (Warranty):**\n"
        "ធានាជូនពេញរយៈពេលកំណត់ បើមានបញ្ហាអាចស្នើសុំដូរថ្មីតាមប្រព័ន្ធស្វ័យប្រវត្តិក្នុង Mini App!"
    )
    await update.message.reply_text(help_text, parse_mode="Markdown", reply_markup=get_back_keyboard())

async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /admin command for administrators."""
    user = update.effective_user
    if not is_admin(user.id):
        await update.message.reply_text("❌ អ្នកគ្មានសិទ្ធិប្រើប្រាស់ Command នេះទេ។")
        return

    stats = await db.get_stats()
    admin_text = (
        "👑 **ADMIN DASHBOARD**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"👥 អ្នកប្រើប្រាស់សរុប: `{stats['total_users']}` នាក់\n"
        f"📦 ទំនិញកំពុងលក់: `{stats['total_products']}` ប្រភេទ\n"
        f"🔑 ស្តុកអាខោននៅសល់: `{stats['total_stock']}` Accounts\n"
        f"🛒 Orders ជោគជ័យ: `{stats['total_orders']}` Orders\n"
        f"💰 ប្រាក់ចំណូលសរុប: `${stats['total_revenue']:.2f}`\n"
        f"🔄 សំណើសុំដូររង់ចាំ: `{stats.get('pending_replacements', 0)}` Requests\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "👇 គ្រប់គ្រង Add Product / Add Stock / Backup តាមប៊ូតុងខាងក្រោម៖"
    )

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("👑 បើក Admin Panel ក្នុង Mini App", web_app=WebAppInfo(url=f"{WEBAPP_URL}#admin"))],
        [InlineKeyboardButton("💾 ទាញយក Database Backup (/backup)", callback_data="cb_admin_backup")]
    ])
    await update.message.reply_text(admin_text, parse_mode="Markdown", reply_markup=kb)

async def backup_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /backup command - Send SQLite Database directly in Telegram for safe keeping."""
    user = update.effective_user
    if not is_admin(user.id):
        await update.message.reply_text("❌ អ្នកគ្មានសិទ្ធិប្រើប្រាស់ Command នេះទេ។")
        return

    if not os.path.exists(DATABASE_PATH):
        await update.message.reply_text(f"❌ មិនអាចស្វែងរក File Database នៅ `{DATABASE_PATH}` ឃើញទេ។")
        return

    try:
        await update.message.reply_text("⏳ កំពុងបង្កើត File Backup សូមរង់ចាំមួយភ្លែត...")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"digital_store_backup_{timestamp}.db"

        with open(DATABASE_PATH, "rb") as db_file:
            await context.bot.send_document(
                chat_id=user.id,
                document=db_file,
                filename=backup_filename,
                caption=(
                    f"📦 **DATABASE BACKUP ជោគជ័យ!**\n"
                    f"📅 កាលបរិច្ឆេទ: `{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}`\n"
                    f"📂 Path: `{DATABASE_PATH}`\n\n"
                    "💡 *សូមរក្សាទុក file នេះលើកុំព្យូទ័រ ដើម្បីសុវត្ថិភាពទិន្នន័យរបស់អ្នក!*"
                ),
                parse_mode="Markdown"
            )
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        await update.message.reply_text(f"❌ បរាជ័យក្នុងការទាញយក Backup៖ {str(e)}")

async def report_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /report command - Send today's live sales digest & low stock alert to Admin."""
    user = update.effective_user
    if not is_admin(user.id):
        await update.message.reply_text("❌ អ្នកគ្មានសិទ្ធិប្រើប្រាស់ Command នេះទេ។")
        return

    digest = await db.get_daily_sales_digest()
    low_stock_str = "គ្មាន"
    if digest.get("low_stock_products"):
        low_stock_str = "\n".join([f"  • {p['name']}: សល់ {p['stock_count']} Accounts" for p in digest["low_stock_products"]])

    msg = (
        f"📊 **របាយការណ៍លក់សង្ខេបប្រចាំថ្ងៃ ({digest['date']})**\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"🛒 Orders ជោគជ័យ៖ `{digest['today_orders']}` Orders\n"
        f"💰 ប្រាក់ចំណូលថ្ងៃនេះ៖ `${digest['today_revenue']:.2f}` USD\n"
        f"👤 អតិថិជនថ្មីថ្ងៃនេះ៖ `{digest['new_users']}` នាក់\n"
        f"⏳ Orders កំពុងរង់ចាំ Approve៖ `{digest['pending_orders']}` Orders\n\n"
        f"⚠️ **ទំនិញសល់ស្តុកទាប (Low Stock)：**\n{low_stock_str}\n\n"
        f"💡 *ចូលមើល Dashboard ពេញលេញតាមប៊ូតុងខាងក្រោម៖*"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("👑 បើក Admin Dashboard", web_app=WebAppInfo(url=f"{WEBAPP_URL}#admin"))]
    ])
    await update.message.reply_text(msg, parse_mode="Markdown", reply_markup=kb)

async def angpao_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /angpao command to create or view Lucky Angpaos."""
    text = (
        "🧧 **LUCKY ANGPAO / RED PACKET**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "អ្នកអាចបង្កើតកញ្ចប់អាំងប៉ាវដើម្បីចែកជូនសមាជិកក្នុងគ្រុប ឬមិត្តភក្តិ!\n\n"
        "👇 ចុចប៊ូតុងខាងក្រោមដើម្បីបង្កើតអាំងប៉ាវក្នុង Mini App៖"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🧧 បង្កើតកញ្ចប់អាំងប៉ាវ (Create Angpao)", web_app=WebAppInfo(url=f"{WEBAPP_URL}#create_angpao"))]
    ])
    await update.message.reply_text(text, parse_mode="Markdown", reply_markup=kb)

# ─── ADMIN PENDING INPUTS ──────────────────────────────────────────────────────
PENDING_ADMIN_INPUTS = {}  # admin_id -> order_id

async def handle_admin_text_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text message from admin when replying with account credentials."""
    user = update.effective_user
    if not user or not is_admin(user.id):
        return

    if user.id in PENDING_ADMIN_INPUTS:
        order_id = PENDING_ADMIN_INPUTS.pop(user.id)
        credentials = update.message.text.strip()
        
        try:
            res = await db.approve_with_custom_credentials(order_id, credentials)
            safe_creds = html.escape(credentials)
            await update.message.reply_text(
                f"✅ <b>បានអនុម័ត Order #{order_id} និងផ្ញើអាខោនទៅអតិថិជនរួចរាល់!</b>\n🔑 Credentials: <code>{safe_creds}</code>",
                parse_mode="HTML"
            )

            # Guaranteed delivery to Customer
            qty = res.get('quantity', 1)
            await send_account_delivery_dm(
                user_id=res['user_id'],
                order_id=order_id,
                product_name=res['product_name'],
                credentials=res['credentials'],
                expiry_date=res['expiry_date'],
                quantity=qty,
                tg_bot=context.bot
            )
            
            # Send Telegram Channel/Group alert!
            asyncio.create_task(send_purchase_alert(res['user_id'], res['product_name'], qty))

        except Exception as err:
            logger.error(f"Error in handle_admin_text_input: {err}")
            await update.message.reply_text(f"❌ កំហុស៖ {str(err)}")

# ─── CALLBACK QUERY HANDLER ────────────────────────────────────────────────────

async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline button callbacks."""
    query = update.callback_query
    await query.answer()
    data = query.data
    user = query.from_user
    user_id = user.id

    # Navigation Callbacks
    if data == "cb_main":
        user_db = await db.get_user(user_id)
        balance = user_db.get("balance", 0.0) if user_db else 0.0
        welcome_text = (
            f"👋 **សួស្តី {user.full_name}!**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "🎉 **សូមស្វាគមន៍មកកាន់ DIGITAL PREMIUM STORE** 💎\n"
            "ហាងផ្គត់ផ្គង់អាខោន Premium លឿន រហ័ស និងមានទំនុកចិត្តខ្ពស់ ១០០%!\n\n"
            f"👤 **ព័ត៌មានរបស់អ្នក៖**\n"
            f"• 🆔 Telegram ID: `{user.id}`\n"
            f"• 💰 សមតុល្យ Balance: `${balance:.2f}`\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "👇 **សូមជ្រើសរើសមុខងារខាងក្រោមដើម្បីបន្ត៖**"
        )
        try:
            await query.edit_message_text(welcome_text, parse_mode="Markdown", reply_markup=get_main_keyboard(user_id))
        except Exception:
            pass
        return

    if data == "cb_wallet":
        user_db = await db.get_user(user_id)
        balance = user_db.get("balance", 0.0) if user_db else 0.0
        wallet_text = (
            "💳 **កាបូបលុយរបស់អ្នក (MY WALLET)**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 **សមតុល្យបច្ចុប្បន្ន៖** `${balance:.2f}`\n\n"
            "💡 *អ្នកអាចប្រើប្រាស់សមតុល្យក្នុងកាបូបលុយដើម្បីទិញទំនិញបានភ្លាមៗ ដោយមិនចាំបាច់ផ្ញើស្លីបផ្ទៀងផ្ទាត់ម្តងទៀតឡើយ!*\n\n"
            "👇 **សូមចុចប៊ូតុងខាងក្រោមដើម្បីបញ្ចូលប្រាក់ (Top-up)៖**"
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("➕ បញ្ចូលប្រាក់ (Top-up Balance)", web_app=WebAppInfo(url=f"{WEBAPP_URL}#wallet"))],
            [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
        ])
        try:
            await query.edit_message_text(wallet_text, parse_mode="Markdown", reply_markup=kb)
        except Exception:
            pass
        return

    if data == "cb_orders":
        orders = await db.get_user_orders(user_id)
        delivered = [o for o in orders if o.get("status") == "delivered"]
        if not delivered:
            text = (
                "📋 **ប្រវត្តិការទិញទំនិញ (MY ORDERS)**\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "❌ អ្នកមិនទាន់មានការបញ្ជាទិញនៅឡើយទេ។\n\n"
                "👇 សូមចុចប៊ូតុងខាងក្រោមដើម្បីជ្រើសរើសទិញទំនិញ Premium៖"
            )
            kb = InlineKeyboardMarkup([
                [InlineKeyboardButton("🛒 ទៅកាន់ហាងទំនិញ (Shop Now)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))],
                [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
            ])
            try:
                await query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)
            except Exception:
                pass
            return

        text = "📋 **អាខោនដែលអ្នកបានទិញរួចរាល់ (DELIVERED ACCOUNTS)**\n━━━━━━━━━━━━━━━━━━━━━\n"
        for idx, ord_item in enumerate(delivered[:5], 1):
            prod_name = ord_item.get("product_name", "Product")
            exp = ord_item.get("expiry_date", "N/A")
            creds = ord_item.get("credentials", "N/A")
            text += (
                f"🔹 **#{idx}. {prod_name}** (Order #{ord_item['id']})\n"
                f"📅 ផុតកំណត់៖ `{exp}`\n"
                f"🔑 គណនី/Key:\n`{creds}`\n\n"
            )

        text += "💡 *ដើម្បីមើលប្រវត្តិទាំងអស់ ឬសុំដូរអាខោន សូមចូលក្នុង Mini App!*"
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("📋 មើលក្នុង Mini App", web_app=WebAppInfo(url=f"{WEBAPP_URL}#orders"))],
            [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
        ])
        try:
            await query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)
        except Exception:
            pass
        return

    if data == "cb_referral":
        bot_info = await context.bot.get_me()
        ref_link = f"https://t.me/{bot_info.username}?start=ref_{user_id}"
        ref_stats = await db.get_user_referral_stats(user_id)
        count = ref_stats.get("referrals_count", 0)
        earned = ref_stats.get("total_earned", 0.0)

        text = (
            "🎁 **ប្រព័ន្ធណែនាំរកប្រាក់ (REFERRAL PROGRAM)**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "ចែករំលែក Link របស់អ្នកទៅកាន់មិត្តភក្តិ ដើម្បីទទួលបានកម្រៃជើងសាររាល់ពេលដែលពួកគេទិញទំនិញ!\n\n"
            f"👥 ចំនួនអ្នកចុះឈ្មោះតាម Link: `{count}` នាក់\n"
            f"💵 ប្រាក់ចំណូលដែលទទួលបាន: `${earned:.2f}`\n\n"
            f"🔗 **Link ណែនាំផ្ទាល់ខ្លួនរបស់អ្នក៖**\n"
            f"`{ref_link}`"
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("📤 ចែករំលែក Link នេះ", url=f"https://t.me/share/url?url={ref_link}&text=ទិញអាខោន Premium តម្លៃសមរម្យនៅទីនេះ!")],
            [InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")]
        ])
        try:
            await query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)
        except Exception:
            pass
        return

    if data == "cb_spin":
        await spin_command(update, context)
        return

    if data == "cb_vip":
        await vip_command(update, context)
        return

    if data == "cb_catalog":
        await catalog_command(update, context)
        return

    if data.startswith("cb_cat_"):
        cat_id = int(data.split("_")[2])
        products = await db.get_products(cat_id)
        categories = await db.get_categories()
        cat_obj = next((c for c in categories if c["id"] == cat_id), None)
        cat_name = cat_obj["name"] if cat_obj else "ទំនិញ"

        text = (
            f"📦 **បញ្ជីទំនិញ៖ {cat_name}**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "👇 សូមជ្រើសរើសទំនិញដើម្បីមើលព័ត៌មានលម្អិត និងទិញភ្លាមៗ៖"
        )
        kb_rows = []
        for p in products:
            stock_dot = "🟢" if p["stock_count"] > 0 else "🔴 (អស់ស្តុក)"
            btn_txt = f"{p['name']} - ${p['price']:.2f} {stock_dot}"
            kb_rows.append([InlineKeyboardButton(btn_txt, callback_data=f"cb_prod_{p['id']}")])
        
        kb_rows.append([InlineKeyboardButton("🔙 ថយទៅ Categories", callback_data="cb_catalog")])
        kb_rows.append([InlineKeyboardButton("✨ បើក Mini App", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))])
        try:
            await query.edit_message_text(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb_rows))
        except Exception:
            pass
        return

    if data.startswith("cb_prod_"):
        prod_id = int(data.split("_")[2])
        p = await db.get_product(prod_id)
        if not p:
            await query.answer("❌ មិនមានទំនិញនេះទេ!", show_alert=True)
            return
        
        stock_status = f"🟢 មានស្តុក ({p['stock_count']} Accounts)" if p['stock_count'] > 0 else "🔴 អស់ស្តុកបណ្តោះអាសន្ន"
        user_db = await db.get_user(user_id)
        balance = user_db.get("balance", 0.0) if user_db else 0.0

        text = (
            f"💎 **{p['name']}**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"📝 **ព័ត៌មាន:** {p.get('description', 'Shared Account Premium')}\n"
            f"💰 **តម្លៃ:** `${p['price']:.2f}`\n"
            f"⏳ **រយៈពេល:** `{p.get('duration_days', 30)} ថ្ងៃ`\n"
            f"📦 **ស្តុក:** {stock_status}\n"
            f"💳 **កាបូបរបស់អ្នក:** `${balance:.2f}`\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "🛡️ *ធានា 100% ពេញរយៈពេលកំណត់!*"
        )
        kb_rows = []
        if p['stock_count'] > 0:
            if balance >= p['price']:
                kb_rows.append([InlineKeyboardButton(f"⚡ ទិញភ្លាមៗ (${p['price']:.2f}) តាម Wallet", callback_data=f"cb_buy_wallet_{p['id']}")])
            else:
                kb_rows.append([InlineKeyboardButton("➕ បញ្ចូលប្រាក់ Wallet ដើម្បីទិញ", web_app=WebAppInfo(url=f"{WEBAPP_URL}#wallet"))])
        
        kb_rows.append([InlineKeyboardButton("🛒 បើកទិញក្នុង Mini App (QR Code / Bank)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))])
        if p.get('category_id'):
            kb_rows.append([InlineKeyboardButton("🔙 ថយក្រោយ", callback_data=f"cb_cat_{p['category_id']}")])
        else:
            kb_rows.append([InlineKeyboardButton("🔙 ថយទៅ Categories", callback_data="cb_catalog")])

        try:
            await query.edit_message_text(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb_rows))
        except Exception:
            pass
        return

    if data.startswith("cb_buy_wallet_"):
        prod_id = int(data.split("_")[3])
        user_db = await db.get_user(user_id)
        prod = await db.get_product(prod_id)
        if not prod:
            await query.answer("❌ មិនមានទំនិញនេះទេ!", show_alert=True)
            return

        if prod['stock_count'] <= 0:
            await query.answer("❌ សោកស្តាយ ទំនិញនេះអស់ស្តុកហើយ!", show_alert=True)
            return

        if (user_db.get("balance", 0.0)) < prod['price']:
            await query.answer("❌ ប្រាក់ក្នុង Wallet មិនគ្រប់គ្រាន់ទេ!", show_alert=True)
            return

        # Deduct wallet balance
        await db.update_user_balance(user_id, -prod['price'], 'purchase', f"Purchased {prod['name']}")

        # Create and approve order
        order_id = await db.create_order(
            user_id=user_id,
            product_id=prod['id'],
            product_name=prod['name'],
            price=prod['price'],
            payment_method="Wallet Balance 💳 (In-Chat)",
            proof_file="WALLET_IN_CHAT"
        )
        res = await db.approve_and_deliver_order(order_id)

        # 5% Referral Bonus
        if user_db.get('referred_by'):
            bonus = round(prod['price'] * 0.05, 2)
            if bonus > 0:
                await db.update_user_balance(user_db['referred_by'], bonus, 'referral_bonus', f"5% Referral Cashback")
                try:
                    await context.bot.send_message(
                        chat_id=user_db['referred_by'],
                        text=f"🎁 **ទទួលបាន Bonus ណែនាំមិត្តភក្តិ!**\nមិត្តភក្តិរបស់អ្នកទើបតែទិញ {prod['name']}! អ្នកទទួលបាន `${bonus:.2f}` ចូលក្នុង Wallet!",
                        parse_mode="Markdown"
                    )
                except Exception:
                    pass

        safe_title = html.escape(str(res.get('product_name', 'Product')))
        safe_creds = html.escape(str(res.get('credentials', '')))
        safe_exp = html.escape(str(res.get('expiry_date', '30 ថ្ងៃ')))
        gemini_guide = ""
        raw_pname = str(res.get('product_name', ''))
        raw_creds = str(res.get('credentials', ''))
        if "gemini" in raw_pname.lower() or "gemini" in raw_creds.lower() or "activate" in raw_creds.lower() or "http" in raw_creds.lower():
            gemini_guide = (
                f"\n\n📖 <b>របៀបប្រើប្រាស់ភ្ជាប់អាខោន (ច្បាប់ / ការណែនាំ)៖</b>\n"
                f"🔗 បើក Link ដែលអ្នកបានទទួលក្នុង Browser\n"
                f"✅ ចុច Activate ដើម្បីបើកដំណើរការ\n"
                f"🎉 រួចរាល់ អាចប្រើប្រាស់ Gemini Pro បានភ្លាមៗ\n\n"
                f"📌 <b>ចំណាំ៖</b> <i>Link មួយអាចប្រើបានសម្រាប់ Gmail តែមួយប៉ុណ្ណោះ</i>"
            )

        success_text = (
            f"🎉 <b>ទូទាត់ប្រាក់ជោគជ័យ (Order #{order_id})!</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━</code>\n"
            f"📦 ទំនិញ: <b>{safe_title}</b>\n"
            f"📅 ថ្ងៃផុតកំណត់: <code>{safe_exp}</code>\n\n"
            f"🔑 <b>អាខោនរបស់អ្នក៖</b>\n"
            f"<code>{safe_creds}</code>"
            f"{gemini_guide}\n\n"
            f"💡 <i>សូមរក្សាទុកអាខោននេះឱ្យបានល្អ ឬបើកមើលក្នុង Mini App គ្រប់ពេល!</i>"
        )
        
        import re
        url_match = re.search(r'https?://[^\s<>"\'\)]+', raw_creds)
        activation_url = url_match.group(0) if url_match else None

        kb_rows = []
        if activation_url:
            kb_rows.append([InlineKeyboardButton("🔗 បើក Link ភ្ជាប់ Gemini Pro", url=activation_url)])
        kb_rows.append([InlineKeyboardButton("📋 មើលក្នុង Mini App", web_app=WebAppInfo(url=f"{WEBAPP_URL}#orders"))])
        kb_rows.append([InlineKeyboardButton("🔙 ត្រឡប់ទៅ Menu ដើម", callback_data="cb_main")])
        kb = InlineKeyboardMarkup(kb_rows)
        try:
            await query.edit_message_text(success_text, parse_mode="HTML", reply_markup=kb)
        except Exception:
            try:
                await query.edit_message_text(success_text, reply_markup=kb)
            except Exception:
                pass

        # Trigger Public Channel Purchase Alert
        asyncio.create_task(send_purchase_alert(user_id, res['product_name'], qty))
        return

    if data.startswith("rate_"):
        # Format: rate_{order_id}_{product_id}_{stars}
        parts = data.split("_")
        if len(parts) >= 4:
            try:
                order_id = int(parts[1])
                product_id = int(parts[2])
                stars = int(parts[3])
                
                review_res = await db.save_customer_rating(
                    order_id=order_id,
                    product_id=product_id,
                    user_id=user_id,
                    full_name=user.full_name or "Customer",
                    username=user.username,
                    rating=stars,
                    comment=""
                )
                
                star_emojis = "⭐️" * stars
                new_bal = review_res.get("new_balance", 0.0)
                win_bonus = review_res.get("win_bonus", 0.05)
                
                thank_msg = (
                    f"🎉 <b>អរគុណច្រើនសម្រាប់ការផ្ដល់ពិន្ទុ {star_emojis} ({stars}/5 ផ្កាយ)!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🎁 លោកអ្នកទទួលបានរង្វាន់លើកទឹកចិត្ត៖ <b>+${win_bonus:.2f} USD</b> ចូល Wallet!\n"
                    f"💰 សមតុល្យ Wallet ថ្មី៖ <code>${new_bal:.2f} USD</code>\n\n"
                    f"💖 <i>ការគាំទ្រ និងមតិយោបល់របស់លោកអ្នក ជួយឱ្យយើងខ្ញុំកែលម្អសេវាកម្មកាន់តែល្អឥតខ្ចោះ!</i>"
                )
                
                kb = InlineKeyboardMarkup([
                    [InlineKeyboardButton("🛍️ បើកហាងទំនិញ (Open Shop)", web_app=WebAppInfo(url=f"{WEBAPP_URL}"))]
                ])
                
                await query.edit_message_text(thank_msg, parse_mode="HTML", reply_markup=kb)
                await query.answer(f"⭐️ បានផ្ដល់ពិន្ទុ {stars} ផ្កាយ & ទទួលបាន +${win_bonus:.2f} USD!", show_alert=True)
            except Exception as err:
                logger.error(f"Error handling rate callback: {err}")
                await query.answer("✅ បានកត់ត្រាការវាយតម្លៃរបស់អ្នករួចរាល់!", show_alert=False)
            return

    if data == "cb_help":
        aba = PAYMENT_INFO.get("ABA", {})
        acleda = PAYMENT_INFO.get("ACLEDA", {})
        usdt = PAYMENT_INFO.get("USDT", {})
        help_text = (
            "📞 **សេវាបម្រើអតិថិជន & ជំនួយ (SUPPORT)**\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "ប្រសិនបើអ្នកជួបបញ្ហាលើការទូទាត់ ឬអាខោន សូមទាក់ទងមកកាន់យើងខ្ញុំ៖\n\n"
            "📢 **Official Channel:** @smarttech_digital (https://t.me/smarttech_digital)\n"
            "👥 **Official Group:** @smarttech_digitals (https://t.me/smarttech_digitals)\n\n"
            "💳 **គណនីទូទាត់ប្រាក់ផ្លូវការ៖**\n"
            f"• 🔵 ABA: `{aba.get('number', '000 123 456')}` ({aba.get('name', 'DIGITAL STORE')})\n"
            f"• 🟢 ACLEDA: `{acleda.get('number', '012345678')}`\n"
            f"• 🟣 USDT (TRC20): `{usdt.get('address', 'TRC20_ADDRESS')}`\n\n"
            "🛡️ **គោលការណ៍ធានា (Warranty):**\n"
            "ធានាជូនពេញរយៈពេលកំណត់ បើមានបញ្ហាអាចស្នើសុំដូរថ្មីតាមប្រព័ន្ធស្វ័យប្រវត្តិក្នុង Mini App!"
        )
        try:
            await query.edit_message_text(help_text, parse_mode="Markdown", reply_markup=get_back_keyboard())
        except Exception:
            pass
        return

    if data == "cb_admin_backup":
        if not is_admin(user_id):
            return
        if not os.path.exists(DATABASE_PATH):
            await query.message.reply_text(f"❌ មិនអាចស្វែងរក File Database នៅ `{DATABASE_PATH}` ឃើញទេ។")
            return
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"digital_store_backup_{timestamp}.db"
            with open(DATABASE_PATH, "rb") as db_file:
                await context.bot.send_document(
                    chat_id=user_id,
                    document=db_file,
                    filename=backup_filename,
                    caption=(
                        f"📦 **DATABASE BACKUP ជោគជ័យ!**\n"
                        f"📅 កាលបរិច្ឆេទ: `{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}`\n"
                        f"📂 Path: `{DATABASE_PATH}`"
                    ),
                    parse_mode="Markdown"
                )
        except Exception as e:
            await query.message.reply_text(f"❌ បរាជ័យក្នុងការ Backup៖ {str(e)}")
        return

    # Admin Order Approvals
    if not is_admin(user_id):
        try:
            await query.edit_message_caption(caption=query.message.caption + "\n\n❌ អ្នកគ្មានសិទ្ធិ អនុម័តទេ!")
        except Exception:
            pass
        return

    # Admin Top-Up Approvals
    if data.startswith("approve_topup_"):
        topup_id = int(data.split("_")[2])
        res = await db.approve_topup_request(topup_id)
        if res.get("status") == "success":
            topup_data = res["data"]
            try:
                await query.edit_message_caption(
                    caption=f"{query.message.caption}\n\n✅ <b>APPROVED BY ADMIN (+${topup_data['amount']:.2f} USD)</b>",
                    parse_mode="HTML"
                )
                # Send confirmation DM to user
                msg = (
                    f"🎉 <b>ការបញ្ចូលប្រាក់របស់អ្នកត្រូវបានអនុម័ត! (Top-Up Approved)</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"💰 ទឹកប្រាក់បានបញ្ចូល៖ <b>+${topup_data['amount']:.2f} USD</b>\n"
                    f"💳 សមតុល្យ Wallet បច្ចុប្បន្ន៖ <b>${topup_data['new_balance']:.2f} USD</b>\n\n"
                    f"✨ <i>ឥឡូវនេះលោកអ្នកអាចទិញទំនិញបានភ្លាមៗ 1-Second Auto Delivery!</i>"
                )
                await context.bot.send_message(chat_id=topup_data["user_id"], text=msg, parse_mode="HTML", reply_markup=get_main_keyboard(topup_data["user_id"]))
            except Exception as e:
                logger.error(f"Failed to send topup approval callback DM: {e}")
        else:
            await query.message.reply_text(f"❌ {res.get('message')}")
        return

    elif data.startswith("reject_topup_"):
        topup_id = int(data.split("_")[2])
        res = await db.reject_topup_request(topup_id, "Slip មិនត្រឹមត្រូវ")
        if res.get("status") == "success":
            topup_data = res["data"]
            try:
                await query.edit_message_caption(
                    caption=f"{query.message.caption}\n\n❌ <b>REJECTED BY ADMIN</b>",
                    parse_mode="HTML"
                )
                msg = (
                    f"❌ <b>ការបញ្ចូលប្រាក់មិនទទួលបានជោគជ័យ (Top-Up Rejected)</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"💰 ទឹកប្រាក់៖ <b>${topup_data['amount']:.2f} USD</b>\n"
                    f"📝 មូលហេតុ៖ <i>{topup_data['admin_note']}</i>"
                )
                await context.bot.send_message(chat_id=topup_data["user_id"], text=msg, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Failed to send topup reject callback DM: {e}")
        return

    if data.startswith("inputapprove_"):
        order_id = int(data.split("_")[1])
        PENDING_ADMIN_INPUTS[user_id] = order_id
        await query.message.reply_text(
            f"📝 **សូមផ្ញើសារ (Reply) ជាមួយ Email | Password សម្រាប់ Order #{order_id}៖**\n\n"
            f"ឧទាហរណ៍៖\n`myaccount@gmail.com | Pass1234! | Profile 1 (PIN: 1122)`",
            parse_mode="Markdown"
        )

    elif data.startswith("approve_"):
        order_id = int(data.split("_")[1])
        try:
            res = await db.approve_and_deliver_order(order_id)
            await query.edit_message_caption(
                caption=f"{query.message.caption}\n\n✅ <b>APPROVED & DELIVERED BY ADMIN</b>\n🔑 Credentials Sent to User!",
                parse_mode="HTML"
            )
            qty = res.get('quantity', 1)
            await send_account_delivery_dm(
                user_id=res['user_id'],
                order_id=order_id,
                product_name=res['product_name'],
                credentials=res['credentials'],
                expiry_date=res['expiry_date'],
                quantity=qty,
                tg_bot=context.bot
            )
            
            # Send Telegram Channel/Group alert!
            asyncio.create_task(send_purchase_alert(res['user_id'], res['product_name'], qty))

        except Exception as err:
            logger.error(f"Error in approve_ callback: {err}")
            await query.message.reply_text(f"❌ កំហុស៖ {str(err)}")

    elif data.startswith("reject_"):
        order_id = int(data.split("_")[1])
        await db.reject_order(order_id, "Admin rejected slip")
        order = await db.get_order(order_id)
        await query.edit_message_caption(
            caption=f"{query.message.caption}\n\n❌ <b>REJECTED BY ADMIN</b>",
            parse_mode="HTML"
        )
        if order:
            try:
                rej_msg = f"❌ <b>Order #{order_id} ត្រូវបានបដិសេធ!</b>\nមូលហេតុ៖ វិក្កយបត្រ មិនត្រឹមត្រូវ ឬ មិនទាន់ទទួលបានប្រាក់។"
                try:
                    await context.bot.send_message(
                        chat_id=order['user_id'],
                        text=rej_msg,
                        parse_mode="HTML"
                    )
                except Exception:
                    await asyncio.to_thread(send_one_alert, order['user_id'], rej_msg)
            except Exception as e:
                logger.error(f"Failed to notify rejected user: {e}")

    elif data.startswith("approvereplace_"):
        req_id = int(data.split("_")[1])
        req = await db.get_replacement_request(req_id)
        if not req:
            await query.message.reply_text("❌ Request not found")
            return
        
        products = await db.get_products()
        matching_prod = next((p for p in products if p['name'].lower() in req['product_name'].lower() or req['product_name'].lower() in p['name'].lower()), None)
        prod_id = matching_prod['id'] if matching_prod else (products[0]['id'] if products else 1)

        stock = await db.get_available_stock(prod_id)
        if not stock:
            await query.message.reply_text(f"❌ គ្មានស្តុកអាខោនស្វ័យប្រវត្តសម្រាប់ {req['product_name']} ទេ! សូមបញ្ចូល Stock អាខោនជាមុនសិន។")
            return

        res = await db.approve_replacement_request(req_id, stock['credentials'])
        await query.edit_message_caption(
            caption=f"{query.message.caption}\n\n✅ <b>APPROVED & DELIVERED NEW ACCOUNT!</b>",
            parse_mode="HTML"
        )

        try:
            safe_prod = html.escape(str(req.get('product_name', 'Product')))
            safe_stock = html.escape(str(stock.get('credentials', '')))
            msg = (
                f"🎉 <b>សំណើសុំដូរអាខោន (Request #{req_id}) ត្រូវបានអនុម័ត!</b>\n"
                f"<code>━━━━━━━━━━━━━━━━━━━</code>\n"
                f"📦 ទំនិញ: <b>{safe_prod}</b>\n\n"
                f"🔑 <b>អាខោនថ្មីរបស់អ្នក៖</b>\n"
                f"<code>{safe_stock}</code>\n\n"
                f"💡 <i>សូមរក្សាទុកអាខោនថ្មីនេះ ឬបើកមើលក្នុង Mini App ផ្នែក 'សុំដូរអាខោន'!</i>"
            )
            try:
                await context.bot.send_message(chat_id=req['user_id'], text=msg, parse_mode="HTML")
            except Exception:
                await asyncio.to_thread(send_one_alert, req['user_id'], msg)
        except Exception as e:
            logger.error(f"Failed to notify replacement user: {e}")

    elif data.startswith("rejectreplace_"):
        req_id = int(data.split("_")[1])
        await db.reject_replacement_request(req_id, "Warranty conditions not met")
        req = await db.get_replacement_request(req_id)
        await query.edit_message_caption(
            caption=f"{query.message.caption}\n\n❌ <b>REPLACEMENT REJECTED BY ADMIN</b>",
            parse_mode="HTML"
        )
        if req:
            try:
                rej_msg = f"❌ <b>សំណើសុំដូរអាខោន #{req_id} ត្រូវបានបដិសេធ!</b>\nសូមទាក់ទង Admin ប្រសិនបើមានចម្ងល់។"
                try:
                    await context.bot.send_message(
                        chat_id=req['user_id'],
                        text=rej_msg,
                        parse_mode="HTML"
                    )
                except Exception:
                    await asyncio.to_thread(send_one_alert, req['user_id'], rej_msg)
            except Exception as e:
                logger.error(f"Failed to notify rejected replacement: {e}")

# ─── Alert / Notification Engine ──────────────────────────────────────────────

async def broadcast_alert_to_all_users(bot, title: str, message: str, image_url: str = None, product_id: int = None):
    """Send broadcast alert to all registered users with direct shop link button."""
    users = await db.get_all_users()
    sent_count = 0
    
    alert_text = (
        f"📢 **{title}**\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"{message}\n\n"
        f"👇 ចុចប៊ូតុងខាងក្រោមដើម្បីចូលមើល និងទិញក្នុង Mini App ភ្លាមៗ!"
    )
    
    shop_url = f"{WEBAPP_URL}#product_{product_id}" if product_id else WEBAPP_URL
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🛒 មើលទំនិញ (View Product)", web_app=WebAppInfo(url=shop_url))]
    ])

    for u in users:
        try:
            if image_url:
                await bot.send_photo(
                    chat_id=u['user_id'],
                    photo=image_url,
                    caption=alert_text,
                    parse_mode="Markdown",
                    reply_markup=kb
                )
            else:
                await bot.send_message(
                    chat_id=u['user_id'],
                    text=alert_text,
                    parse_mode="Markdown",
                    reply_markup=kb
                )
            sent_count += 1
            await asyncio.sleep(0.05)  # Prevent hitting rate limits
        except Exception as e:
            logger.warning(f"Could not send alert to {u['user_id']}: {e}")

    await db.record_broadcast_alert(title, message, product_id, sent_count)
    return sent_count

async def send_daily_expiry_reminders(bot):
    """Find accounts expiring in 3 days and send automated Telegram Bot reminders to users."""
    expiring_accounts = await db.get_expiring_accounts(days_left=3)
    sent = 0
    for acc in expiring_accounts:
        try:
            msg = (
                f"⏰ **រំលឹកអាខោនជិតផុតកំណត់ ( Expiry Reminder )**\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n"
                f"👤 ជំរាបសួរ **{acc['full_name']}**,\n"
                f"📦 អាខោន **{acc['product_name']}** របស់អ្នកនឹងផុតកំណត់នៅថ្ងៃទី `{acc['expiry_date']}` ( ក្នុងរយៈពេល ៣ ថ្ងៃទៀត )។\n\n"
                f"💡 សូមចុចប៊ូតុងខាងក្រោមដើម្បីចូលទិញ Renew បន្ត ដើម្បីកុំឱ្យដាច់សេវាកម្ម!"
            )
            kb = InlineKeyboardMarkup([
                [InlineKeyboardButton("🛒 ទិញ Renew អាខោនបន្ត", web_app=WebAppInfo(url=WEBAPP_URL))]
            ])
            await bot.send_message(chat_id=acc['user_id'], text=msg, parse_mode="Markdown", reply_markup=kb)
            sent += 1
            await asyncio.sleep(0.05)
        except Exception as e:
            logger.warning(f"Could not send expiry reminder to {acc['user_id']}: {e}")
    return sent

# ─── BOT APPLICATION INITIALIZATION ───────────────────────────────────────────

async def post_init(application: Application):
    """Auto-register bot commands on startup for Telegram Menu button."""
    try:
        commands = [
            BotCommand("start", "🏠 ផ្ដើមដំណើរការ (Main Menu)"),
            BotCommand("shop", "🛒 បើកហាងទំនិញ (Open Shop)"),
            BotCommand("giveaway", "🎁 ចែកអាខោន Free (Free Accounts)"),
            BotCommand("free", "🎁 ទទួលយក Account Free"),
            BotCommand("catalog", "🛍️ មើលទំនិញក្នុង Chat (In-Chat Store)"),
            BotCommand("vip", "💎 កម្រិត VIP (Loyalty Perks)"),
            BotCommand("angpao", "🧧 ចែកអាំងប៉ាវ (Lucky Angpao)"),
            BotCommand("wallet", "💳 កាបូបលុយ & បញ្ចូលប្រាក់ (Wallet)"),
            BotCommand("myorders", "📋 ប្រវត្តិការទិញ (My Orders)"),
            BotCommand("referral", "🎁 កូដណែនាំរកប្រាក់ (Referral)"),
            BotCommand("help", "📞 ជំនួយ & ទំនាក់ទំនង (Support)"),
            BotCommand("admin", "👑 Admin Dashboard (Admin Only)"),
            BotCommand("report", "📊 របាយការណ៍លក់ប្រចាំថ្ងៃ (Admin Only)"),
            BotCommand("backup", "💾 ទាញយក Database (Admin Only)"),
        ]
        await application.bot.set_my_commands(commands)
        logger.info("Telegram Bot menu commands registered successfully.")
    except Exception as e:
        logger.warning(f"Failed to set bot commands: {e}")

def setup_bot_application() -> Optional[Application]:
    """Setup and return Application instance."""
    if not BOT_TOKEN or BOT_TOKEN == "your_bot_token_here":
        logger.warning("BOT_TOKEN is not configured in .env")
        return None
    app = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("shop", shop_command))
    app.add_handler(CommandHandler("giveaway", giveaway_command))
    app.add_handler(CommandHandler("free", giveaway_command))
    app.add_handler(CommandHandler("catalog", catalog_command))
    app.add_handler(CommandHandler("vip", vip_command))
    app.add_handler(CommandHandler("profile", vip_command))
    app.add_handler(CommandHandler("angpao", angpao_command))
    app.add_handler(CommandHandler("wallet", wallet_command))
    app.add_handler(CommandHandler("myorders", myorders_command))
    app.add_handler(CommandHandler("orders", myorders_command))
    app.add_handler(CommandHandler("referral", referral_command))
    app.add_handler(CommandHandler("ref", referral_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("support", help_command))
    app.add_handler(CommandHandler("admin", admin_command))
    app.add_handler(CommandHandler("report", report_command))
    app.add_handler(CommandHandler("backup", backup_command))
    app.add_handler(CallbackQueryHandler(handle_callback_query))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_admin_text_input))
    return app
