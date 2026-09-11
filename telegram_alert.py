import os
import json
import html
import asyncio
import logging
import requests
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

load_dotenv(override=True)

try:
    from database import get_all_user_ids, get_targeted_user_ids
except Exception:
    get_all_user_ids = None
    get_targeted_user_ids = None

try:
    from config import BOT_TOKEN as CONFIG_BOT_TOKEN
except Exception:
    CONFIG_BOT_TOKEN = ""

logger = logging.getLogger(__name__)


def get_bot_token() -> str:
    load_dotenv(override=True)
    return (os.getenv("BOT_TOKEN") or CONFIG_BOT_TOKEN or "").strip()


def get_mini_app_link() -> str:
    load_dotenv(override=True)
    custom_link = (os.getenv("MINI_APP_LINK") or "").strip()
    if custom_link:
        return custom_link
    bot_uname = (os.getenv("BOT_USERNAME") or "digitalappstore_bot").lstrip("@").strip()
    return f"https://t.me/{bot_uname}?startapp=shop"


def get_configured_alert_targets() -> List[str]:
    """Retrieve unique, validated channel and group targets from environment."""
    load_dotenv(override=True)
    ch = (os.getenv("ALERT_CHANNEL") or "@smarttech_digital").strip()
    gp = (os.getenv("ALERT_GROUP") or "@smarttech_digitals").strip()

    targets = []
    for raw in [ch, gp]:
        if not raw:
            continue
        cleaned = raw.strip()
        # If username without @ and not a negative ID or numeric
        if not cleaned.startswith("@") and not cleaned.startswith("-") and not cleaned.isdigit():
            cleaned = f"@{cleaned}"
        if cleaned not in targets:
            targets.append(cleaned)
    return targets


# ─────────────────────────────────────────────
# Helper: Format Clean Telegram Message
# ─────────────────────────────────────────────

def format_broadcast_html(title: str, message: str, footer_text: Optional[str] = None) -> str:
    """Format clean, elegant HTML announcement for Telegram."""
    clean_title = (title or "").strip()
    clean_msg = (message or "").strip()
    
    if clean_title:
        title_line = f"📢 <b>{clean_title}</b>"
    else:
        title_line = "📢 <b>ដំណឹងពិសេស | ANNOUNCEMENT</b>"
        
    divider = "━━━━━━━━━━━━━━━━━━━"
    
    parts = [
        title_line,
        f"<code>{divider}</code>\n",
        clean_msg,
        f"\n<code>{divider}</code>"
    ]
    
    if footer_text:
        parts.append(f"👉 <i>{footer_text}</i>")
    else:
        parts.append("👉 <i>សូមចុចប៊ូតុងខាងក្រោមដើម្បីចូលមើល និងបញ្ជាទិញ៖</i>")
        
    return "\n".join(parts)


def strip_html_tags(text: str) -> str:
    """Fallback utility to strip HTML tags if Telegram HTML parser complains."""
    import re
    clean = re.compile("<.*?>")
    return re.sub(clean, "", text)


# ─────────────────────────────────────────────
# Send one Telegram alert (Text)
# ─────────────────────────────────────────────

def send_one_alert(chat_id, message: str, keyboard: Optional[Dict[str, Any]] = None) -> bool:
    token = get_bot_token()
    if not token or not chat_id:
        logger.warning(f"send_one_alert skipped: token={bool(token)}, chat_id={chat_id}")
        return False

    target_chat = str(chat_id).strip()
    if not target_chat.startswith("@") and not target_chat.startswith("-") and not target_chat.isdigit():
        target_chat = f"@{target_chat}"

    api_url = f"https://api.telegram.org/bot{token}/sendMessage"

    payload = {
        "chat_id": target_chat,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": False
    }
    if keyboard:
        payload["reply_markup"] = keyboard

    try:
        response = requests.post(api_url, json=payload, timeout=15)
        if response.ok:
            return True

        # Fallback to plain text if HTML parsing failed
        resp_text = response.text.lower()
        if "parse" in resp_text or "entity" in resp_text or "tag" in resp_text or "bad request" in resp_text:
            payload["text"] = strip_html_tags(message)
            payload.pop("parse_mode", None)
            retry_res = requests.post(api_url, json=payload, timeout=15)
            if retry_res.ok:
                return True

        # Handle rate limiting 429
        if response.status_code == 429:
            import time
            time.sleep(1.0)
            retry_res = requests.post(api_url, json=payload, timeout=15)
            if retry_res.ok:
                return True

        logger.warning(f"Failed alert to {target_chat}: {response.status_code} {response.text}")
        return False

    except Exception as error:
        logger.error(f"Telegram send error {target_chat}: {error}")
        return False


