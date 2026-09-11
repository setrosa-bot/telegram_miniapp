import os
import shutil
import logging
import html
import aiosqlite
import asyncio
import io
import csv
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Initialize FastAPI App Instance First
app = FastAPI(title="Digital Premium Shop Mini App API")

# Enable CORS for Telegram WebApp
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path.lower()
    if path.endswith(".html") or path.endswith(".js") or path.endswith(".css") or path == "/" or path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Local application imports
import database as db
from config import BOT_TOKEN, PAYMENT_INFO, is_admin, HOST, PORT, get_admin_ids, WEBAPP_URL, UPLOAD_DIR, DATABASE_PATH
from bot import setup_bot_application
from telegram_alert import send_telegram_alert, send_purchase_alert, format_broadcast_html, send_account_delivery_dm, send_one_alert
from telegram import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

# Upload directory setup
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# Global Telegram Bot instance reference
tg_app = None

@app.on_event("startup")
async def startup_event():
    global tg_app
    await db.init_db()
    logger.info("Database initialized successfully.")
    
    # Initialize Telegram Bot in async background task if token is provided
    if BOT_TOKEN and BOT_TOKEN != "your_bot_token_here":
        try:
            tg_app = setup_bot_application()
            await tg_app.initialize()
            await tg_app.start()
            await tg_app.updater.start_polling()
            logger.info("Telegram Bot polling started successfully.")
            # Start background workers
            asyncio.create_task(expiry_reminder_worker())
            asyncio.create_task(daily_digest_midnight_worker())
        except Exception as e:
            logger.error(f"Failed to start Telegram Bot: {e}")
            tg_app = None
    else:
        logger.warning("BOT_TOKEN is not configured in .env. Bot polling disabled, WebApp API running in standalone mode.")

async def expiry_reminder_worker():
    """Periodic background worker checking for accounts expiring within 2 days."""
    await asyncio.sleep(15)
    while True:
        try:
            if tg_app and tg_app.bot:
                expiring = await db.get_expiring_delivered_accounts_for_reminder(days_left=2)
                for acc in expiring:
                    try:
                        safe_title = html.escape(acc.get("product_name", "Account"))
                        exp_date = acc.get("expiry_date", "ជិតផុតកំណត់")
                        msg = (
                            f"🔔 <b>ដំណឹងរំលឹក៖ Account របស់អ្នកជិតផុតកំណត់ហើយ!</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━━\n"
                            f"📦 កម្មវិធី៖ <b>{safe_title}</b>\n"
                            f"⏳ សុពលភាពនៅសល់៖ <b>២ ថ្ងៃទៀត</b>\n"
                            f"📅 ផុតកំណត់នៅថ្ងៃ៖ <code>{exp_date}</code>\n\n"
                            f"💡 <i>ដើម្បីកុំឱ្យរអាក់រអួលដល់ការប្រើប្រាស់ ឬបាត់បង់ទិន្នន័យ សូមចុចប៊ូតុងខាងក្រោមដើម្បីទិញបន្តសុពលភាព (Renew) ភ្លាមៗ!</i>"
                        )
                        kb = InlineKeyboardMarkup([
                            [InlineKeyboardButton("🛒 ទិញបន្តសុពលភាព (Renew Now)", web_app=WebAppInfo(url=WEBAPP_URL))]
                        ])
                        await tg_app.bot.send_message(chat_id=acc['user_id'], text=msg, parse_mode="HTML", reply_markup=kb)
                        await db.mark_delivered_account_reminder_sent(acc['account_id'])
                        await asyncio.sleep(0.5)
                    except Exception as err:
                        logger.error(f"Failed to send expiry reminder to {acc.get('user_id')}: {err}")
        except Exception as e:
            logger.error(f"Expiry reminder worker error: {e}")
        await asyncio.sleep(1800)

@app.on_event("shutdown")
async def shutdown_event():
    global tg_app
    if tg_app:
        try:
            if tg_app.updater and tg_app.updater.running:
                await tg_app.updater.stop()
            await tg_app.stop()
            await tg_app.shutdown()
        except Exception as e:
            logger.error(f"Error during bot shutdown: {e}")

# ─── User Profile & Auth ──────────────────────────────────────────────────────
class UserAuthRequest(BaseModel):
    user_id: int
    full_name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None

@app.post("/api/user/sync")
async def sync_user(data: UserAuthRequest):
    user = await db.upsert_user(data.user_id, data.username, data.full_name, photo_url=data.photo_url)
    role_info = await db.get_user_role_info(data.user_id)
    vip_info = await db.get_user_vip_info(data.user_id)
    return {
        "status": "success",
        "user": user,
        "role_info": role_info,
        "vip_info": vip_info
    }

@app.get("/api/user/{target_user_id}/avatar")
async def get_user_avatar(target_user_id: int):
    """Serve user profile avatar or dynamically fetch from Telegram Bot API."""
    # 1. Check if user already has photo_url in DB
    user = await db.get_user(target_user_id)
    if user and user.get("photo_url"):
        purl = str(user["photo_url"]).strip()
        if purl.startswith("http://") or purl.startswith("https://"):
            return RedirectResponse(url=purl)
        elif purl.startswith("/uploads/"):
            # Try with data prefix and without
            rel_data = os.path.join("data", purl.lstrip("/"))
            if os.path.exists(rel_data):
                return FileResponse(rel_data)
            rel_plain = purl.lstrip("/")
            if os.path.exists(rel_plain):
                return FileResponse(rel_plain)

    # 2. Try fetching dynamically from Telegram Bot API if bot is active
    global tg_app
    if tg_app and tg_app.bot:
        try:
            photos = await tg_app.bot.get_user_profile_photos(user_id=target_user_id, limit=1)
            if photos and photos.total_count > 0 and photos.photos and len(photos.photos[0]) > 0:
                photo_size = photos.photos[0][-1]
                tg_file = await tg_app.bot.get_file(photo_size.file_id)
                avatars_dir = os.path.join(UPLOAD_DIR, "avatars")
                os.makedirs(avatars_dir, exist_ok=True)
                file_dest = os.path.join(avatars_dir, f"{target_user_id}.jpg")
                await tg_file.download_to_drive(custom_path=file_dest)
                avatar_url = f"/uploads/avatars/{target_user_id}.jpg"
                await db.update_user_photo(target_user_id, avatar_url)
                return FileResponse(file_dest, media_type="image/jpeg")
        except Exception as e:
            logger.debug(f"Could not fetch telegram avatar for user {target_user_id}: {e}")

    raise HTTPException(status_code=404, detail="Avatar not found")

@app.get("/api/user/{user_id}/role-info")
async def get_user_role_details(user_id: int):
    role_info = await db.get_user_role_info(user_id)
    vip_info = await db.get_user_vip_info(user_id)
    return {"status": "success", "role_info": role_info, "vip_info": vip_info}

@app.get("/api/payment-info")
async def get_payment_info():
    return PAYMENT_INFO

# ─── Categories & Products ────────────────────────────────────────────────────
@app.get("/api/categories")
async def get_categories():
    categories = await db.get_categories()
    return {"status": "success", "data": categories}

@app.get("/api/products")
async def get_products(category_id: Optional[int] = None):
    products = await db.get_products(category_id)
    return {"status": "success", "data": products}

@app.get("/api/products/{product_id}")
async def get_product(product_id: int):
    prod = await db.get_product(product_id)
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"status": "success", "data": prod}

# ─── Orders & Purchases ───────────────────────────────────────────────────────
@app.post("/api/orders")
async def submit_order(
    user_id: int = Form(...),
    product_id: int = Form(...),
    payment_method: str = Form(...),
    proof_file: UploadFile = File(...),
    quantity: int = Form(1)
):
    prod = await db.get_product(product_id)
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if prod['stock_count'] < quantity:
        raise HTTPException(status_code=400, detail=f"ទំនិញនេះសល់ស្តុកមិនគ្រប់គ្រាន់ទេ! សល់ត្រឹមតែ {prod['stock_count']} អាខោនប៉ុណ្ណោះ (អ្នកទិញចំនួន {quantity}x)")

    # Compute total price with VIP/Reseller discount
    u_info = await db.get_user(user_id)
    reseller_status = u_info.get("reseller_status") or "none" if u_info else "none"
    vip_info = await db.get_user_vip_info(user_id)
    unit_price = float(prod["price"])
    if reseller_status == "approved" and prod.get("reseller_price") and float(prod["reseller_price"]) > 0:
        unit_price = float(prod["reseller_price"])
    elif vip_info.get("discount_pct", 0) > 0:
        unit_price = round(unit_price * (1.0 - (vip_info["discount_pct"] / 100.0)), 2)
        
    total_price = round(unit_price * quantity, 2)

    # Save uploaded slip
    filename = f"slip_{user_id}_{product_id}_{proof_file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(proof_file.file, buffer)

    proof_url = f"/uploads/{filename}"
    order_id = await db.create_order(
        user_id=user_id,
        product_id=product_id,
        product_name=prod['name'],
        price=total_price,
        payment_method=payment_method,
        proof_file=proof_url,
        quantity=quantity
    )

    # Notify Admins & User via Telegram Bot
    if tg_app and tg_app.bot:
        from datetime import datetime, timezone, timedelta
        kh_now = datetime.now(timezone(timedelta(hours=7))).strftime("%d/%m/%Y %I:%M:%S %p")
        
        # Customer info
        cust_name = (u_info.get("full_name") if u_info else None) or "User"
        cust_username = f"@{u_info.get('username')}" if (u_info and u_info.get('username')) else f"ID: {user_id}"

        safe_pname = html.escape(str(prod.get('name') or 'Product'))
        safe_cname = html.escape(str(cust_name))
        safe_pmethod = html.escape(str(payment_method))

        admin_msg = (
            f"🛒 <b>NEW ORDER RECEIVED (#{order_id})</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 អតិថិជន: <b>{safe_cname}</b> ({cust_username})\n"
            f"🆔 User ID: <code>{user_id}</code>\n"
            f"📦 ទំនិញ: <b>{safe_pname}</b>\n"
            f"💰 តម្លៃសរុប: <code>${total_price:.2f} USD</code> (ចំនួន {quantity}x)\n"
            f"💳 វិធីបង់ប្រាក់: <code>{safe_pmethod}</code>\n"
            f"📅 ថ្ងៃខែឆ្នាំ & ម៉ោង: <code>{kh_now}</code>\n\n"
            f"👇 <i>សូមពិនិត្យ Slip ហើយចុច Approve ឬ Reject ខាងក្រោម៖</i>"
        )
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("📝 Approve & Input Account", callback_data=f"inputapprove_{order_id}"),
                InlineKeyboardButton("✅ Auto Approve", callback_data=f"approve_{order_id}")
            ],
            [InlineKeyboardButton("❌ Reject Order", callback_data=f"reject_{order_id}")]
        ])
        from config import get_admin_ids
        for admin_id in get_admin_ids():
            try:
                with open(file_path, "rb") as photo_f:
                    await tg_app.bot.send_photo(
                        chat_id=admin_id,
                        photo=photo_f,
                        caption=admin_msg,
                        parse_mode="HTML",
                        reply_markup=kb
                    )
            except Exception as e:
                logger.error(f"Failed to send order photo to admin {admin_id}: {e}")

        # Send instant receipt confirmation to the buyer
        user_receipt_msg = (
            f"🧾 <b>ទទួលបានការបញ្ជាទិញ (Order #{order_id})!</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"📦 ទំនិញ: <b>{safe_pname}</b>\n"
            f"💰 តម្លៃទូទាត់សរុប: <code>${total_price:.2f} USD</code> (ចំនួន {quantity}x)\n"
            f"💳 វិធីទូទាត់: <code>{safe_pmethod}</code>\n"
            f"📅 ថ្ងៃខែឆ្នាំ & ម៉ោង: <code>{kh_now}</code>\n\n"
            f"⏳ <i>Slip របស់អ្នកត្រូវបានផ្ញើជូន Admin រួចរាល់ហើយ។ សូមរង់ចាំការពិនិត្យ & ប្រគល់អាខោនបន្តិច!</i>"
        )
        try:
            await tg_app.bot.send_message(chat_id=user_id, text=user_receipt_msg, parse_mode="HTML")
        except Exception as e:
            logger.warning(f"Failed to send order receipt to user {user_id}: {e}")

    return {"status": "success", "order_id": order_id, "message": "Order submitted successfully! Awaiting Admin approval."}