# ─────────────────────────────────────────────
# Send one Telegram alert (Photo + Caption)
# ─────────────────────────────────────────────

def send_one_photo_alert(chat_id, photo_url_or_file, caption: str, keyboard: Optional[Dict[str, Any]] = None) -> bool:
    token = get_bot_token()
    if not token or not chat_id:
        return False

    target_chat = str(chat_id).strip()
    if not target_chat.startswith("@") and not target_chat.startswith("-") and not target_chat.isdigit():
        target_chat = f"@{target_chat}"

    api_url = f"https://api.telegram.org/bot{token}/sendPhoto"
    reply_markup_val = json.dumps(keyboard) if isinstance(keyboard, dict) else keyboard

    try:
        if photo_url_or_file and os.path.exists(str(photo_url_or_file)):
            with open(photo_url_or_file, "rb") as f:
                data = {
                    "chat_id": target_chat,
                    "caption": caption,
                    "parse_mode": "HTML"
                }
                if reply_markup_val:
                    data["reply_markup"] = reply_markup_val
                
                res = requests.post(
                    api_url,
                    data=data,
                    files={"photo": f},
                    timeout=20
                )
        elif photo_url_or_file and str(photo_url_or_file).startswith("http"):
            payload = {
                "chat_id": target_chat,
                "photo": str(photo_url_or_file).strip(),
                "caption": caption,
                "parse_mode": "HTML"
            }
            if keyboard:
                payload["reply_markup"] = keyboard
                
            res = requests.post(api_url, json=payload, timeout=20)
        else:
            return send_one_alert(target_chat, caption, keyboard)

        if res.ok:
            return True

        # If caption HTML entity error, retry with stripped plain text caption
        resp_text = res.text.lower()
        if "parse" in resp_text or "entity" in resp_text or "tag" in resp_text:
            plain_caption = strip_html_tags(caption)
            if photo_url_or_file and os.path.exists(str(photo_url_or_file)):
                with open(photo_url_or_file, "rb") as f:
                    data = {"chat_id": target_chat, "caption": plain_caption}
                    if reply_markup_val:
                        data["reply_markup"] = reply_markup_val
                    retry_res = requests.post(api_url, data=data, files={"photo": f}, timeout=20)
                    if retry_res.ok:
                        return True
            elif photo_url_or_file and str(photo_url_or_file).startswith("http"):
                retry_res = requests.post(api_url, json={
                    "chat_id": target_chat,
                    "photo": str(photo_url_or_file).strip(),
                    "caption": plain_caption,
                    "reply_markup": keyboard
                }, timeout=20)
                if retry_res.ok:
                    return True

        logger.warning(f"Photo alert failed for {target_chat}: {res.status_code} {res.text}, falling back to text")
        return send_one_alert(target_chat, caption, keyboard)

    except Exception as e:
        logger.error(f"Error in photo alert for {target_chat}: {e}, trying text fallback")
        return send_one_alert(target_chat, caption, keyboard)


# ─────────────────────────────────────────────
# BROADCAST DISPATCHER (Channel + Targeted Users)
# ─────────────────────────────────────────────