@app.get("/api/user/{user_id}/orders")
async def get_user_orders(user_id: int):
    orders = await db.get_user_orders(user_id)
    return {"status": "success", "data": orders}

# ─── Account Replacement Warranty Requests ────────────────────────────────────
class ReplacementForm(BaseModel):
    user_id: int
    buyer_name: str
    product_name: str
    purchase_date: Optional[str] = "N/A"
    expiry_date: Optional[str] = "N/A"
    problem_credentials: str # Email & Password
    issue_description: Optional[str] = "Account login issue"

@app.post("/api/replacement-request")
async def submit_replacement_request(data: ReplacementForm):
    req_id = await db.create_replacement_request(
        user_id=data.user_id,
        buyer_name=data.buyer_name,
        product_name=data.product_name,
        purchase_date=data.purchase_date,
        expiry_date=data.expiry_date,
        problem_credentials=data.problem_credentials,
        issue_description=data.issue_description
    )

    # Send Notification to Admins
    if tg_app and tg_app.bot:
        admin_msg = (
            f"🔄 **REPLACEMENT REQUEST RECEIVED (#{req_id})**\n"
            f"───────────────────────\n"
            f"👤 ឈ្មោះអ្នកទិញ: `{data.buyer_name}` (User `{data.user_id}`)\n"
            f"📦 កម្មវិធី: **{data.product_name}**\n"
            f"📅 ថ្ងៃទិញ: `{data.purchase_date}` | ថ្ងៃផុតកំណត់: `{data.expiry_date}`\n"
            f"🔑 Email/Pass មានបញ្ហា:\n`{data.problem_credentials}`\n"
            f"📝 ព័ត៌មានបញ្ហា: {data.issue_description}\n"
        )
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Approve & Send New Account", callback_data=f"approvereplace_{req_id}"),
                InlineKeyboardButton("❌ Reject", callback_data=f"rejectreplace_{req_id}")
            ]
        ])
        for admin_id in get_admin_ids():
            try:
                await tg_app.bot.send_message(
                    chat_id=admin_id,
                    text=admin_msg,
                    parse_mode="Markdown",
                    reply_markup=kb
                )
            except Exception as e:
                logger.error(f"Failed to notify admin {admin_id} for replacement: {e}")

    return {
        "status": "success",
        "request_id": req_id,
        "message": "សំណើសុំដូរអាខោនត្រូវបានផ្ញើជោគជ័យ! Admin នឹងពិនិត្យ និងប្រគល់អាខោនថ្មីជូនក្នុងពេលឆាប់ៗ។"
    }

@app.get("/api/user/{user_id}/wallet")
async def get_user_wallet(user_id: int):
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    stats = await db.get_user_referral_stats(user_id)
    bot_info = None
    bot_username = "digitalappstore_bot"
    if tg_app and tg_app.bot:
        try:
            bot_info = await tg_app.bot.get_me()
            if bot_info and bot_info.username:
                bot_username = bot_info.username
        except Exception:
            pass

    ref_link = f"https://t.me/{bot_username}?start=ref_{user_id}"

    return {
        "status": "success",
        "balance": user['balance'],
        "referral_link": ref_link,
        "referrals_count": stats['referrals_count'],
        "total_earned": stats['total_earned']
    }

class WalletPayForm(BaseModel):
    user_id: int
    product_id: int
    promo_code: Optional[str] = None

@app.post("/api/wallet/pay-order")
async def pay_order_with_wallet(data: WalletPayForm):
    user = await db.get_user(data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    prod = await db.get_product(data.product_id)
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")

    final_price = prod['price']
    discount_applied = 0.0

    # Check promo code if supplied
    if data.promo_code:
        promo_res = await db.verify_promo_code(data.promo_code, prod['price'])
        if promo_res.get("valid"):
            discount_applied = promo_res["discount"]
            final_price = promo_res["final_price"]
            await db.use_promo_code(data.promo_code)

    if user['balance'] < final_price:
        raise HTTPException(status_code=400, detail=f"ប្រាក់ក្នុង Wallet មិនគ្រប់គ្រាន់ទេ! អ្នកមាន `${user['balance']:.2f}` ប៉ុន្តែទំនិញថ្លៃ `${final_price:.2f}`")

    if prod['stock_count'] <= 0:
        raise HTTPException(status_code=400, detail="ទំនិញនេះអស់ស្តុកហើយ!")

    # Deduct wallet balance
    await db.update_user_balance(data.user_id, -final_price, 'purchase', f"Purchased {prod['name']}")

    # Create order & instant deliver
    order_id = await db.create_order(
        user_id=data.user_id,
        product_id=data.product_id,
        product_name=prod['name'],
        price=final_price,
        payment_method="Wallet Balance 💳" + (f" (Promo: {data.promo_code})" if data.promo_code else ""),
        proof_file="WALLET_PAYMENT"
    )

    res = await db.approve_and_deliver_order(order_id)

    # 5% Referral Commission Bonus to Inviter
    if user.get('referred_by'):
        bonus = round(final_price * 0.05, 2)
        if bonus > 0:
            await db.update_user_balance(user['referred_by'], bonus, 'referral_bonus', f"5% Cashback from friend {data.user_id}")
            if tg_app and tg_app.bot:
                try:
                    await tg_app.bot.send_message(
                        chat_id=user['referred_by'],
                        text=f"🎁 **ទទួលបាន Bonus ណែនាំមិត្តភក្តិ!**\nមិត្តភក្តិរបស់អ្នកទើបតែទិញទំនិញ! អ្នកទទួលបាន `${bonus:.2f}` ចូលក្នុង Wallet Balance!",
                        parse_mode="Markdown"
                    )
                except Exception as e:
                    logger.error(f"Failed to send ref bonus notification: {e}")

    # Send Guaranteed Notification to Buyer & Broadcast to Channel
    try:
        qty = res.get("quantity") or 1
        bot_inst = tg_app.bot if (tg_app and tg_app.bot) else None
        await send_account_delivery_dm(
            user_id=data.user_id,
            order_id=order_id,
            product_name=res.get("product_name", "Product"),
            credentials=res.get("credentials", ""),
            expiry_date=res.get("expiry_date", ""),
            quantity=qty,
            tg_bot=bot_inst
        )
        asyncio.create_task(send_purchase_alert(data.user_id, res["product_name"], qty))
    except Exception as e:
        logger.error(f"Failed to notify wallet buyer {data.user_id}: {e}")

    return {
        "status": "success",
        "order_id": order_id,
        "delivered": res,
        "final_price": final_price,
        "discount": discount_applied,
        "message": "ទិញទំនិញតាម Wallet ជោគជ័យ 1-Second Instant Delivery!"
    }

# ─── Gamification & Loyalty Endpoints ─────────────────────────────────────────

class SpinRequest(BaseModel):
    user_id: int

@app.post("/api/user/spin")
async def spin_lucky_wheel(data: SpinRequest):
    res = await db.perform_user_spin(data.user_id)
    return res

@app.get("/api/user/{user_id}/spin-status")
async def get_spin_status(user_id: int):
    res = await db.get_user_spin_status(user_id)
    return {"status": "success", **res}

class PromoVerifyRequest(BaseModel):
    code: str
    total_price: float

@app.post("/api/promo/verify")
async def check_promo_code(data: PromoVerifyRequest):
    res = await db.verify_promo_code(data.code, data.total_price)
    return res

@app.get("/api/user/{user_id}/vip-tier")
async def get_vip_tier(user_id: int):
    tier_info = await db.get_user_vip_tier(user_id)
    return {"status": "success", "data": tier_info}

@app.get("/api/live-activities")
async def get_live_stream_activities():
    activities = await db.get_live_activities()
    return {"status": "success", "data": activities}

@app.post("/api/admin/trigger-expiry-reminders")
async def trigger_expiry_reminders(user_id: int = Form(...)):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    if not tg_app or not tg_app.bot:
        raise HTTPException(status_code=500, detail="Telegram bot not initialized")
    # Placeholder: implement expiry reminder logic here if needed
    return {"status": "success", "sent_count": 0, "message": "Expiry reminder trigger endpoint ready."}

@app.get("/api/admin/export-sales")
async def export_sales_report(user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import csv
    import io
    from fastapi.responses import Response

    # Query delivered orders directly
    async with aiosqlite.connect(db.DATABASE_PATH) as database:
        database.row_factory = aiosqlite.Row
        async with database.execute("""
            SELECT o.id, o.user_id, u.full_name, o.product_name, o.price, o.payment_method, o.status, o.created_at
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            ORDER BY o.id DESC
        """) as cursor:
            rows = await cursor.fetchall()
            orders = [dict(r) for r in rows]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Order ID", "User ID", "Customer Name", "Product Name", "Price ($)", "Payment Method", "Status", "Date"])
    for o in orders:
        writer.writerow([o['id'], o['user_id'], o['full_name'], o['product_name'], f"{o['price']:.2f}", o['payment_method'], o['status'], o['created_at']])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=digital_shop_sales_report.csv"}
    )

# ─── Admin Endpoints ──────────────────────────────────────────────────────────
@app.get("/api/admin/stats")
async def get_admin_stats(user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    stats = await db.get_stats()
    pending = await db.get_pending_orders()
    pending_topups = await db.get_pending_topup_requests()
    return {
        "status": "success",
        "stats": stats,
        "pending_orders": pending or [],
        "pending_topups": pending_topups or [],
        "pending_orders_count": len(pending) if pending else 0,
        "pending_topups_count": len(pending_topups) if pending_topups else 0
    }

@app.get("/api/user/{user_id}/wallet-history")
async def get_user_wallet_history(user_id: int):
    """Get wallet balance, transactions, and referral stats for user."""
    try:
        user = await db.get_user(user_id)
        if not user:
            return {"status": "error", "message": "User not found"}
        
        txs = await db.get_user_wallet_transactions(user_id, limit=30)
        ref_stats = await db.get_user_referral_stats(user_id)
        
        return {
            "status": "success",
            "balance": float(user.get("balance", 0.0)),
            "transactions": txs or [],
            "referrals_count": ref_stats.get("referrals_count", 0),
            "referrals_earned": ref_stats.get("total_earned", 0.0)
        }
    except Exception as e:
        logger.error(f"Error fetching wallet history for user {user_id}: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/admin/backup-db")
async def admin_backup_db(user_id: int):
    """Admin: Backup database file."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    from fastapi.responses import FileResponse
    import os
    if not os.path.exists(db.DATABASE_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    return FileResponse(db.DATABASE_PATH, filename="digital_store_backup.db", media_type="application/octet-stream")

@app.get("/api/admin/orders")
async def admin_get_all_orders(user_id: int, status: Optional[str] = None):
    """Admin: Get all orders, optionally filtered by status."""
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    import aiosqlite
    async with aiosqlite.connect(db.DATABASE_PATH) as database:
        database.row_factory = aiosqlite.Row
        if status:
            query = """
                SELECT o.*, u.full_name, u.username,
                       da.credentials as delivered_credentials, da.expiry_date as delivered_expiry
                FROM orders o
                JOIN users u ON o.user_id = u.user_id
                LEFT JOIN delivered_accounts da ON o.id = da.order_id
                WHERE o.status = ?
                ORDER BY o.created_at DESC
            """
            async with database.execute(query, (status,)) as cursor:
                rows = await cursor.fetchall()
        else:
            query = """
                SELECT o.*, u.full_name, u.username,
                       da.credentials as delivered_credentials, da.expiry_date as delivered_expiry
                FROM orders o
                JOIN users u ON o.user_id = u.user_id
                LEFT JOIN delivered_accounts da ON o.id = da.order_id
                ORDER BY o.created_at DESC
            """
            async with database.execute(query) as cursor:
                rows = await cursor.fetchall()
        orders = [dict(r) for r in rows]
    return {"status": "success", "data": orders}

@app.post("/api/admin/products")
async def admin_add_product(
    user_id: int = Form(...),
    name: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    duration_days: int = Form(...),
    reseller_price: Optional[float] = Form(None),
    badge: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    initial_stock: Optional[str] = Form(None), # Bulk credentials split by newline
    stock_qty: Optional[int] = Form(0), # Stock quantity count number
    send_alert: bool = Form(False)
):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    final_image_url = (image_url or "").strip()
    if image_file and image_file.filename:
        import time
        filename = f"prod_{int(time.time())}_{image_file.filename.replace(' ', '_')}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image_file.file, buffer)
        final_image_url = f"/uploads/{filename}"

    if not final_image_url:
        final_image_url = "https://cdn-icons-png.flaticon.com/512/3594/3594363.png"

    clean_badge = (badge or "").strip() or None
    prod_id = await db.add_product(name, category_id, description, price, duration_days, final_image_url, reseller_price, clean_badge)
    
    added_stock = 0
    if stock_qty and stock_qty > 0:
        added_stock = await db.add_stock_by_quantity(prod_id, stock_qty)
    elif initial_stock:
        creds = initial_stock.strip().split("\n")
        added_stock = await db.add_stock(prod_id, creds)

    # Send NEW PRODUCT alert to all users + group + channel when requested
    alert_result = None
    alert_sent_count = 0

    if send_alert:
        safe_name = html.escape(name)
        safe_description = html.escape(description or "")

        alert_msg = (
            f"🔥 <b>NEW PRODUCT!</b>\n\n"
            f"🛍 <b>{safe_name}</b>\n"
            f"💰 Price: ${price:.2f}\n"
            f"⏳ Duration: {duration_days} Days\n\n"
            f"📝 {safe_description}\n\n"
            f"👇 ចុចប៊ូតុងខាងក្រោមដើម្បីទិញ"
        )

        try:
            alert_result = await send_telegram_alert(alert_msg, photo_url_or_file=final_image_url)
            alert_sent_count = (
                alert_result.get("users_sent", 0)
                + int(bool(alert_result.get("group_sent", False)))
                + int(bool(alert_result.get("channel_sent", False)))
            )
        except Exception as error:
            logger.error(f"New product alert error: {error}")

    return {
        "status": "success",
        "product_id": prod_id,
        "added_stock": added_stock,
        "image_url": final_image_url,
        "alert_sent_to": alert_sent_count,
        "alert_result": alert_result,
        "message": f"Product '{name}' created successfully with {added_stock} stock items!"
    }

@app.delete("/api/admin/products/{product_id}")
async def admin_delete_product(product_id: int, user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.delete_product(product_id)
    return {"status": "success", "message": f"Product #{product_id} deleted successfully!"}

@app.get("/api/admin/products")
async def admin_get_all_products(user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    products = await db.get_all_products_admin()
    return {"status": "success", "data": products}

@app.patch("/api/admin/products/{product_id}/restore")
async def admin_restore_product(product_id: int, user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.restore_product(product_id)
    return {"status": "success", "message": f"Product #{product_id} restored successfully!"}

@app.put("/api/admin/products/{product_id}")
async def admin_update_product(
    product_id: int,
    user_id: int = Form(...),
    name: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    duration_days: int = Form(...),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    reseller_price: Optional[float] = Form(None),
    badge: Optional[str] = Form(None)
):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    final_image_url = (image_url or "").strip()
    if image_file and image_file.filename:
        import time
        filename = f"prod_{int(time.time())}_{image_file.filename.replace(' ', '_')}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image_file.file, buffer)
        final_image_url = f"/uploads/{filename}"

    if not final_image_url:
        existing = await db.get_product(product_id)
        final_image_url = existing['image_url'] if existing and existing['image_url'] else "https://cdn-icons-png.flaticon.com/512/3594/3594363.png"

    clean_badge = (badge or "").strip() or None

    # Update the product in the database
    await db.update_product(
        product_id,
        name,
        category_id,
        description,
        price,
        duration_days,
        final_image_url,
        1,
        reseller_price,
        clean_badge
    )

    return {
        "status": "success",
        "message": f"Product '{name}' updated successfully!"
    }



class AdminPriceUpdate(BaseModel):
    user_id: int
    price: float
    reseller_price: Optional[float] = None


@app.patch("/api/admin/products/{product_id}/price")
@app.post("/api/admin/products/{product_id}/price")
async def admin_update_product_price(product_id: int, req: AdminPriceUpdate):
    if not is_admin(req.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    if req.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than 0")

    await db.update_product_price(product_id, req.price, req.reseller_price)
    return {
        "status": "success",
        "message": f"Product #{product_id} price updated to ${req.price:.2f} successfully!",
        "price": req.price,
        "reseller_price": req.reseller_price
    }



@app.post("/api/admin/stock")
async def admin_add_stock(
    user_id: int = Form(...),
    product_id: int = Form(...),
    credentials_text: Optional[str] = Form(None), # Newline separated
    stock_qty: Optional[int] = Form(None) # Quantity number
):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    added = 0
    if stock_qty and stock_qty > 0:
        added = await db.add_stock_by_quantity(product_id, stock_qty)
    elif credentials_text:
        creds = credentials_text.strip().split("\n")
        added = await db.add_stock(product_id, creds)
    else:
        raise HTTPException(status_code=400, detail="Please enter stock quantity or credentials text.")

    # 🔔 Dispatch automated back-in-stock alerts to waiting subscribers
    if added > 0 and tg_app and tg_app.bot:
        try:
            prod = await db.get_product(product_id)
            if prod:
                subscribers = await db.get_and_clear_stock_subscribers(product_id)
                if subscribers:
                    safe_pname = html.escape(prod["name"])
                    alert_txt = (
                        f"🎉 <b>ដំណឹងទំនិញចូលស្តុកវិញហើយ! (Back in Stock)</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━━\n"
                        f"📦 ទំនិញ៖ <b>{safe_pname}</b>\n"
                        f"💰 តម្លៃ៖ <code>${prod['price']:.2f} USD</code>\n"
                        f"✨ ស្តុកទើបចូលថ្មី៖ <code>+{added} Accounts</code>\n\n"
                        f"💡 <i>សូមប្រញាប់ចូលទៅកាន់ Mini App ដើម្បីទិញមុនពេលអស់ស្តុកម្តងទៀត!</i>"
                    )
                    from telegram import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
                    from config import WEBAPP_URL
                    kb = InlineKeyboardMarkup([[InlineKeyboardButton("🛒 បើកហាងទិញឥឡូវនេះ", web_app=WebAppInfo(url=WEBAPP_URL))]])
                    for u_id in subscribers:
                        try:
                            await tg_app.bot.send_message(chat_id=u_id, text=alert_txt, parse_mode="HTML", reply_markup=kb)
                            await asyncio.sleep(0.05)
                        except Exception as e:
                            logger.warning(f"Could not send stock alert to {u_id}: {e}")
        except Exception as err:
            logger.error(f"Error dispatching stock alerts: {err}")

    return {"status": "success", "added_count": added, "message": f"Added {added} stock items successfully!"}

@app.get("/api/admin/broadcast/audience-stats")
async def admin_broadcast_audience_stats(user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        from database import get_targeted_user_ids
        all_users = await get_targeted_user_ids("all")
        resellers = await get_targeted_user_ids("resellers")
        vip_users = await get_targeted_user_ids("vip")
        from telegram_alert import ALERT_CHANNEL, ALERT_GROUP
        return {
            "status": "success",
            "data": {
                "all": len(set(all_users)),
                "resellers": len(set(resellers)),
                "vip": len(set(vip_users)),
                "channel": ALERT_CHANNEL or ALERT_GROUP or "@smarttech_digital"
            }
        }
    except Exception as e:
        logger.error(f"Audience stats error: {e}")
        return {"status": "success", "data": {"all": 0, "resellers": 0, "vip": 0, "channel": "@smarttech_digital"}}

_last_admin_broadcast_time = {}

@app.post("/api/admin/broadcast")
async def admin_broadcast(
    user_id: int = Form(...),
    title: str = Form(...),
    message: str = Form(...),
    target_group: Optional[str] = Form("all"),
    send_channel: Optional[str] = Form("true"),
    send_users: Optional[str] = Form("true"),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    button_text: Optional[str] = Form(None),
    button_url: Optional[str] = Form(None)
):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    import time
    now_ts = time.time()
    last_ts = _last_admin_broadcast_time.get(user_id, 0)
    if now_ts - last_ts < 3.0:
        logger.warning(f"Duplicate broadcast blocked for admin {user_id} (throttled)")
        return {
            "status": "success",
            "message": "Broadcast alert is already being processed.",
            "sent_count": 0,
            "users_sent": 0,
            "channel_sent": False
        }
    _last_admin_broadcast_time[user_id] = now_ts

    target_photo = None

    # Handle image file upload
    if image_file and image_file.filename:
        import time
        broadcast_dir = os.path.join(UPLOAD_DIR, "broadcasts")
        os.makedirs(broadcast_dir, exist_ok=True)
        filename = f"broadcast_{int(time.time())}_{image_file.filename.replace(' ', '_')}"
        file_path = os.path.join(broadcast_dir, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image_file.file, buffer)
        target_photo = file_path
    elif image_url and str(image_url).strip():
        target_photo = str(image_url).strip()

    # Parse boolean flags
    send_channel_bool = str(send_channel).lower() in ("true", "1", "yes", "on")
    send_users_bool = str(send_users).lower() in ("true", "1", "yes", "on")

    # Format beautiful Telegram message with HTML escaping and clean divider lines
    formatted_msg = format_broadcast_html(title, message)

    try:
        result = await send_telegram_alert(
            message=formatted_msg,
            photo_url_or_file=target_photo,
            target_group=target_group or "all",
            send_to_channel=send_channel_bool,
            send_to_users=send_users_bool,
            button_text=button_text,
            button_url=button_url
        )

        users_sent = result.get("users_sent", 0)
        channel_sent = bool(result.get("channel_sent", False))
        total_reach = result.get("total_reach", users_sent + int(channel_sent))

        return {
            "status": "success",
            "target_group": target_group or "all",
            "sent_count": total_reach,
            "users_sent": users_sent,
            "users_failed": result.get("users_failed", 0),
            "channel_sent": channel_sent,
            "group_sent": channel_sent,
            "photo_used": bool(target_photo),
            "message": (
                f"✅ Alert dispatched: {users_sent} users delivered | "
                f"Channel/Group: {'Sent (Auto-forwarded to Group)' if channel_sent else 'Skipped/Disabled'}"
            )
        }

    except Exception as error:
        logger.error(f"Broadcast Alert Error: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/api/admin/orders/{order_id}/approve-custom")
async def admin_approve_order_custom(
    order_id: int,
    user_id: int = Form(...),
    credentials: str = Form(...) # email|password|PIN provided directly by Admin
):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        res = await db.approve_with_custom_credentials(order_id, credentials)
        order_obj = await db.get_order(order_id)
        cashback_info = None
        if order_obj:
            cashback_info = await db.apply_order_cashback(res['user_id'], order_obj.get('price', 0.0))

        # Guaranteed account delivery to user
        qty = res.get('quantity') or (order_obj.get('quantity', 1) if order_obj else 1)
        bot_inst = tg_app.bot if (tg_app and tg_app.bot) else None
        
        try:
            await send_account_delivery_dm(
                user_id=res['user_id'],
                order_id=order_id,
                product_name=res.get('product_name', 'Product'),
                credentials=res.get('credentials', ''),
                expiry_date=res.get('expiry_date', ''),
                cashback_info=cashback_info,
                quantity=qty,
                tg_bot=bot_inst
            )
        except Exception as dm_err:
            logger.error(f"Failed to deliver account DM to user {res['user_id']}: {dm_err}")

        # Review Request & Public Channel Alert
        try:
            prod_id_val = order_obj.get('product_id', 1) if order_obj else 1
            asyncio.create_task(send_order_review_request(res['user_id'], order_id, prod_id_val, res.get('product_name', 'Product')))
            asyncio.create_task(send_purchase_alert(res['user_id'], res.get('product_name', 'Product'), qty))
        except Exception as alert_err:
            logger.error(f"Failed to trigger review or channel alert for order #{order_id}: {alert_err}")

        return {"status": "success", "delivered": res, "cashback": cashback_info, "message": "Order approved & account delivered to user!"}
    except Exception as e:
        logger.error(f"Error in admin_approve_order_custom #{order_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/admin/orders/{order_id}/reject")
async def admin_reject_order(order_id: int, user_id: int = Form(...), reason: str = Form("Slip Verification Failed")):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        await db.reject_order(order_id, reason)
        order = await db.get_order(order_id)
        if order and tg_app and tg_app.bot:
            try:
                safe_prod = html.escape(str(order.get('product_name') or 'Product'))
                safe_reason = html.escape(str(reason or 'Payment verification failed'))
                price_val = float(order.get('price') or 0.0)
                msg = (
                    f"❌ <b>ការបញ្ជាទិញត្រូវបានបដិសេធ (Order #{order_id} Rejected)</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"📦 ទំនិញ: <b>{safe_prod}</b>\n"
                    f"💰 តម្លៃ: <code>${price_val:.2f} USD</code>\n"
                    f"📝 មូលហេតុ: <i>{safe_reason}</i>\n\n"
                    f"💡 <i>ប្រសិនបើមានចម្ងល់ ឬកំហុសឆ្គង សូមទាក់ទងមកកាន់ Support។</i>"
                )
                await tg_app.bot.send_message(
                    chat_id=order['user_id'],
                    text=msg,
                    parse_mode="HTML"
                )
            except Exception as notify_err:
                logger.error(f"Failed to send rejection DM to user {order.get('user_id')}: {notify_err}")

        return {"status": "success", "message": f"Order #{order_id} rejected successfully."}
    except Exception as e:
        logger.error(f"Admin reject order error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/admin/orders/{order_id}")
async def admin_delete_order(order_id: int, user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        await db.delete_order(order_id)
        return {"status": "success", "message": f"Order #{order_id} deleted successfully."}
    except Exception as e:
        logger.error(f"Admin delete order error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/admin/backup-db")
async def admin_download_backup_db(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    from config import DATABASE_PATH
    if not os.path.exists(DATABASE_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    return FileResponse(
        path=DATABASE_PATH,
        filename=f"app_backup_{DATABASE_PATH.split('/')[-1]}",
        media_type="application/octet-stream"
    )

# ─── DAILY CHECK-IN & VIP APIS ────────────────────────────────────────────────
@app.get("/api/user/{user_id}/daily-status")
async def get_user_daily_status(user_id: int):
    status = await db.get_user_daily_checkin_status(user_id)
    return {"status": "success", "data": status}

@app.post("/api/user/{user_id}/daily-checkin")
async def claim_user_daily_checkin(user_id: int):
    res = await db.claim_user_daily_reward(user_id)
    return res

@app.get("/api/user/{user_id}/vip-status")
@app.get("/api/user/{user_id}/vip-tier")
async def get_user_vip_status(user_id: int):
    vip_info = await db.get_user_vip_info(user_id)
    return {"status": "success", "data": vip_info}

# ─── 👑 VIP RESELLER & WHOLESALE PRICING APIS ───────────────────────────────
class ResellerApplyRequest(BaseModel):
    user_id: int
    full_name: str
    username: Optional[str] = None
    contact: str
    reason: str

@app.post("/api/user/{user_id}/apply-reseller")
async def user_apply_reseller(user_id: int, data: ResellerApplyRequest):
    res = await db.apply_for_reseller(user_id, data.full_name, data.username, data.contact, data.reason)
    
    # Notify Admin on Telegram
    if tg_app and tg_app.bot:
        for admin_id in ADMIN_IDS:
            try:
                admin_msg = (
                    f"👑 <b>សំណើសុំធ្វើជា VIP Reseller ថ្មី!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"👤 ឈ្មោះ: <b>{html.escape(data.full_name)}</b> (@{data.username or 'N/A'})\n"
                    f"🆔 User ID: <code>{user_id}</code>\n"
                    f"📞 Contact: <code>{html.escape(data.contact)}</code>\n"
                    f"📝 មូលហេតុ: <i>{html.escape(data.reason)}</i>\n\n"
                    f"👉 ចូលទៅកាន់ Admin Dashboard -> Tab '👑 Resellers' ដើម្បីពិនិត្យ & Approve!"
                )
                await tg_app.bot.send_message(chat_id=admin_id, text=admin_msg, parse_mode="HTML")
            except Exception:
                pass
    return res

@app.get("/api/admin/resellers")
async def admin_list_resellers(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    resellers = await db.admin_get_resellers()
    return {"status": "success", "data": resellers}

class ResellerStatusUpdate(BaseModel):
    admin_id: int
    target_user_id: int
    status: str # 'approved', 'rejected', 'none'
    admin_note: Optional[str] = ""

@app.post("/api/admin/resellers/{app_id}/status")
async def admin_set_reseller_status(app_id: int, data: ResellerStatusUpdate):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.admin_update_reseller_status(app_id, data.target_user_id, data.status, data.admin_note)
    
    # Alert user on Telegram if approved/rejected
    if tg_app and tg_app.bot:
        try:
            if data.status == "approved":
                user_msg = (
                    f"🎉 <b>អបអរសាទរ! ពាក្យស្នើសុំ VIP Reseller ត្រូវបានអនុម័ត!</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"👑 ឥឡូវនេះលោកអ្នកគឺជា <b>Official VIP Reseller</b> នៃ Digital Premium Store!\n\n"
                    f"✨ <b>សិទ្ធិពិសេសរបស់អ្នក៖</b>\n"
                    f"• ទទួលបាន <b>តម្លៃបោះដុំពិសេស (Wholesale Price)</b> គ្រប់មុខទំនិញស្វ័យប្រវត្តិ\n"
                    f"• មុខងារ <b>Bulk Buy (ទិញម្តងច្រើនអាខោន)</b>\n"
                    f"• 5% VIP Cashback ចូល Wallet គ្រប់ពេលទិញ\n\n"
                    f"🚀 ចូលទៅកាន់ Mini App ដើម្បីរីករាយជាមួយតម្លៃបោះដុំឥឡូវនេះ!"
                )
            else:
                user_msg = (
                    f"ℹ️ <b>ដំណឹងអំពីពាក្យស្នើសុំ VIP Reseller</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"ពាក្យស្នើសុំរបស់អ្នកមិនត្រូវបានអនុម័តនៅពេលនេះទេ។\n"
                    f"សម្គាល់៖ {data.admin_note or 'សូមទាក់ទងមក Admin សម្រាប់ព័ត៌មានបន្ថែម។'}"
                )
            await tg_app.bot.send_message(chat_id=data.target_user_id, text=user_msg, parse_mode="HTML")
        except Exception:
            pass
    return res

# ─── 🤖 FEATURE 1: SMART AI CHATBOT ASSISTANT API ────────────────────────────
class AIChatRequest(BaseModel):
    message: str
    user_id: Optional[int] = None

@app.post("/api/ai/chat")
async def ai_store_assistant_chat(data: AIChatRequest):
    q = data.message.lower().strip()
    
    if "capcut" in q or "កាត់ត" in q:
        reply = (
            "🎬 <b>CapCut Pro Premium៖</b>\n"
            "• មុខងារ៖ Export 4K 60FPS, គ្មាន Watermark, Effect & Filter Pro ទាំងអស់, Auto Caption.\n"
            "• តម្លៃ៖ 7 ថ្ងៃ ($0.99) | 1 ខែ ($4.00) | 6 ខែ ($12.00) | 1 ឆ្នាំ ($18.00)\n"
            "• របៀប Login៖ ចូលកម្មវិធី CapCut -> ចុច 'Manage Account' -> វាយ Email & Password ដែលទទួលបានពី Bot ជាការស្រេច!"
        )
        quick = ["🛒 ទិញ CapCut Pro", "🎁 ទទួល CapCut Free", "🔄 ស្នើសុំដូរ CapCut"]

    elif "chatgpt" in q or "gpt" in q or "claude" in q or "gemini" in q or "ai" in q:
        reply = (
            "🤖 <b>AI Tools Premium (ChatGPT Plus, Claude Pro, Gemini Pro)៖</b>\n"
            "• មុខងារ៖ ប្រើ GPT-4o, Claude 3.5 Sonnet, Gemini Advanced លឿនបំផុត, គូររូប DALL-E 3, វិភាគទិន្នន័យ & Code.\n"
            "• ធានា៖ ធានាពេញរង្វង់ ១០០% បើមានបញ្ហាអាចដូរថ្មីបានភ្លាមៗ!\n"
            "• ចូលទិញក្នុង Tab 'ហាងទំនិញ' ជ្រើសរើសប្រភេទ AI Tools បានភ្លាមៗ!"
        )
        quick = ["🛒 ទិញ ChatGPT Plus", "🛒 ទិញ Gemini Pro", "💳 របៀបបង់ប្រាក់"]

    elif "បង់លុយ" in q or "pay" in q or "aba" in q or "bakong" in q or "qr" in q or "wallet" in q:
        reply = (
            "💳 <b>របៀបទូទាត់ប្រាក់ (Payment Guide)៖</b>\n"
            "1. ជ្រើសរើសទំនិញរួចចុចប៊ូតុង 'ទិញ'\n"
            "2. ស្កេន ABA KHQR ឬផ្ទេរប្រាក់តាមគណនីផ្លូវការ\n"
            "3. Upload រូបភាព Slip បង់ប្រាក់រួចចុចផ្ញើ\n"
            "💡 ឬបញ្ចូលប្រាក់ក្នុង 'កាបូបលុយ (Wallet)' ដើម្បីទិញស្វ័យប្រវត្តភ្លាមៗ ២៤/៧!"
        )
        quick = ["➕ បញ្ចូលប្រាក់ Wallet", "🛒 ទៅកាន់ហាងទំនិញ", "📞 ទាក់ទង Admin"]

    elif "ខូច" in q or "ដូរ" in q or "login មិនបាន" in q or "ធានា" in q or "warranty" in q or "replace" in q:
        reply = (
            "🛡️ <b>គោលការណ៍ធានា (Warranty & Replacement)៖</b>\n"
            "• ហាងយើងខ្ញុំធានាជូនពេញរយៈពេលប្រើប្រាស់ ១០០%!\n"
            "• ប្រសិនបើអាខោនមានបញ្ហា សូមចូលទៅកាន់ Tab <b>'ស្នើដូរអាខោន'</b> ខាងក្រោម បំពេញព័ត៌មាន Admin នឹងដូរជូនភ្លាមៗ!"
        )
        quick = ["🔄 ទៅកាន់ទំព័រស្នើដូរអាខោន", "📋 មើល My Orders", "📞 Chat ទៅ Admin"]

    elif "free" in q or "ចែក" in q or "giveaway" in q:
        reply = (
            "🎁 <b>កម្មវិធីចែកអាខោន Free (Giveaway)៖</b>\n"
            "• គ្រាន់តែ Join Telegram Group/Channel ផ្លូវការរបស់យើង\n"
            "• ចូលទៅកាន់ Tab <b>'ចែកអាខោន'</b> ខាងក្រោម រួចចុច 'ទទួលយកឥឡូវនេះ'\n"
            "• ប្រព័ន្ធនឹងប្រគល់ Account Free ជូនភ្លាមៗ!"
        )
        quick = ["🎁 ទៅកាន់ Tab ចែកអាខោន", "📢 Join Channel ផ្លូវការ", "✨ Daily Check-in"]

    else:
        reply = (
            "👋 សួស្តី! ខ្ញុំជា <b>AI Assistant ជំនួយការឆ្លាតវៃ</b> របស់ Digital Premium Store 💎\n\n"
            "ខ្ញុំអាចជួយលោកអ្នកបានលើ៖\n"
            "• ព័ត៌មានទំនិញ & តម្លៃ (CapCut, ChatGPT, Canva, Netflix...)\n"
            "• របៀប Login & ប្រើប្រាស់ Accounts\n"
            "• របៀបបង់ប្រាក់ & បញ្ចូល Wallet\n"
            "• ស្នើសុំដូរអាខោនថ្មី (Warranty) & ទទួល Account Free\n\n"
            "👇 សូមជ្រើសរើសប្រធានបទខាងក្រោម ឬសរសេរសំណួររបស់អ្នកមកកាន់ខ្ញុំ!"
        )
        quick = ["🎬 របៀបទិញ CapCut Pro", "🤖 ព័ត៌មាន ChatGPT Plus", "💳 របៀបបង់ប្រាក់", "🛡️ គោលការណ៍ធានា"]

    return {"status": "success", "reply": reply, "quick_replies": quick}

# ─── ⭐ FEATURE 3: VERIFIED CUSTOMER REVIEWS APIS ─────────────────────────────
class ReviewSubmitPayload(BaseModel):
    order_id: int
    user_id: int
    product_id: int
    product_name: str
    rating: int
    comment: Optional[str] = ""
    user_name: Optional[str] = "អតិថិជន"

@app.post("/api/reviews")
async def submit_customer_review(data: ReviewSubmitPayload):
    res = await db.add_product_review(
        order_id=data.order_id,
        user_id=data.user_id,
        product_id=data.product_id,
        product_name=data.product_name,
        rating=data.rating,
        comment=data.comment or "",
        user_name=data.user_name or "អតិថិជន"
    )
    return res

@app.get("/api/reviews")
async def get_customer_reviews(product_id: Optional[int] = None):
    res = await db.get_product_reviews(product_id)
    return res

# ─── 📊 FEATURE 2: DAILY DIGEST REPORT & SCHEDULER ───────────────────────────
@app.get("/api/admin/daily-digest")
async def get_admin_daily_digest(user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    digest = await db.get_daily_sales_digest()
    return {"status": "success", "data": digest}

async def daily_digest_midnight_worker():
    """Background worker sending daily summary digest to Admins every midnight."""
    await asyncio.sleep(25)
    while True:
        try:
            import datetime
            now = datetime.datetime.now()
            next_midnight = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=5, microsecond=0)
            sleep_secs = max(60, (next_midnight - now).total_seconds())
            await asyncio.sleep(sleep_secs)

            if tg_app and tg_app.bot:
                digest = await db.get_daily_sales_digest()
                low_stock_str = "គ្មាន"
                if digest.get("low_stock_products"):
                    low_stock_str = "\n".join([f"  • {p['name']}: សល់ {p['stock_count']} Accounts" for p in digest["low_stock_products"]])

                msg = (
                    f"📊 <b>របាយការណ៍លក់សង្ខេបប្រចាំថ្ងៃ ({digest['date']})</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🛒 Orders ជោគជ័យ៖ <b>{digest['today_orders']} Orders</b>\n"
                    f"💰 ប្រាក់ចំណូលថ្ងៃនេះ៖ <b>${digest['today_revenue']:.2f} USD</b>\n"
                    f"👤 អតិថិជនថ្មីថ្ងៃនេះ៖ <b>{digest['new_users']} នាក់</b>\n"
                    f"⏳ Orders កំពុងរង់ចាំ Approve៖ <b>{digest['pending_orders']} Orders</b>\n\n"
                    f"⚠️ <b>ទំនិញសល់ស្តុកទាប (Low Stock)：</b>\n{low_stock_str}\n\n"
                    f"💡 <i>ចូលមើល Dashboard ពេញលេញតាម Mini App Admin Panel!</i>"
                )
                for admin_id in get_admin_ids():
                    try:
                        await tg_app.bot.send_message(chat_id=admin_id, text=msg, parse_mode="HTML")
                    except Exception as e:
                        logger.error(f"Failed to send daily digest to admin {admin_id}: {e}")
        except Exception as err:
            logger.error(f"Daily digest worker error: {err}")
            await asyncio.sleep(3600)

# ─── 🧧 FEATURE 2: LUCKY ANGPAO / RED PACKET APIS ─────────────────────────────
class CreateAngpaoRequest(BaseModel):
    creator_id: int
    creator_name: Optional[str] = "Sponsor"
    total_amount: float
    total_slots: int
    message: Optional[str] = None

@app.post("/api/angpao/create")
async def create_angpao_endpoint(data: CreateAngpaoRequest):
    admin_free = is_admin(data.creator_id)
    res = await db.create_lucky_angpao(
        creator_id=data.creator_id,
        creator_name=data.creator_name or "Sponsor",
        total_amount=data.total_amount,
        total_slots=data.total_slots,
        message=data.message,
        is_admin_free=admin_free
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    
    bot_username = "digital_store_bot"
    if tg_app and tg_app.bot:
        try:
            me = await tg_app.bot.get_me()
            bot_username = me.username
        except Exception:
            pass

    share_link = f"https://t.me/{bot_username}?start=angpao_{res['code']}"
    res["share_link"] = share_link
    return res

@app.get("/api/angpao/{code}")
async def get_angpao_info_endpoint(code: str):
    angpao = await db.get_angpao_details(code)
    if not angpao:
        raise HTTPException(status_code=404, detail="រកមិនឃើញកញ្ចប់អាំងប៉ាវនេះទេ!")
    return {"status": "success", "data": angpao}

class ClaimAngpaoRequest(BaseModel):
    user_id: int
    user_name: Optional[str] = "អតិថិជន"

@app.post("/api/angpao/{code}/claim")
async def claim_angpao_endpoint(code: str, data: ClaimAngpaoRequest):
    res = await db.claim_lucky_angpao(code, data.user_id, data.user_name)
    return res

# ─── 🔔 FEATURE 3: BACK-IN-STOCK NOTIFICATIONS API ────────────────────────────
class StockNotifyRequest(BaseModel):
    user_id: int

@app.post("/api/products/{product_id}/notify-stock")
async def subscribe_product_stock_alert(product_id: int, data: StockNotifyRequest):
    res = await db.subscribe_stock_notification(product_id, data.user_id)
    return res

# ─── 💵 WALLET TOP-UP & INSTANT 1-TAP PURCHASE APIS ───────────────────────────

@app.post("/api/wallet/deposit")
async def wallet_deposit_endpoint(
    user_id: int = Form(...),
    amount: float = Form(...),
    proof_file: UploadFile = File(...)
):
    if amount < 0.50:
        raise HTTPException(status_code=400, detail="ទឹកប្រាក់បញ្ចូលអប្បបរមាគឺ $0.50 USD")

    if not proof_file or not proof_file.filename:
        raise HTTPException(status_code=400, detail="សូមជ្រើសរើសរូបភាព Slip បង់ប្រាក់!")

    # Save slip image
    import time
    filename = f"topup_{user_id}_{int(time.time())}_{proof_file.filename.replace(' ', '_')}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(proof_file.file, buffer)

    user = await db.get_user(user_id)
    user_name = user.get("full_name") if user else f"User {user_id}"
    username = user.get("username") if user else None

    # Create topup request in DB
    res = await db.create_topup_request(user_id, user_name, username, amount, f"/uploads/{filename}")
    if res.get("status") != "success":
        raise HTTPException(status_code=400, detail=res.get("message"))

    topup_id = res["topup_id"]

    # Send instant Telegram Alert to Admins with Photo & Approve/Reject buttons
    if tg_app and tg_app.bot:
        from telegram import InlineKeyboardMarkup, InlineKeyboardButton
        caption = (
            f"💵 <b>សំណើបញ្ចូលប្រាក់ថ្មី (New Top-Up Request)</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"🆔 Top-Up ID: <code>#{topup_id}</code>\n"
            f"👤 អតិថិជន: <b>{html.escape(user_name)}</b> (ID: <code>{user_id}</code>)\n"
            f"💰 ទឹកប្រាក់: <b>${amount:.2f} USD</b>\n"
            f"📅 ម៉ោង: <code>{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</code>\n\n"
            f"👇 <i>សូមពិនិត្យ Slip ហើយចុច Approve ឬ Reject ខាងក្រោម៖</i>"
        )
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ អនុម័ត (Approve)", callback_data=f"approve_topup_{topup_id}"),
                InlineKeyboardButton("❌ បដិសេធ (Reject)", callback_data=f"reject_topup_{topup_id}")
            ]
        ])
        for admin_id in get_admin_ids():
            try:
                with open(file_path, "rb") as photo_file:
                    await tg_app.bot.send_photo(
                        chat_id=admin_id,
                        photo=photo_file,
                        caption=caption,
                        parse_mode="HTML",
                        reply_markup=kb
                    )
            except Exception as e:
                logger.error(f"Failed to send topup alert to admin {admin_id}: {e}")

    return res

@app.get("/api/admin/topups")
async def get_admin_topups(user_id: int):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        topups = await db.get_pending_topup_requests()
        return {"status": "success", "data": topups}
    except Exception as e:
        logger.error(f"Failed to fetch admin topups: {e}")
        return {"status": "error", "message": str(e), "data": []}

@app.post("/api/admin/topups/{topup_id}/approve")
async def admin_approve_topup(topup_id: int, user_id: int = Form(...)):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.approve_topup_request(topup_id)
    if res.get("status") == "success":
        data = res["data"]
        # Send confirmation Telegram DM to customer
        if tg_app and tg_app.bot:
            try:
                msg = (
                    f"🎉 <b>ការបញ្ចូលប្រាក់របស់អ្នកត្រូវបានអនុម័ត! (Top-Up Approved)</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"💰 ទឹកប្រាក់បានបញ្ចូល៖ <b>+${data['amount']:.2f} USD</b>\n"
                    f"💳 សមតុល្យ Wallet បច្ចុប្បន្ន៖ <b>${data['new_balance']:.2f} USD</b>\n\n"
                    f"✨ <i>ឥឡូវនេះលោកអ្នកអាចប្រើប្រាស់សមតុល្យ Wallet ដើម្បីទិញទំនិញបានភ្លាមៗ 1-Second Auto Delivery!</i>"
                )
                await tg_app.bot.send_message(chat_id=data["user_id"], text=msg, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Failed to send topup approval DM to {data['user_id']}: {e}")
    return res

@app.post("/api/admin/topups/{topup_id}/reject")
async def admin_reject_topup(topup_id: int, user_id: int = Form(...), reason: Optional[str] = Form("Slip មិនត្រឹមត្រូវ")):
    if not is_admin(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.reject_topup_request(topup_id, reason or "Slip មិនត្រឹមត្រូវ")
    if res.get("status") == "success":
        data = res["data"]
        if tg_app and tg_app.bot:
            try:
                msg = (
                    f"❌ <b>ការបញ្ចូលប្រាក់មិនទទួលបានជោគជ័យ (Top-Up Rejected)</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"💰 ទឹកប្រាក់៖ <b>${data['amount']:.2f} USD</b>\n"
                    f"📝 មូលហេតុ៖ <i>{data['admin_note']}</i>\n\n"
                    f"💡 <i>សូមពិនិត្យមើល Slip ឬទំនាក់ទំនងមកកាន់ Admin ប្រសិនបើមានចម្ងល់។</i>"
                )
                await tg_app.bot.send_message(chat_id=data["user_id"], text=msg, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Failed to send topup rejection DM to {data['user_id']}: {e}")
    return res

class WalletBuyRequest(BaseModel):
    user_id: int
    product_id: int
    promo_code: Optional[str] = None
    quantity: Optional[int] = 1

@app.post("/api/orders/wallet-buy")
async def buy_order_via_wallet(data: WalletBuyRequest):
    res = await db.instant_buy_product_wallet(data.user_id, data.product_id, data.promo_code, data.quantity or 1)
    if res.get("status") == "insufficient_balance":
        raise HTTPException(status_code=400, detail=res.get("message"))
    if res.get("status") == "out_of_stock":
        raise HTTPException(status_code=400, detail=res.get("message"))
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))

    # Send delivered account to Telegram DM & follow up with Star Rating Request
    if res.get("status") == "success":
        try:
            bot_inst = tg_app.bot if (tg_app and tg_app.bot) else None
            qty = res.get("quantity") or 1
            await send_account_delivery_dm(
                user_id=data.user_id,
                order_id=res["order_id"],
                product_name=res["product_name"],
                credentials=res["credentials"],
                expiry_date=res["expiry_date"],
                quantity=qty,
                tg_bot=bot_inst
            )
            
            # Send Star Rating Request Prompt & Public Channel alert
            asyncio.create_task(send_order_review_request(data.user_id, res["order_id"], data.product_id, res["product_name"]))
            asyncio.create_task(send_purchase_alert(data.user_id, res["product_name"], qty))
        except Exception as e:
            logger.error(f"Failed to send wallet buy DM: {e}")

    return res

async def send_order_review_request(user_id: int, order_id: int, product_id: int, product_name: str):
    """Send interactive star rating prompt to customer with instant bonus."""
    if not (tg_app and tg_app.bot):
        return
    await asyncio.sleep(2) # send shortly after credentials
    try:
        safe_pname = html.escape(product_name)
        msg = (
            f"⭐ <b>តើលោកអ្នកពេញចិត្តនឹងសេវាកម្មរបស់យើងខ្ញុំដែរឬទេ?</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"📦 ទំនិញ៖ <b>{safe_pname}</b> (Order #{order_id})\n\n"
            f"💡 <i>សូមចុចផ្ដល់ពិន្ទុផ្កាយ (Rating) ខាងក្រោមដើម្បីជួយកែលម្អសេវាកម្ម និងទទួលបានរង្វាន់ <b>+$0.05 USD</b> ចូល Wallet ភ្លាមៗ!</i>"
        )
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("⭐ 1", callback_data=f"rate_{order_id}_{product_id}_1"),
                InlineKeyboardButton("⭐⭐ 2", callback_data=f"rate_{order_id}_{product_id}_2"),
                InlineKeyboardButton("⭐⭐⭐ 3", callback_data=f"rate_{order_id}_{product_id}_3"),
            ],
            [
                InlineKeyboardButton("⭐⭐⭐⭐ 4", callback_data=f"rate_{order_id}_{product_id}_4"),
                InlineKeyboardButton("⭐⭐⭐⭐⭐ 5 (ល្អឥតខ្ចោះ)", callback_data=f"rate_{order_id}_{product_id}_5"),
            ]
        ])
        await tg_app.bot.send_message(chat_id=user_id, text=msg, parse_mode="HTML", reply_markup=kb)
    except Exception as e:
        logger.error(f"Failed to send review request to {user_id}: {e}")

# ─── ⭐ CUSTOMER REVIEWS & RATINGS APIS ──────────────────────────────────────
@app.get("/api/reviews/recent")
async def get_recent_reviews():
    reviews = await db.get_recent_customer_reviews(limit=15)
    return {"status": "success", "data": reviews}

@app.get("/api/products/{product_id}/reviews")
async def get_product_reviews(product_id: int):
    data = await db.get_product_reviews_list(product_id)
    return data


class ReviewSubmitRequest(BaseModel):
    order_id: Optional[int] = None
    product_id: int
    user_id: int
    full_name: str
    username: Optional[str] = None
    rating: int = 5
    comment: Optional[str] = ""

@app.post("/api/reviews/submit")
async def submit_review_api(data: ReviewSubmitRequest):
    res = await db.save_customer_rating(
        order_id=data.order_id,
        product_id=data.product_id,
        user_id=data.user_id,
        full_name=data.full_name,
        username=data.username,
        rating=data.rating,
        comment=data.comment
    )
    return res

# ─── ⚡ FLASH SALE & RESTOCK NOTIFICATION APIS ─────────────────────────────
class StockSubscribeRequest(BaseModel):
    user_id: int

@app.post("/api/products/{product_id}/subscribe-stock")
async def subscribe_stock(product_id: int, data: StockSubscribeRequest):
    res = await db.subscribe_stock_notification(data.user_id, product_id)
    return res

@app.get("/api/flash-sale")
async def get_flash_sale_status():
    fs = await db.get_active_flash_sale()
    return {"status": "success", "data": fs}

class FlashSaleConfigRequest(BaseModel):
    admin_id: int
    title: Optional[str] = "⚡ MEGA FLASH SALE ⚡"
    discount_pct: float
    duration_hours: float
    is_active: Optional[int] = 1

@app.post("/api/admin/flash-sale")
async def admin_set_flash_sale(data: FlashSaleConfigRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.set_flash_sale(data.title or "⚡ MEGA FLASH SALE ⚡", data.discount_pct, data.duration_hours, data.is_active or 1)
    
    # Broadcast Flash Sale to all users via Telegram
    if tg_app and tg_app.bot and data.is_active:
        try:
            safe_title = html.escape(data.title or "MEGA FLASH SALE")
            flash_msg = (
                f"⚡ <b>{safe_title}</b> ⚡\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n"
                f"🔥 បញ្ចុះតម្លៃពិសេស៖ <b>-{data.discount_pct:.0f}% OFF</b> គ្រប់មុខទំនិញទាំងអស់!\n"
                f"⏳ រយៈពេលកំណត់៖ <b>{data.duration_hours:.0f} ម៉ោងប៉ុណ្ណោះ!</b>\n\n"
                f"🚀 <i>សូមប្រញាប់ចូលទៅកាន់ Mini App ដើម្បីរីករាយជាមួយតម្លៃពិសេសមុនពេលផុតកំណត់!</i>"
            )
            asyncio.create_task(send_telegram_alert(flash_msg))
        except Exception as e:
            logger.error(f"Flash sale alert broadcast error: {e}")
            
    return res

class FlashSaleToggleRequest(BaseModel):
    admin_id: int
    is_active: int

@app.post("/api/admin/flash-sale/toggle")
async def admin_toggle_flash_sale(data: FlashSaleToggleRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.toggle_flash_sale(data.is_active)
    return res

# ─── 🎟️ PROMO CODES APIS ───────────────────────────────────────────────────
class PromoVerifyRequest(BaseModel):
    code: str
    total_price: float

@app.post("/api/promo/verify")
async def verify_promo(data: PromoVerifyRequest):
    return await db.verify_promo_code(data.code, data.total_price)

@app.get("/api/admin/promos")
async def admin_get_promos(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    promos = await db.get_all_promo_codes()
    return {"status": "success", "data": promos}

class PromoCreateRequest(BaseModel):
    admin_id: int
    code: str
    discount_percent: Optional[float] = 0.0
    discount_amount: Optional[float] = 0.0
    min_spend: Optional[float] = 0.0
    max_uses: Optional[int] = 100

@app.post("/api/admin/promos")
async def admin_create_promo(data: PromoCreateRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.create_promo_code(
        code=data.code,
        discount_percent=data.discount_percent or 0.0,
        discount_amount=data.discount_amount or 0.0,
        min_spend=data.min_spend or 0.0,
        max_uses=data.max_uses or 100
    )
    return res

class PromoToggleRequest(BaseModel):
    admin_id: int
    is_active: int

@app.post("/api/admin/promos/{promo_id}/toggle")
async def admin_toggle_promo(promo_id: int, data: PromoToggleRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    return await db.toggle_promo_code(promo_id, data.is_active)

@app.delete("/api/admin/promos/{promo_id}")
async def admin_delete_promo(promo_id: int, admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    return await db.delete_promo_code(promo_id)

# ─── 📊 ADMIN ANALYTICS APIS ──────────────────────────────────────────────────
@app.get("/api/admin/analytics")
async def admin_get_analytics(admin_id: Optional[int] = None, user_id: Optional[int] = None):
    effective_id = admin_id or user_id
    if not effective_id or not is_admin(effective_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    data = await db.get_admin_analytics_data()
    data["data"] = {**data}
    return data

# ─── 👥 ADMIN USER & ROLE MANAGEMENT APIS ─────────────────────────────────────

@app.get("/api/admin/users")
async def admin_get_users_list(
    admin_id: int,
    search: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    return await db.admin_get_users(search=search, role_filter=role, limit=limit, offset=offset)

@app.get("/api/admin/users/{target_user_id}")
async def admin_get_user_info(target_user_id: int, admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.admin_get_user_details(target_user_id)
    if res.get("status") == "error":
        raise HTTPException(status_code=404, detail="User not found")
    return res

class AdminUpdateRoleRequest(BaseModel):
    admin_id: int
    new_role: str

@app.post("/api/admin/users/{target_user_id}/role")
async def admin_change_user_role(target_user_id: int, data: AdminUpdateRoleRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.admin_update_user_role(target_user_id, data.new_role, data.admin_id)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

class AdminAdjustBalanceRequest(BaseModel):
    admin_id: int
    amount: float
    reason: Optional[str] = "Admin Manual Adjustment"

@app.post("/api/admin/users/{target_user_id}/balance")
async def admin_change_user_balance(target_user_id: int, data: AdminAdjustBalanceRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = await db.admin_adjust_user_balance(target_user_id, data.amount, data.reason or "", data.admin_id)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

class AdminToggleBanRequest(BaseModel):
    admin_id: int
    is_banned: bool
    reason: Optional[str] = None

@app.post("/api/admin/users/{target_user_id}/ban")
async def admin_toggle_user_ban_api(target_user_id: int, data: AdminToggleBanRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    return await db.admin_toggle_user_ban(target_user_id, data.is_banned, data.reason)


# ─────────────────────────────────────────────────────────────
# 🎧 CUSTOMER SUPPORT TICKETS & ADMIN REPLIES
# ─────────────────────────────────────────────────────────────

class SupportTicketCreateRequest(BaseModel):
    user_id: int
    user_name: str
    subject: Optional[str] = "General Support"
    message: str

@app.post("/api/support/ticket")
async def create_customer_support_ticket(data: SupportTicketCreateRequest):
    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    res = await db.create_support_ticket(
        user_id=data.user_id,
        user_name=data.user_name,
        message=data.message.strip(),
        subject=data.subject or "General Support"
    )
    
    if res.get("status") != "success":
        raise HTTPException(status_code=500, detail=res.get("message"))
    
    ticket_id = res.get("ticket_id")
    
    # Send instant Telegram Alert to all Admins
    if tg_app and tg_app.bot:
        for admin_id in get_admin_ids():
            try:
                admin_alert = (
                    f"🎧 <b>មានសំណួរ/សារជំនួយអតិថិជនថ្មី! (New Support Ticket)</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🎫 Ticket ID: <b>#{ticket_id}</b>\n"
                    f"👤 ឈ្មោះ: <b>{html.escape(data.user_name)}</b>\n"
                    f"🆔 User ID: <code>{data.user_id}</code>\n"
                    f"📌 ប្រធានបទ: <b>{html.escape(data.subject or 'General')}</b>\n"
                    f"💬 សំណួរ/សារ:\n<i>{html.escape(data.message)}</i>\n\n"
                    f"👉 ចូលទៅកាន់ Admin Dashboard -> '🎧 សេវាអតិថិជន' ដើម្បីឆ្លើយតប!"
                )
                await tg_app.bot.send_message(chat_id=admin_id, text=admin_alert, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Error alerting admin {admin_id} for support ticket: {e}")
                
    return res

@app.get("/api/user/{user_id}/support-tickets")
async def get_customer_support_tickets(user_id: int):
    tickets = await db.get_user_support_tickets(user_id)
    return {"status": "success", "data": tickets}

@app.get("/api/admin/support-tickets")
async def admin_get_support_tickets(admin_id: int, status: Optional[str] = None):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    tickets = await db.get_support_tickets(status=status)
    return {"status": "success", "data": tickets}

class SupportTicketReplyRequest(BaseModel):
    admin_id: int
    reply_text: str
    replied_by: Optional[str] = "Admin"

@app.post("/api/admin/support-tickets/{ticket_id}/reply")
async def admin_reply_customer_ticket(ticket_id: int, data: SupportTicketReplyRequest):
    if not is_admin(data.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not data.reply_text or not data.reply_text.strip():
        raise HTTPException(status_code=400, detail="Reply text cannot be empty")
        
    ticket = await db.get_support_ticket_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
        
    res = await db.reply_support_ticket(
        ticket_id=ticket_id,
        admin_reply=data.reply_text.strip(),
        replied_by=data.replied_by or "Admin Support"
    )
    
    if res.get("status") != "success":
        raise HTTPException(status_code=500, detail=res.get("message"))
        
    # Send instant Telegram Notification to customer!
    if tg_app and tg_app.bot:
        try:
            user_msg = (
                f"🎧 <b>ការឆ្លើយតបពី Admin (Digital Premium Store Support)</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n"
                f"🎫 សំបុត្រជំនួយ #{ticket_id} — <b>{html.escape(ticket.get('subject') or 'General')}</b>\n\n"
                f"❓ <b>សំណួររបស់អ្នក៖</b>\n<i>{html.escape(ticket.get('message') or '')}</i>\n\n"
                f"💬 <b>ចម្លើយពី Admin៖</b>\n<b>{html.escape(data.reply_text.strip())}</b>\n\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n"
                f"✨ សូមអរគុណដែលបានទាក់ទងមកកាន់យើងខ្ញុំ!"
            )
            kb = None
            if WEBAPP_URL:
                kb = InlineKeyboardMarkup([
                    [InlineKeyboardButton("📱 បើក Mini App", web_app=WebAppInfo(url=WEBAPP_URL))]
                ])
            await tg_app.bot.send_message(chat_id=ticket["user_id"], text=user_msg, parse_mode="HTML", reply_markup=kb)
        except Exception as e:
            logger.error(f"Error sending reply message to user {ticket['user_id']}: {e}")
            
    return res


# ─────────────────────────────────────────────────────────────
# 🎁 FREE VIP GIVEAWAYS ENGINE & TELEGRAM MEMBERSHIP VERIFICATION
# ─────────────────────────────────────────────────────────────

async def verify_chat_membership(bot, chat_id: str, user_id: int) -> bool:
    """Check if user is a member of the required Telegram group or channel."""
    if not bot:
        # Standalone development fallback
        return True
    try:
        clean_chat = str(chat_id).strip()
        if "t.me/" in clean_chat:
            clean_chat = "@" + clean_chat.split("t.me/")[-1].strip("/").split("?")[0]
        elif not clean_chat.startswith("@") and not clean_chat.startswith("-"):
            clean_chat = f"@{clean_chat}"
            
        member = await bot.get_chat_member(chat_id=clean_chat, user_id=int(user_id))
        status = getattr(member, "status", None)
        if hasattr(status, "value"):
            status = status.value
        status = str(status).lower()
        
        # Valid active statuses
        if status in ["creator", "administrator", "member"]:
            return True
        elif status == "restricted":
            return bool(getattr(member, "is_member", True))
        return False
    except Exception as e:
        logger.info(f"Membership check for user {user_id} in {chat_id}: {e}")
        return False


@app.get("/api/giveaways")
async def get_giveaways_api(user_id: Optional[int] = None):
    """Retrieve all active giveaways with stock count and claim status for user."""
    giveaways = await db.get_active_giveaways(user_id=user_id)
    return {"status": "success", "data": giveaways}


@app.get("/api/giveaways/{giveaway_id}/membership")
async def check_giveaway_membership(giveaway_id: int, user_id: int):
    """Check whether a user has joined the required channel and group."""
    giveaway = await db.get_giveaway(giveaway_id)
    if not giveaway:
        raise HTTPException(status_code=404, detail="Giveaway not found")
    
    req_channel = giveaway.get("required_channel") or "@smarttech_digital"
    req_group = giveaway.get("required_group") or "@smarttech_digitals"
    
    bot_inst = tg_app.bot if (tg_app and tg_app.bot) else None
    joined_channel = await verify_chat_membership(bot_inst, req_channel, user_id)
    joined_group = await verify_chat_membership(bot_inst, req_group, user_id)
    
    return {
        "status": "success",
        "joined_channel": joined_channel,
        "joined_group": joined_group,
        "all_joined": joined_channel and joined_group,
        "channel_username": req_channel,
        "group_username": req_group,
        "channel_link": giveaway.get("invite_link") or "https://t.me/smarttech_digital",
        "group_link": giveaway.get("group_invite_link") or "https://t.me/smarttech_digitals",
    }


class GiveawayClaimRequest(BaseModel):
    user_id: int
    full_name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None


@app.post("/api/giveaways/{giveaway_id}/claim")
async def claim_giveaway_api(giveaway_id: int, req: GiveawayClaimRequest):
    """Claim a free account after verifying user has joined both group and channel."""
    giveaway = await db.get_giveaway(giveaway_id)
    if not giveaway:
        raise HTTPException(status_code=404, detail="Giveaway not found")
    
    req_channel = giveaway.get("required_channel") or "@smarttech_digital"
    req_group = giveaway.get("required_group") or "@smarttech_digitals"
    
    channel_url = giveaway.get("invite_link") or "https://t.me/smarttech_digital"
    group_url = giveaway.get("group_invite_link") or "https://t.me/smarttech_digitals"
    
    bot_inst = tg_app.bot if (tg_app and tg_app.bot) else None
    joined_channel = await verify_chat_membership(bot_inst, req_channel, req.user_id)
    joined_group = await verify_chat_membership(bot_inst, req_group, req.user_id)
    
    if not (joined_channel and joined_group):
        missing_parts = []
        if not joined_channel:
            missing_parts.append("Channel (@smarttech_digital)")
        if not joined_group:
            missing_parts.append("Group (@smarttech_digitals)")
        return {
            "status": "not_joined",
            "joined_channel": joined_channel,
            "joined_group": joined_group,
            "channel_link": channel_url,
            "group_link": group_url,
            "message": f"សូមចូលរួម {' និង '.join(missing_parts)} ជាមុនសិន ទើបអាចបើកយក Account Free បាន!"
        }
    
    # Process claim in database
    res = await db.claim_giveaway(
        giveaway_id=giveaway_id,
        user_id=req.user_id,
        full_name=req.full_name,
        username=req.username,
        photo_url=req.photo_url
    )
    
    # If claimed successfully, also send credentials to user via Telegram Bot DM
    if res.get("status") == "success" and bot_inst:
        try:
            g_title = giveaway.get("title", "Free VIP Account")
            creds = res.get("credentials", "")
            tg_msg = (
                f"🎁 <b>អបអរសាទរ! អ្នកបានទទួល Giveaway ឥតគិតថ្លៃ!</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n"
                f"📦 រង្វាន់៖ <b>{html.escape(g_title)}</b>\n"
                f"👤 អ្នកទទួល៖ <b>{html.escape(req.full_name)}</b>\n\n"
                f"🔑 <b>ព័ត៌មានគណនី (Credentials)៖</b>\n"
                f"<code>{html.escape(creds)}</code>\n\n"
                f"⚠️ <i>សូមរក្សាទុកព័ត៌មាននេះដោយប្រុងប្រយ័ត្ន! សូមអរគុណដែលបានចូលរួមជាមួយ SmartTech Digital!</i>"
            )
            await bot_inst.send_message(chat_id=req.user_id, text=tg_msg, parse_mode="HTML")
        except Exception as dm_err:
            logger.warning(f"Could not send DM giveaway to user {req.user_id}: {dm_err}")
            
    return res


# Admin Giveaway endpoints
@app.get("/api/admin/giveaways")
async def admin_get_giveaways_api(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    data = await db.admin_get_all_giveaways()
    return {"status": "success", "data": data}


class AdminCreateGiveawayRequest(BaseModel):
    admin_id: int
    title: str
    description: Optional[str] = ""
    duration_days: Optional[int] = 7
    image_url: Optional[str] = "https://cdn-icons-png.flaticon.com/512/3594/3594363.png"
    badge: Optional[str] = "🎁 FREE VIP"
    required_channel: Optional[str] = "@smarttech_digital"
    invite_link: Optional[str] = "https://t.me/smarttech_digital"
    required_group: Optional[str] = "@smarttech_digitals"
    group_invite_link: Optional[str] = "https://t.me/smarttech_digitals"
    credentials_text: Optional[str] = ""


@app.post("/api/admin/giveaways")
async def admin_create_giveaway_api(req: AdminCreateGiveawayRequest):
    if not is_admin(req.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    creds_list = [line.strip() for line in (req.credentials_text or "").split("\n") if line.strip()]
    gid = await db.admin_create_giveaway(
        title=req.title,
        description=req.description or "",
        duration_days=req.duration_days or 7,
        image_url=req.image_url or "",
        badge=req.badge or "🎁 FREE VIP",
        required_channel=req.required_channel or "@smarttech_digital",
        invite_link=req.invite_link or "https://t.me/smarttech_digital",
        required_group=req.required_group or "@smarttech_digitals",
        group_invite_link=req.group_invite_link or "https://t.me/smarttech_digitals",
        credentials_list=creds_list
    )
    return {"status": "success", "giveaway_id": gid, "stock_added": len(creds_list)}


class AdminAddStockRequest(BaseModel):
    admin_id: int
    credentials_text: str


@app.post("/api/admin/giveaways/{giveaway_id}/stock")
async def admin_add_giveaway_stock_api(giveaway_id: int, req: AdminAddStockRequest):
    if not is_admin(req.admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    creds_list = [line.strip() for line in req.credentials_text.split("\n") if line.strip()]
    added = await db.admin_add_giveaway_stock(giveaway_id, creds_list)
    return {"status": "success", "added": added}


@app.delete("/api/admin/giveaways/{giveaway_id}")
async def admin_delete_giveaway_api(giveaway_id: int, admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    await db.admin_delete_giveaway(giveaway_id)
    return {"status": "success", "message": "Giveaway deleted"}


@app.get("/api/admin/giveaways/{giveaway_id}/claims")
async def admin_get_giveaway_claims_api(giveaway_id: int, admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    claims = await db.admin_get_giveaway_claims(giveaway_id)
    return {"status": "success", "data": claims}


# ─── Customer Reviews API ───────────────────────────────────────────────────
class CustomerReviewRequest(BaseModel):
    user_id: int
    full_name: str
    username: Optional[str] = ""
    rating: int = 5
    comment: str
    order_id: Optional[int] = None


@app.post("/api/products/{product_id}/review")
async def add_product_review_api(product_id: int, req: CustomerReviewRequest):
    res = await db.add_customer_review(
        product_id=product_id,
        user_id=req.user_id,
        full_name=req.full_name,
        username=req.username or "",
        rating=req.rating,
        comment=req.comment,
        order_id=req.order_id
    )
    return res


@app.get("/api/products/{product_id}/reviews")
async def get_product_reviews_api(product_id: int, limit: int = 20):
    reviews = await db.get_product_reviews(product_id, limit=limit)
    return {"status": "success", "data": reviews}


@app.get("/api/reviews/recent")
async def get_recent_reviews_api(limit: int = 15):
    reviews = await db.get_recent_customer_reviews(limit=limit)
    return {"status": "success", "data": reviews}


# ─── Admin CSV / Excel Data Exports ──────────────────────────────────────────
@app.get("/api/admin/export/orders.csv")
async def export_orders_csv_api(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    orders = await db.get_orders_for_export()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Order ID", "User ID", "Customer Name", "Username", "Product Name", "Price (USD)", "Payment Method", "Status", "Note", "Created At", "Updated At"])
    for o in orders:
        writer.writerow([
            o.get("order_id", ""),
            o.get("user_id", ""),
            o.get("customer_name", ""),
            o.get("username", ""),
            o.get("product_name", ""),
            o.get("price", 0.0),
            o.get("payment_method", ""),
            o.get("status", ""),
            o.get("note", ""),
            o.get("created_at", ""),
            o.get("updated_at", "")
        ])
    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders_export.csv"}
    )


@app.get("/api/admin/export/topups.csv")
async def export_topups_csv_api(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    topups = await db.get_topups_for_export()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Topup ID", "User ID", "User Name", "Username", "Amount (USD)", "Payment Method", "Status", "Admin Note", "Created At"])
    for t in topups:
        writer.writerow([
            t.get("topup_id", ""),
            t.get("user_id", ""),
            t.get("user_name", ""),
            t.get("username", ""),
            t.get("amount", 0.0),
            t.get("payment_method", ""),
            t.get("status", ""),
            t.get("admin_note", ""),
            t.get("created_at", "")
        ])
    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=topups_export.csv"}
    )


@app.get("/api/admin/export/users.csv")
async def export_users_csv_api(admin_id: int):
    if not is_admin(admin_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    users = await db.get_users_for_export()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["User ID", "Username", "Full Name", "Balance (USD)", "Is Admin", "Referred By", "Created At"])
    for u in users:
        writer.writerow([
            u.get("user_id", ""),
            u.get("username", ""),
            u.get("full_name", ""),
            u.get("balance", 0.0),
            u.get("is_admin", 0),
            u.get("referred_by", ""),
            u.get("created_at", "")
        ])
    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"}
    )


# ─── Serve WebApp Frontend Static Files ───────────────────────────────────────
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")