async def send_telegram_alert(
    message: str,
    photo_url_or_file: Optional[str] = None,
    target_group: str = "all",
    send_to_channel: Optional[bool] = None,
    send_to_users: Optional[bool] = None,
    button_text: Optional[str] = None,
    button_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Broadcasts message to Telegram Channel/Group and/or direct to Telegram Users.
    """
    target = (target_group or "all").lower().strip()
    
    if send_to_channel is None:
        send_to_channel = target in ("all", "channel", "channel_only")
    if send_to_users is None:
        send_to_users = target != "channel_only"

    # Inline Keyboard Button
    btn_text = (button_text or "").strip() or "🛒 បើកកម្មវិធីទិញឥឡូវនេះ (Open App)"
    btn_url = (button_url or "").strip() or get_mini_app_link()

    keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": btn_text,
                    "url": btn_url
                }
            ]
        ]
    }

    # Resolve local photo path
    resolved_photo = photo_url_or_file
    if resolved_photo and isinstance(resolved_photo, str):
        resolved_str = resolved_photo.strip()
        if resolved_str.startswith("/uploads/"):
            data_path = os.path.join("data", resolved_str.lstrip("/"))
            if os.path.exists(data_path):
                resolved_photo = data_path
            elif os.path.exists(resolved_str.lstrip("/")):
                resolved_photo = resolved_str.lstrip("/")
        elif not resolved_str.startswith("http") and os.path.exists(resolved_str):
            resolved_photo = resolved_str

    def _dispatch(target_id):
        if resolved_photo:
            return send_one_photo_alert(target_id, resolved_photo, message, keyboard)
        else:
            return send_one_alert(target_id, message, keyboard)

    channel_success = False

    # 1. CHANNEL / GROUP BROADCAST
    if send_to_channel:
        channel_targets = get_configured_alert_targets()
        for ch_target in channel_targets:
            try:
                ok = await asyncio.to_thread(_dispatch, ch_target)
                if ok:
                    channel_success = True
                logger.info(f"📢 Broadcast to ({ch_target}): {'SUCCESS' if ok else 'FAILED'}")
            except Exception as ex:
                logger.error(f"Error broadcasting to {ch_target}: {ex}")

    # 2. TARGETED USERS BROADCAST
    sent = 0
    failed = 0
    user_ids = []

    if send_to_users and get_targeted_user_ids:
        try:
            raw_ids = await get_targeted_user_ids(target)
            seen = set()
            user_ids = []
            for u in raw_ids:
                if u and u not in seen:
                    seen.add(u)
                    user_ids.append(u)
                    
            logger.info(f"👤 Total distinct users to alert for '{target}': {len(user_ids)}")
        except Exception as error:
            logger.error(f"❌ Error querying users for alert: {error}")
            user_ids = []

        for uid in user_ids:
            try:
                ok = await asyncio.to_thread(_dispatch, uid)
                if ok:
                    sent += 1
                else:
                    failed += 1
            except Exception as e:
                logger.error(f"Failed to dispatch alert to user {uid}: {e}")
                failed += 1

            await asyncio.sleep(0.035)

    total_reach = sent + (1 if channel_success else 0)

    return {
        "status": "success",
        "target_group": target,
        "channel_sent": channel_success,
        "group_sent": channel_success,
        "users_sent": sent,
        "users_failed": failed,
        "total_targets": len(user_ids),
        "total_reach": total_reach,
        "photo_used": bool(resolved_photo)
    }


# ─────────────────────────────────────────────
# Send Telegram alert for purchase success
# ─────────────────────────────────────────────

async def send_purchase_alert(user_id: int, product_name: str, quantity: int = 1):
    """Notify public Telegram channel/group of new verified order purchase."""
    load_dotenv(override=True)
    try:
        import database as db
        u_info = await db.get_user(user_id)
    except Exception:
        u_info = None

    cust_name = "អតិថិជន VIP 💎"
    if u_info:
        cust_name = u_info.get("full_name") or (f"@{u_info.get('username')}" if u_info.get("username") else f"អតិថិជន #{user_id}")

    safe_cust = html.escape(str(cust_name))
    safe_prod = html.escape(str(product_name))

    msg = (
        f"🛒 <b>ការបញ្ជាទិញជោគជ័យ | Order Successful</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━</code>\n"
        f"👤 អតិថិជន៖ <b>{safe_cust}</b>\n"
        f"📦 ទំនិញ៖ <b>{safe_prod}</b>\n"
        f"🔢 ចំនួន៖ <b>{quantity} Item(s)</b>\n"
        f"⚡️ ស្ថានភាព៖ <b>ប្រគល់ជូនរួចរាល់ (Instant 24/7) ✅</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━</code>\n"
        f"👉 <i>ចុចប៊ូតុងខាងក្រោមដើម្បីចូលរួមទិញទំនិញតម្លៃពិសេស៖</i>"
    )

    mini_link = get_mini_app_link()
    keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": "🛒 បើកកម្មវិធីទិញឥឡូវនេះ (Shop Now)",
                    "url": mini_link
                }
            ]
        ]
    }

    # Dispatch to all configured public channels / groups
    targets = get_configured_alert_targets()
    for target in targets:
        try:
            ok = await asyncio.to_thread(send_one_alert, target, msg, keyboard)
            logger.info(f"📢 Channel Purchase Alert to {target}: {'SUCCESS' if ok else 'FAILED'}")
        except Exception as e:
            logger.error(f"Error in send_purchase_alert to {target}: {e}")


# ─────────────────────────────────────────────
# Guaranteed Account Delivery Notification to User DM
# ─────────────────────────────────────────────

async def send_account_delivery_dm(
    user_id: int,
    order_id: int,
    product_name: str,
    credentials: str,
    expiry_date: str,
    cashback_info: Optional[Dict[str, Any]] = None,
    quantity: int = 1,
    tg_bot: Any = None
) -> bool:
    """
    Guarantees account delivery to user's Telegram DM with fallback.
    Tries active Telegram Bot application instance first, then falls back to direct Telegram API HTTP POST.
    """
    safe_title = html.escape(str(product_name or 'Product'))
    safe_creds = html.escape(str(credentials or ''))
    safe_exp = html.escape(str(expiry_date or '30 ថ្ងៃ'))
    
    cashback_msg = ""
    if cashback_info and cashback_info.get("cashback_amount", 0) > 0:
        c_amt = cashback_info.get('cashback_amount', 0.0)
        c_tier = html.escape(str(cashback_info.get('tier_name', 'VIP')))
        c_pct = cashback_info.get('cashback_pct', 0)
        c_bal = cashback_info.get('new_balance', 0.0)
        cashback_msg = (
            f"\n\n💸 <b>VIP Cashback ទទួលបាន៖</b> <code>+${c_amt:.2f} USD</code> "
            f"({c_tier} {c_pct}%)\n"
            f"💰 <b>សមតុល្យ Wallet ថ្មី៖</b> <code>${c_bal:.2f} USD</code>"
        )

    qty_badge = f" (ចំនួន {quantity}x)" if quantity > 1 else ""

    gemini_guide = ""
    is_gemini = "gemini" in str(product_name or '').lower() or "gemini" in str(credentials or '').lower() or "activate" in str(credentials or '').lower() or "http" in str(credentials or '').lower()
    if is_gemini:
        gemini_guide = (
            f"\n\n📖 <b>របៀបប្រើប្រាស់ភ្ជាប់អាខោន (ច្បាប់ / ការណែនាំ)៖</b>\n"
            f"🔗 បើក Link ដែលអ្នកបានទទួលក្នុង Browser\n"
            f"✅ ចុច Activate ដើម្បីបើកដំណើរការ\n"
            f"🎉 រួចរាល់ អាចប្រើប្រាស់ Gemini Pro បានភ្លាមៗ\n\n"
            f"📌 <b>ចំណាំ៖</b> <i>Link មួយអាចប្រើបានសម្រាប់ Gmail តែមួយប៉ុណ្ណោះ</i>"
        )

    msg = (
        f"🎉 <b>ទូទាត់ប្រាក់ជោគជ័យ (Order #{order_id})!{qty_badge}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📦 ទំនិញ: <b>{safe_title}</b>\n"
        f"📅 ថ្ងៃផុតកំណត់: <code>{safe_exp}</code>\n\n"
        f"🔑 <b>អាខោនរបស់អ្នក៖</b>\n"
        f"<code>{safe_creds}</code>"
        f"{gemini_guide}"
        f"{cashback_msg}\n\n"
        f"💡 <i>សូមរក្សាទុកអាខោននេះឱ្យបានល្អ ឬបើកមើលក្នុង Mini App ផ្នែក My Orders!</i>"
    )

    mini_link = get_mini_app_link()
    
    # Check if credentials contain a direct URL to open
    import re
    url_match = re.search(r'https?://[^\s<>"\'\)]+', str(credentials or ''))
    activation_url = url_match.group(0) if url_match else None

    inline_rows = []
    if activation_url:
        inline_rows.append([{"text": "🔗 បើក Link ភ្ជាប់ Gemini Pro (Activate)", "url": activation_url}])
    inline_rows.append([{"text": "📋 មើលក្នុង Mini App (My Orders)", "url": mini_link}])

    keyboard = {
        "inline_keyboard": inline_rows
    }

    # 1. Attempt via tg_bot object
    sent = False
    if tg_bot:
        try:
            from telegram import InlineKeyboardMarkup, InlineKeyboardButton
            bot_kb_rows = []
            if activation_url:
                bot_kb_rows.append([InlineKeyboardButton("🔗 បើក Link ភ្ជាប់ Gemini Pro", url=activation_url)])
            bot_kb_rows.append([InlineKeyboardButton("📋 មើលក្នុង Mini App", url=mini_link)])
            kb = InlineKeyboardMarkup(bot_kb_rows)
            await tg_bot.send_message(chat_id=user_id, text=msg, parse_mode="HTML", reply_markup=kb)
            sent = True
            logger.info(f"✅ Account successfully sent to user {user_id} via tg_bot")
        except Exception as err:
            logger.warning(f"tg_bot send_message failed for user {user_id}: {err}, trying HTTP API fallback...")

    # 2. Guaranteed HTTP Fallback
    if not sent:
        try:
            sent = await asyncio.to_thread(send_one_alert, user_id, msg, keyboard)
            if sent:
                logger.info(f"✅ Account successfully sent to user {user_id} via direct Telegram HTTP API")
            else:
                logger.error(f"❌ Failed to deliver account to user {user_id} via direct Telegram HTTP API")
        except Exception as err:
            logger.error(f"❌ Error during direct HTTP account delivery to user {user_id}: {err}")

    return sent
