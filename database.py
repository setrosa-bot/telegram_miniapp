import aiosqlite
import os
import json
import logging
import datetime
from datetime import datetime as dt, timedelta
from typing import List, Dict, Any, Optional
from config import DATABASE_PATH, ADMIN_IDS


# Ensure data directory exists
os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# DATABASE INITIALIZATION
# ─────────────────────────────────────────────

async def init_db():
    """Initialize database tables and seed default categories/products if empty."""

    async with aiosqlite.connect(DATABASE_PATH) as db:

        # ─── Users ────────────────────────────

        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id      INTEGER PRIMARY KEY,
                username     TEXT,
                full_name    TEXT,
                photo_url    TEXT,
                is_admin     INTEGER DEFAULT 0,
                balance      REAL DEFAULT 0.0,
                referred_by  INTEGER,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        await db.commit()

        # ─── Other Tables ─────────────────────

        await db.executescript("""

            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                amount      REAL NOT NULL,
                type        TEXT NOT NULL,
                description TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                REFERENCES users(user_id)
            );


            CREATE TABLE IF NOT EXISTS categories (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT NOT NULL,
                slug    TEXT UNIQUE NOT NULL,
                icon    TEXT DEFAULT '📦'
            );


            CREATE TABLE IF NOT EXISTS products (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id   INTEGER,
                name          TEXT NOT NULL,
                description   TEXT,
                price         REAL NOT NULL,
                duration_days INTEGER DEFAULT 30,
                image_url     TEXT,
                is_active     INTEGER DEFAULT 1,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (category_id)
                REFERENCES categories(id)
            );


            CREATE TABLE IF NOT EXISTS stock_items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL,
                credentials TEXT NOT NULL,
                is_sold     INTEGER DEFAULT 0,
                order_id    INTEGER,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (product_id)
                REFERENCES products(id)
            );


            CREATE TABLE IF NOT EXISTS orders (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id        INTEGER NOT NULL,
                product_id     INTEGER NOT NULL,
                product_name   TEXT NOT NULL,
                price          REAL NOT NULL,
                payment_method TEXT,
                proof_file     TEXT,
                status         TEXT DEFAULT 'pending',
                note           TEXT,
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                REFERENCES users(user_id),

                FOREIGN KEY (product_id)
                REFERENCES products(id)
            );


            CREATE TABLE IF NOT EXISTS delivered_accounts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id     INTEGER NOT NULL,
                user_id      INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                credentials  TEXT NOT NULL,
                expiry_date  TEXT,
                delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (order_id)
                REFERENCES orders(id)
            );


            CREATE TABLE IF NOT EXISTS broadcast_alerts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                message     TEXT NOT NULL,
                product_id  INTEGER,
                sent_count  INTEGER DEFAULT 0,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS replacement_requests (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id             INTEGER NOT NULL,
                buyer_name          TEXT NOT NULL,
                product_name        TEXT NOT NULL,
                purchase_date       TEXT,
                expiry_date         TEXT,
                problem_credentials TEXT NOT NULL,
                issue_description   TEXT,
                status              TEXT DEFAULT 'pending',
                admin_note          TEXT,
                new_credentials     TEXT,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS daily_spins (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL,
                reward_type  TEXT NOT NULL,
                reward_value REAL NOT NULL,
                reward_label TEXT NOT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS promo_codes (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                code             TEXT UNIQUE NOT NULL,
                discount_percent REAL DEFAULT 0.0,
                discount_amount  REAL DEFAULT 0.0,
                min_spend        REAL DEFAULT 0.0,
                max_uses         INTEGER DEFAULT 1000,
                used_count       INTEGER DEFAULT 0,
                is_active        INTEGER DEFAULT 1,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS daily_checkins (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                reward_amount   REAL NOT NULL,
                reward_type     TEXT DEFAULT 'wallet_cash',
                checked_in_date TEXT,
                claimed_date    TEXT,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS customer_reviews (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id    INTEGER,
                product_id  INTEGER NOT NULL,
                user_id     INTEGER NOT NULL,
                full_name   TEXT,
                username    TEXT,
                rating      INTEGER DEFAULT 5,
                comment     TEXT,
                is_verified INTEGER DEFAULT 1,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS angpaos (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                code             TEXT UNIQUE NOT NULL,
                creator_id       INTEGER NOT NULL,
                creator_name     TEXT,
                total_amount     REAL NOT NULL,
                remaining_amount REAL NOT NULL,
                total_slots      INTEGER NOT NULL,
                claimed_slots    INTEGER DEFAULT 0,
                message          TEXT,
                is_active        INTEGER DEFAULT 1,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS lucky_angpaos (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                code            TEXT UNIQUE NOT NULL,
                creator_id      INTEGER NOT NULL,
                creator_name    TEXT,
                total_amount    REAL NOT NULL,
                total_slots     INTEGER NOT NULL,
                remaining_amount REAL NOT NULL,
                remaining_slots INTEGER NOT NULL,
                blessing_msg    TEXT,
                is_active       INTEGER DEFAULT 1,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS angpao_claims (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                angpao_id   INTEGER NOT NULL,
                user_id     INTEGER NOT NULL,
                user_name   TEXT,
                full_name   TEXT,
                username    TEXT,
                amount      REAL DEFAULT 0.0,
                win_amount  REAL DEFAULT 0.0,
                claimed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS wallet_topup_requests (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL,
                full_name    TEXT,
                username    TEXT,
                amount       REAL NOT NULL,
                proof_image  TEXT,
                status       TEXT DEFAULT 'pending',
                admin_note   TEXT,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE VIEW IF NOT EXISTS topup_requests AS SELECT * FROM wallet_topup_requests;

            CREATE TABLE IF NOT EXISTS reseller_applications (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                full_name   TEXT,
                username    TEXT,
                contact     TEXT,
                reason      TEXT,
                status      TEXT DEFAULT 'pending',
                admin_note  TEXT,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS flash_sales (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL DEFAULT '⚡ MEGA FLASH SALE ⚡',
                discount_pct REAL DEFAULT 20.0,
                end_time    TEXT NOT NULL,
                is_active   INTEGER DEFAULT 1,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stock_notifications (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL,
                user_id     INTEGER NOT NULL,
                is_notified INTEGER DEFAULT 0,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(product_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS giveaways (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                title            TEXT NOT NULL,
                description      TEXT,
                image_url        TEXT,
                badge            TEXT DEFAULT '🎁 FREE VIP',
                duration_days    INTEGER DEFAULT 7,
                required_channel TEXT,
                invite_link      TEXT,
                required_group   TEXT DEFAULT '@smarttech_digitals',
                group_invite_link TEXT DEFAULT 'https://t.me/smarttech_digitals',
                is_active        INTEGER DEFAULT 1,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS giveaway_stock (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                giveaway_id INTEGER NOT NULL,
                credentials TEXT NOT NULL,
                is_claimed  INTEGER DEFAULT 0,
                claimed_by  INTEGER,
                claimed_at  TIMESTAMP,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS giveaway_claims (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                giveaway_id   INTEGER NOT NULL,
                user_id       INTEGER NOT NULL,
                full_name     TEXT,
                username      TEXT,
                photo_url     TEXT,
                stock_item_id INTEGER,
                credentials   TEXT NOT NULL,
                claimed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS support_tickets (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL,
                user_name     TEXT,
                subject       TEXT,
                message       TEXT NOT NULL,
                status        TEXT DEFAULT 'pending',
                admin_reply   TEXT,
                replied_by    TEXT,
                replied_at    TIMESTAMP,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

        """)

        await db.commit()

        # Safe Column Migrations & PRAGMAs
        try:
            await db.execute("PRAGMA journal_mode=WAL;")
        except Exception:
            pass

        migrations = [
            "ALTER TABLE users ADD COLUMN referred_by INTEGER;",
            "ALTER TABLE users ADD COLUMN total_spent REAL DEFAULT 0.0;",
            "ALTER TABLE users ADD COLUMN vip_tier TEXT DEFAULT 'bronze';",
            "ALTER TABLE users ADD COLUMN referral_rewards REAL DEFAULT 0.0;",
            "ALTER TABLE users ADD COLUMN reseller_status TEXT DEFAULT 'none';",
            "ALTER TABLE users ADD COLUMN reseller_reason TEXT;",
            "ALTER TABLE users ADD COLUMN reseller_contact TEXT;",
            "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';",
            "ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN ban_reason TEXT;",
            "ALTER TABLE users ADD COLUMN photo_url TEXT;",
            "ALTER TABLE users ADD COLUMN last_active_at TEXT;",
            "ALTER TABLE products ADD COLUMN reseller_price REAL;",
            "ALTER TABLE products ADD COLUMN badge TEXT;",
            "ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1;",
            "ALTER TABLE orders ADD COLUMN expiry_date TEXT;",
            "ALTER TABLE orders ADD COLUMN reminder_sent INTEGER DEFAULT 0;",
            "ALTER TABLE delivered_accounts ADD COLUMN reminder_sent INTEGER DEFAULT 0;",
            "ALTER TABLE daily_checkins ADD COLUMN reward_type TEXT DEFAULT 'wallet_cash';",
            "ALTER TABLE daily_checkins ADD COLUMN checked_in_date TEXT;",
            "ALTER TABLE daily_checkins ADD COLUMN claimed_date TEXT;",
            "ALTER TABLE giveaways ADD COLUMN required_group TEXT DEFAULT '@smarttech_digitals';",
            "ALTER TABLE giveaways ADD COLUMN group_invite_link TEXT DEFAULT 'https://t.me/smarttech_digitals';",
            "ALTER TABLE angpao_claims ADD COLUMN user_name TEXT;",
            "ALTER TABLE angpao_claims ADD COLUMN amount REAL DEFAULT 0.0;",
            "ALTER TABLE angpaos ADD COLUMN message TEXT;",
            "ALTER TABLE angpaos ADD COLUMN claimed_slots INTEGER DEFAULT 0;",
        ]
        for mig in migrations:
            try:
                await db.execute(mig)
                await db.commit()
            except Exception:
                pass

        try:
            await db.execute("UPDATE daily_checkins SET checked_in_date = claimed_date WHERE (checked_in_date IS NULL OR checked_in_date = '') AND claimed_date IS NOT NULL;")
            await db.execute("UPDATE daily_checkins SET claimed_date = checked_in_date WHERE (claimed_date IS NULL OR claimed_date = '') AND checked_in_date IS NOT NULL;")
            await db.commit()
        except Exception:
            pass


        # Seed default promo codes if empty
        async with db.execute("SELECT COUNT(*) FROM promo_codes") as cursor:
            promo_cnt = (await cursor.fetchone())[0]
            if promo_cnt == 0:
                await db.executescript("""
                    INSERT INTO promo_codes (code, discount_percent, discount_amount, min_spend, max_uses)
                    VALUES 
                    ('WELCOME10', 10.0, 0.0, 0.0, 500),
                    ('VIP20', 20.0, 0.0, 2.0, 200),
                    ('LUCKY50', 0.0, 0.50, 1.5, 300);
                """)
                await db.commit()

        # Seed default giveaways if empty
        async with db.execute("SELECT COUNT(*) FROM giveaways") as cursor:
            g_cnt = (await cursor.fetchone())[0]
            if g_cnt == 0:
                await db.execute("""
                    INSERT INTO giveaways (title, description, image_url, badge, duration_days, required_channel, invite_link)
                    VALUES (
                        'CapCut Pro (7 ថ្ងៃ Free)',
                        'ចែកជូន Free សម្រាប់សមាជិក Group & Channel Telegram! Join Group រួចចុចយកភ្លាមៗ',
                        '/images/capcut.svg',
                        '🎁 FREE VIP',
                        7,
                        '@smarttech_digital',
                        'https://t.me/smarttech_digital'
                    )
                """)
                await db.commit()

                # Get inserted giveaway id
                async with db.execute("SELECT id FROM giveaways ORDER BY id DESC LIMIT 1") as g_cur:
                    new_g_id = (await g_cur.fetchone())[0]
                    sample_creds = [
                        "capcut_free1@digitalstore.com|FreePass#101|Profile 1",
                        "capcut_free2@digitalstore.com|FreePass#102|Profile 2",
                        "capcut_free3@digitalstore.com|FreePass#103|Profile 3",
                        "capcut_free4@digitalstore.com|FreePass#104|Profile 4",
                        "capcut_free5@digitalstore.com|FreePass#105|Profile 5"
                    ]
                    for cred in sample_creds:
                        await db.execute(
                            "INSERT INTO giveaway_stock (giveaway_id, credentials) VALUES (?, ?)",
                            (new_g_id, cred)
                        )
                    await db.commit()


        # ─────────────────────────────────────
        # DEFAULT CATEGORIES
        # ─────────────────────────────────────

        async with db.execute(
            "SELECT COUNT(*) FROM categories"
        ) as cursor:

            count = (await cursor.fetchone())[0]

            if count == 0:

                await db.executescript("""
                    INSERT INTO categories
                    (name, slug, icon)
                    VALUES

                    ('AI Tools', 'ai-tools', '🤖'),

                    ('Video & Photo',
                     'video-photo',
                     '🎬'),

                    ('Streaming',
                     'streaming',
                     '🍿'),

                    ('Design & Tools',
                     'design',
                     '🎨'),

                    ('Bundles',
                     'bundles',
                     '🎁');
                """)

                await db.commit()


        # ─────────────────────────────────────
        # DEFAULT PRODUCTS
        # ─────────────────────────────────────

        async with db.execute(
            "SELECT COUNT(*) FROM products"
        ) as cursor:

            prod_count = (await cursor.fetchone())[0]

            if prod_count == 0:

                await db.executescript("""
                    INSERT INTO products (
                        category_id,
                        name,
                        description,
                        price,
                        duration_days,
                        image_url
                    )
                    VALUES

                    (
                        2,
                        'CapCut Pro (7 Day)',
                        'CapCut Pro 7 ថ្ងៃ Full Effects, 4K Export, Auto Captions & VIP Templates',
                        0.99,
                        7,
                        'https://cdn.iconscout.com/icon/free/png-256/free-capcut-icon-download-in-svg-png-gif-file-formats--logo-social-media-video-editing-pack-logos-icons-8316301.png'
                    ),

                    (
                        2,
                        'CapCut Pro (1 Month)',
                        'CapCut Pro 1 ខែ Shared/Private Profile - No Watermark & Pro Assets',
                        4.00,
                        30,
                        'https://cdn.iconscout.com/icon/free/png-256/free-capcut-icon-download-in-svg-png-gif-file-formats--logo-social-media-video-editing-pack-logos-icons-8316301.png'
                    ),

                    (
                        1,
                        'Gemini Pro (18 Month)',
                        'Google Gemini Advanced 2.0 / Pro - 18 ខែ Full Access & 2TB Cloud Support',
                        2.50,
                        540,
                        'https://cdn.iconscout.com/icon/free/png-256/free-google-gemini-icon-download-in-svg-png-gif-file-formats--ai-logo-technology-brands-pack-logos-icons-9905471.png'
                    ),

                    (
                        1,
                        'ChatGPT Plus',
                        'Shared Account 1 Month - GPT-4o, DALL-E 3 & Custom GPTs',
                        3.50,
                        30,
                        'https://cdn.iconscout.com/icon/free/png-256/free-chatgpt-icon-download-in-svg-png-gif-file-formats--logo-technology-social-media-vol-4-pack-logos-icons-9372437.png'
                    ),

                    (
                        1,
                        'Claude Pro',
                        'Shared Account 1 Month - Claude 3.5 Sonnet & Opus',
                        4.00,
                        30,
                        'https://cdn.iconscout.com/icon/free/png-256/free-claude-ai-icon-download-in-svg-png-gif-file-formats--technology-social-media-company-brand-vol-4-pack-logos-icons-9372439.png'
                    ),

                    (
                        4,
                        'Canva Pro (1 Month)',
                        'Invite to Pro Team - Unlimited Templates & Elements',
                        1.50,
                        30,
                        'https://cdn.iconscout.com/icon/free/png-256/free-canva-icon-download-in-svg-png-gif-file-formats--logo-social-media-pack-logos-icons-4468249.png'
                    ),

                    (
                        3,
                        'Netflix Premium 4K',
                        '1 Screen Private Profile - 1 Month UHD 4K',
                        3.00,
                        30,
                        'https://cdn.iconscout.com/icon/free/png-256/free-netflix-icon-download-in-svg-png-gif-file-formats--logo-social-media-pack-logos-icons-4468247.png'
                    );

                """)

                await db.commit()

        # Ensure default products are synced with high-quality icons and active status
        default_prods = [
            (2, 'CapCut Pro (7 Day)', 'CapCut Pro 7 ថ្ងៃ Full Effects, 4K Export, Auto Captions & VIP Templates', 0.99, 7, 'https://cdn.iconscout.com/icon/free/png-256/free-capcut-icon-download-in-svg-png-gif-file-formats--logo-social-media-video-editing-pack-logos-icons-8316301.png'),
            (2, 'CapCut Pro (1 Month)', 'CapCut Pro 1 ខែ Shared/Private Profile - No Watermark & Pro Assets', 4.00, 30, 'https://cdn.iconscout.com/icon/free/png-256/free-capcut-icon-download-in-svg-png-gif-file-formats--logo-social-media-video-editing-pack-logos-icons-8316301.png'),
            (1, 'Gemini Pro (18 Month)', 'Google Gemini Advanced 2.0 / Pro - 18 ខែ Full Access & 2TB Cloud Support', 2.50, 540, 'https://cdn.iconscout.com/icon/free/png-256/free-google-gemini-icon-download-in-svg-png-gif-file-formats--ai-logo-technology-brands-pack-logos-icons-9905471.png'),
            (1, 'ChatGPT Plus', 'Shared Account 1 Month - GPT-4o, DALL-E 3 & Custom GPTs', 3.50, 30, 'https://cdn.iconscout.com/icon/free/png-256/free-chatgpt-icon-download-in-svg-png-gif-file-formats--logo-technology-social-media-vol-4-pack-logos-icons-9372437.png'),
            (1, 'Claude Pro', 'Shared Account 1 Month - Claude 3.5 Sonnet & Opus', 4.00, 30, 'https://cdn.iconscout.com/icon/free/png-256/free-claude-ai-icon-download-in-svg-png-gif-file-formats--technology-social-media-company-brand-vol-4-pack-logos-icons-9372439.png'),
            (4, 'Canva Pro (1 Month)', 'Invite to Pro Team - Unlimited Templates & Elements', 1.50, 30, 'https://cdn.iconscout.com/icon/free/png-256/free-canva-icon-download-in-svg-png-gif-file-formats--logo-social-media-pack-logos-icons-4468249.png'),
            (3, 'Netflix Premium 4K', '1 Screen Private Profile - 1 Month UHD 4K', 3.00, 30, 'https://cdn.iconscout.com/icon/free/png-256/free-netflix-icon-download-in-svg-png-gif-file-formats--logo-social-media-pack-logos-icons-4468247.png')
        ]
        for cat_id, name, desc, price, dur, img in default_prods:
            async with db.execute("SELECT id, image_url FROM products WHERE name = ?", (name,)) as cur:
                row = await cur.fetchone()
                if not row:
                    await db.execute("""
                        INSERT INTO products (category_id, name, description, price, duration_days, image_url, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, 1)
                    """, (cat_id, name, desc, price, dur, img))
                elif not row[1] or "wikimedia" in str(row[1]) or str(row[1]).endswith(".svg"):
                    await db.execute("UPDATE products SET image_url = ?, is_active = 1 WHERE id = ?", (img, row[0]))
        await db.commit()

        # Seed sample stock if empty
        async with db.execute("SELECT COUNT(*) FROM stock_items") as cur_st:
            st_count = (await cur_st.fetchone())[0]
            if st_count == 0:
                await db.executescript("""
                    INSERT INTO stock_items
                    (product_id, credentials)
                    VALUES
                    (1, 'chatgpt_user1@gmail.com|Pass1234!|PIN: 1122'),
                    (1, 'chatgpt_user2@gmail.com|Pass9876!|PIN: 3344'),
                    (2, 'capcut_fast1@gmail.com|Capcut#8899|Profile 2'),
                    (3, 'gemini_pro_vip@gmail.com|GooglePro#2026|Gemini Advanced');
                """)
                await db.commit()



# ─────────────────────────────────────────────
# USER DATABASE HELPERS
# ─────────────────────────────────────────────

async def upsert_user(
    user_id: int,
    username: Optional[str],
    full_name: str,
    referred_by: Optional[int] = None,
    photo_url: Optional[str] = None
) -> Dict[str, Any]:

    from config import is_admin as check_is_admin

    admin_val = (
        1
        if check_is_admin(user_id)
        else 0
    )

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute("""
            INSERT INTO users (
                user_id,
                username,
                full_name,
                is_admin,
                referred_by,
                photo_url,
                last_active_at
            )
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id)
            DO UPDATE SET
                username = excluded.username,
                full_name = excluded.full_name,
                is_admin = ?,
                photo_url = COALESCE(excluded.photo_url, users.photo_url),
                last_active_at = CURRENT_TIMESTAMP
        """, (
            user_id,
            username,
            full_name,
            admin_val,
            referred_by,
            photo_url,
            admin_val
        ))

        await db.commit()

    return await get_user(user_id)


async def update_user_photo(user_id: int, photo_url: str):
    """Update profile photo URL of a user."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "UPDATE users SET photo_url = ? WHERE user_id = ?",
            (photo_url, user_id)
        )
        await db.commit()


async def update_user_balance(
    user_id: int,
    amount: float,
    tx_type: str,
    description: str
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute(
            """
            UPDATE users
            SET balance = balance + ?
            WHERE user_id = ?
            """,
            (
                amount,
                user_id
            )
        )

        await db.execute("""
            INSERT INTO wallet_transactions (
                user_id,
                amount,
                type,
                description
            )

            VALUES (?, ?, ?, ?)

        """, (
            user_id,
            amount,
            tx_type,
            description
        ))

async def get_user_wallet_transactions(
    user_id: int,
    limit: int = 30
) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT *
            FROM wallet_transactions
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (user_id, limit)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

async def get_user_referral_stats(
    user_id: int
) -> Dict[str, Any]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        async with db.execute(
            """
            SELECT COUNT(*)
            FROM users
            WHERE referred_by = ?
            """,
            (user_id,)
        ) as cursor:

            referrals_count = (
                await cursor.fetchone()
            )[0]

        async with db.execute(
            """
            SELECT SUM(amount)
            FROM wallet_transactions

            WHERE user_id = ?
            AND type = 'referral_bonus'
            """,
            (user_id,)
        ) as cursor:

            total_earned = (
                await cursor.fetchone()
            )[0] or 0.0

        return {
            "referrals_count": referrals_count,
            "total_earned": total_earned
        }


async def get_expiring_accounts(
    days_left: int = 3
) -> List[Dict[str, Any]]:

    import datetime

    target_date = (
        datetime.datetime.now()
        + datetime.timedelta(
            days=days_left
        )
    ).strftime("%Y-%m-%d")

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT
                da.*,
                u.user_id,
                u.full_name

            FROM delivered_accounts da

            JOIN users u
                ON da.user_id = u.user_id

            WHERE da.expiry_date = ?

        """, (target_date,)) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


async def get_user(
    user_id: int
) -> Optional[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            """,
            (user_id,)
        ) as cursor:

            row = await cursor.fetchone()

            return (
                dict(row)
                if row
                else None
            )


async def get_all_users() -> List[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute(
            "SELECT * FROM users"
        ) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


# ⭐ NEW: Get all Telegram User IDs
async def get_all_user_ids() -> List[int]:
    """
    Get all Telegram user IDs
    for broadcast alerts.
    """

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        async with db.execute(
            """
            SELECT user_id
            FROM users
            WHERE user_id IS NOT NULL
              AND COALESCE(is_banned, 0) = 0
            """
        ) as cursor:

            rows = await cursor.fetchall()

            return [
                row[0]
                for row in rows
            ]


async def get_targeted_user_ids(target: str = "all") -> List[int]:
    """Get targeted user IDs based on audience group (all, resellers, vip, channel_only)."""
    target = (target or "all").lower().strip()
    if target in ("channel_only", "none"):
        return []

    async with aiosqlite.connect(DATABASE_PATH) as db:
        if target in ("resellers", "reseller"):
            query = """
                SELECT user_id FROM users
                WHERE user_id IS NOT NULL
                  AND (role = 'reseller' OR reseller_status = 'approved')
                  AND COALESCE(is_banned, 0) = 0
            """
        elif target in ("vip", "vip_spenders", "gold_diamond"):
            query = """
                SELECT user_id FROM users
                WHERE user_id IS NOT NULL
                  AND LOWER(COALESCE(vip_tier, 'bronze')) IN ('gold', 'platinum', 'diamond')
                  AND COALESCE(is_banned, 0) = 0
            """
        else:  # "all"
            query = """
                SELECT user_id FROM users
                WHERE user_id IS NOT NULL
                  AND COALESCE(is_banned, 0) = 0
            """

        async with db.execute(query) as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]


# ─────────────────────────────────────────────
# CATEGORIES
# ─────────────────────────────────────────────

async def get_categories() -> List[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute(
            """
            SELECT *
            FROM categories
            ORDER BY id ASC
            """
        ) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


# ─────────────────────────────────────────────
# PRODUCTS
# ─────────────────────────────────────────────

async def get_products(
    category_id: Optional[int] = None
) -> List[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        query = """
            SELECT
                p.*,
                c.name AS category_name,
                c.icon AS category_icon,

                (
                    SELECT COUNT(*)
                    FROM stock_items s

                    WHERE
                        s.product_id = p.id
                        AND s.is_sold = 0
                ) AS stock_count

            FROM products p

            LEFT JOIN categories c
                ON p.category_id = c.id

            WHERE p.is_active = 1
        """

        params = []

        if category_id:

            query += (
                " AND p.category_id = ?"
            )

            params.append(
                category_id
            )

        query += (
            " ORDER BY p.id DESC"
        )

        async with db.execute(
            query,
            params
        ) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


async def get_product(
    product_id: int
) -> Optional[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT
                p.*,
                c.name AS category_name,

                (
                    SELECT COUNT(*)
                    FROM stock_items s

                    WHERE
                        s.product_id = p.id
                        AND s.is_sold = 0

                ) AS stock_count

            FROM products p

            LEFT JOIN categories c
                ON p.category_id = c.id

            WHERE p.id = ?

        """, (product_id,)) as cursor:

            row = await cursor.fetchone()

            return (
                dict(row)
                if row
                else None
            )


async def add_product(
    name: str,
    category_id: int,
    description: str,
    price: float,
    duration_days: int,
    image_url: str,
    reseller_price: Optional[float] = None,
    badge: Optional[str] = None
) -> int:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        cursor = await db.execute("""
            INSERT INTO products (
                name,
                category_id,
                description,
                price,
                duration_days,
                image_url,
                reseller_price,
                badge
            )

            VALUES (?, ?, ?, ?, ?, ?, ?, ?)

        """, (
            name,
            category_id,
            description,
            price,
            duration_days,
            image_url,
            reseller_price,
            badge
        ))

        await db.commit()

        return cursor.lastrowid


async def update_product(
    product_id: int,
    name: str,
    category_id: int,
    description: str,
    price: float,
    duration_days: int,
    image_url: str,
    is_active: int = 1,
    reseller_price: Optional[float] = None,
    badge: Optional[str] = None
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute("""
            UPDATE products

            SET
                name = ?,
                category_id = ?,
                description = ?,
                price = ?,
                duration_days = ?,
                image_url = ?,
                is_active = ?,
                reseller_price = ?,
                badge = ?

            WHERE id = ?

        """, (
            name,
            category_id,
            description,
            price,
            duration_days,
            image_url,
            is_active,
            reseller_price,
            badge,
            product_id
        ))

        await db.commit()



async def update_product_price(
    product_id: int,
    price: float,
    reseller_price: Optional[float] = None
):
    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:
        if reseller_price is not None:
            await db.execute("""
                UPDATE products
                SET price = ?, reseller_price = ?
                WHERE id = ?
            """, (price, reseller_price, product_id))
        else:
            await db.execute("""
                UPDATE products
                SET price = ?
                WHERE id = ?
            """, (price, product_id))
        await db.commit()



async def delete_product(
    product_id: int
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute(
            """
            UPDATE products

            SET is_active = 0

            WHERE id = ?
            """,
            (product_id,)
        )

        await db.commit()


async def restore_product(
    product_id: int
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute(
            """
            UPDATE products

            SET is_active = 1

            WHERE id = ?
            """,
            (product_id,)
        )

        await db.commit()


async def get_all_products_admin() -> List[Dict[str, Any]]:
    """
    Admin only.
    Return all products
    including inactive products.
    """

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT
                p.*,
                c.name AS category_name,
                c.icon AS category_icon,

                (
                    SELECT COUNT(*)
                    FROM stock_items s

                    WHERE
                        s.product_id = p.id
                        AND s.is_sold = 0

                ) AS stock_count

            FROM products p

            LEFT JOIN categories c
                ON p.category_id = c.id

            ORDER BY p.id DESC

        """) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


# ─────────────────────────────────────────────
# STOCK MANAGEMENT
# ─────────────────────────────────────────────

async def add_stock(
    product_id: int,
    credentials_list: List[str]
) -> int:

    added = 0

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        for cred in credentials_list:

            cred = cred.strip()

            if cred:

                await db.execute(
                    """
                    INSERT INTO stock_items (
                        product_id,
                        credentials
                    )

                    VALUES (?, ?)
                    """,
                    (
                        product_id,
                        cred
                    )
                )

                added += 1

        await db.commit()

    return added


async def add_stock_by_quantity(
    product_id: int,
    quantity: int,
    default_note: str = (
        "Standard Account Access / Contact Admin"
    )
) -> int:

    added = 0

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        for i in range(quantity):

            cred = (
                f"Stock Item #{i + 1} "
                f"({default_note})"
            )

            await db.execute(
                """
                INSERT INTO stock_items (
                    product_id,
                    credentials
                )

                VALUES (?, ?)
                """,
                (
                    product_id,
                    cred
                )
            )

            added += 1

        await db.commit()

    return added


async def get_available_stock(
    product_id: int
) -> Optional[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute(
            """
            SELECT *
            FROM stock_items

            WHERE
                product_id = ?
                AND is_sold = 0

            LIMIT 1
            """,
            (product_id,)
        ) as cursor:

            row = await cursor.fetchone()

            return (
                dict(row)
                if row
                else None
            )


# ─────────────────────────────────────────────
# ORDERS
# ─────────────────────────────────────────────

async def create_order(
    user_id: int,
    product_id: int,
    product_name: str,
    price: float,
    payment_method: str,
    proof_file: str,
    quantity: int = 1
) -> int:
    import datetime
    # Use Cambodia local time (UTC+7)
    kh_now = (datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))).strftime("%Y-%m-%d %H:%M:%S")

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        cursor = await db.execute("""
            INSERT INTO orders (
                user_id,
                product_id,
                product_name,
                price,
                payment_method,
                proof_file,
                status,
                quantity,
                created_at,
                updated_at
            )

            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)

        """, (
            user_id,
            product_id,
            product_name,
            price,
            payment_method,
            proof_file,
            quantity,
            kh_now,
            kh_now
        ))

        await db.commit()

        return cursor.lastrowid



async def get_order(
    order_id: int
) -> Optional[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT
                o.*,
                u.full_name,
                u.username

            FROM orders o

            JOIN users u
                ON o.user_id = u.user_id

            WHERE o.id = ?

        """, (order_id,)) as cursor:

            row = await cursor.fetchone()

            return (
                dict(row)
                if row
                else None
            )


async def get_user_orders(
    user_id: int
) -> List[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT
                o.*,
                da.credentials as credentials,
                COALESCE(da.expiry_date, o.expiry_date) as expiry_date,
                COALESCE(p.duration_days, 30) as duration_days,
                p.image_url as product_image
            FROM orders o
            LEFT JOIN delivered_accounts da
                ON o.id = da.order_id
            LEFT JOIN products p
                ON o.product_id = p.id
            WHERE o.user_id = ?
            ORDER BY
                o.created_at DESC
        """, (user_id,)) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


async def get_pending_orders() -> List[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT
                o.*,
                u.full_name,
                u.username

            FROM orders o

            JOIN users u
                ON o.user_id = u.user_id

            WHERE
                o.status = 'pending'

            ORDER BY
                o.created_at ASC

        """) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


# ─────────────────────────────────────────────
# APPROVE & DELIVER
# ─────────────────────────────────────────────

async def approve_and_deliver_order(
    order_id: int
) -> Dict[str, Any]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row


        async with db.execute(
            """
            SELECT *
            FROM orders
            WHERE id = ?
            """,
            (order_id,)
        ) as cursor:

            order = await cursor.fetchone()

            if not order:
                raise Exception(
                    "Order not found"
                )

            order = dict(order)


        # Get available stock
        qty = int(order.get("quantity") or 1)
        async with db.execute(
            """
            SELECT *
            FROM stock_items

            WHERE
                product_id = ?
                AND is_sold = 0

            ORDER BY id ASC
            LIMIT ?
            """,
            (
                order["product_id"],
                qty
            )
        ) as cursor:

            stock_rows = await cursor.fetchall()

            if len(stock_rows) < qty:
                raise Exception(
                    f"ស្តុកមិនគ្រប់គ្រាន់ទេ! ស្តុកនៅសល់ត្រឹមតែ {len(stock_rows)} អាខោនប៉ុណ្ណោះ (អ្នកទិញចំនួន {qty}x)"
                )

            stock_items = [dict(s) for s in stock_rows]

        # Product duration

        async with db.execute(
            """
            SELECT duration_days
            FROM products
            WHERE id = ?
            """,
            (
                order["product_id"],
            )
        ) as cursor:

            prod = await cursor.fetchone()

            duration_days = (
                prod["duration_days"]
                if prod
                else 30
            )


        import datetime

        expiry_date = (
            datetime.datetime.now()
            + datetime.timedelta(
                days=duration_days
            )
        ).strftime("%Y-%m-%d")


        # Mark stock sold
        stock_ids = [s["id"] for s in stock_items]
        creds_list = [s["credentials"] for s in stock_items]
        all_credentials = "\n".join(creds_list)

        for sid in stock_ids:
            await db.execute(
                """
                UPDATE stock_items

                SET
                    is_sold = 1,
                    order_id = ?

                WHERE id = ?
                """,
                (
                    order_id,
                    sid
                )
            )


        # Update order

        await db.execute(
            """
            UPDATE orders

            SET
                status = 'delivered',
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?
            """,
            (order_id,)
        )


        # Save delivered accounts
        for cred in creds_list:
            await db.execute("""
                INSERT INTO delivered_accounts (
                    order_id,
                    user_id,
                    product_name,
                    credentials,
                    expiry_date
                )

                VALUES (?, ?, ?, ?, ?)

            """, (
                order_id,
                order["user_id"],
                order["product_name"],
                cred,
                expiry_date
            ))


        await db.commit()


        return {
            "order_id":
                order_id,

            "user_id":
                order["user_id"],

            "product_name":
                order["product_name"],

            "credentials":
                all_credentials,

            "expiry_date":
                expiry_date,

            "quantity":
                order.get("quantity") or 1
        }


async def approve_with_custom_credentials(
    order_id: int,
    credentials: str,
    expiry_days: int = 30
) -> Dict[str, Any]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row


        async with db.execute(
            """
            SELECT *
            FROM orders
            WHERE id = ?
            """,
            (order_id,)
        ) as cursor:

            order = await cursor.fetchone()

            if not order:
                raise Exception(
                    "Order not found"
                )

            order = dict(order)


        import datetime

        expiry_date = (
            datetime.datetime.now()
            + datetime.timedelta(
                days=expiry_days
            )
        ).strftime("%Y-%m-%d")


        qty = int(order.get("quantity") or 1)
        async with db.execute(
            """
            SELECT id FROM stock_items
            WHERE product_id = ? AND is_sold = 0
            ORDER BY id ASC
            LIMIT ?
            """,
            (
                order["product_id"],
                qty
            )
        ) as cursor:
            to_consume = await cursor.fetchall()

        for row in to_consume:
            await db.execute(
                """
                UPDATE stock_items
                SET is_sold = 1, order_id = ?
                WHERE id = ?
                """,
                (
                    order_id,
                    row[0]
                )
            )

        await db.execute(
            """
            UPDATE orders

            SET
                status = 'delivered',
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?
            """,
            (order_id,)
        )


        await db.execute("""
            INSERT INTO delivered_accounts (
                order_id,
                user_id,
                product_name,
                credentials,
                expiry_date
            )

            VALUES (?, ?, ?, ?, ?)

        """, (
            order_id,
            order["user_id"],
            order["product_name"],
            credentials,
            expiry_date
        ))


        await db.commit()


        return {

            "order_id":
                order_id,

            "user_id":
                order["user_id"],

            "product_name":
                order["product_name"],

            "credentials":
                credentials,

            "expiry_date":
                expiry_date,

            "quantity":
                order.get("quantity") or 1
        }


async def reject_order(
    order_id: int,
    reason: str = (
        "Payment verification failed"
    )
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute(
            """
            UPDATE orders

            SET
                status = 'rejected',
                note = ?,
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?
            """,
            (
                reason,
                order_id
            )
        )

        await db.commit()


async def delete_order(order_id: int) -> bool:
    """Permanently delete an order from database."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        await db.commit()
        return True


# ─────────────────────────────────────────────
# BROADCAST ALERTS
# ─────────────────────────────────────────────

async def record_broadcast_alert(
    title: str,
    message: str,
    product_id: Optional[int],
    sent_count: int
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute("""
            INSERT INTO broadcast_alerts (
                title,
                message,
                product_id,
                sent_count
            )

            VALUES (?, ?, ?, ?)

        """, (
            title,
            message,
            product_id,
            sent_count
        ))

        await db.commit()


# ─────────────────────────────────────────────
# REPLACEMENT REQUESTS
# ─────────────────────────────────────────────

async def create_replacement_request(
    user_id: int,
    buyer_name: str,
    product_name: str,
    purchase_date: str,
    expiry_date: str,
    problem_credentials: str,
    issue_description: str
) -> int:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        cursor = await db.execute("""
            INSERT INTO replacement_requests (
                user_id,
                buyer_name,
                product_name,
                purchase_date,
                expiry_date,
                problem_credentials,
                issue_description
            )

            VALUES (?, ?, ?, ?, ?, ?, ?)

        """, (
            user_id,
            buyer_name,
            product_name,
            purchase_date,
            expiry_date,
            problem_credentials,
            issue_description
        ))

        await db.commit()

        return cursor.lastrowid


async def get_user_replacement_requests(
    user_id: int
) -> List[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute("""
            SELECT *
            FROM replacement_requests

            WHERE user_id = ?

            ORDER BY
                created_at DESC

        """, (user_id,)) as cursor:

            rows = await cursor.fetchall()

            return [
                dict(r)
                for r in rows
            ]


async def get_replacement_request(
    req_id: int
) -> Optional[Dict[str, Any]]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        db.row_factory = aiosqlite.Row

        async with db.execute(
            """
            SELECT *
            FROM replacement_requests
            WHERE id = ?
            """,
            (req_id,)
        ) as cursor:

            row = await cursor.fetchone()

            return (
                dict(row)
                if row
                else None
            )


async def approve_replacement_request(
    req_id: int,
    new_credentials: str
) -> Dict[str, Any]:

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute(
            """
            UPDATE replacement_requests

            SET
                status = 'approved',
                new_credentials = ?

            WHERE id = ?
            """,
            (
                new_credentials,
                req_id
            )
        )

        await db.commit()

    return await get_replacement_request(
        req_id
    )


async def reject_replacement_request(
    req_id: int,
    reason: str = (
        "Warranty criteria not met"
    )
):

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        await db.execute(
            """
            UPDATE replacement_requests

            SET
                status = 'rejected',
                admin_note = ?

            WHERE id = ?
            """,
            (
                reason,
                req_id
            )
        )

        await db.commit()


# ─────────────────────────────────────────────
# STATISTICS
# ─────────────────────────────────────────────

async def get_stats():

    async with aiosqlite.connect(
        DATABASE_PATH
    ) as db:

        async with db.execute(
            "SELECT COUNT(*) FROM users"
        ) as cursor:

            total_users = (
                await cursor.fetchone()
            )[0]


        async with db.execute(
            """
            SELECT COUNT(*)
            FROM products
            WHERE is_active = 1
            """
        ) as cursor:

            total_products = (
                await cursor.fetchone()
            )[0]


        async with db.execute(
            """
            SELECT COUNT(*)
            FROM orders
            WHERE status = 'delivered'
            """
        ) as cursor:

            total_orders = (
                await cursor.fetchone()
            )[0]


        async with db.execute(
            """
            SELECT SUM(price)
            FROM orders
            WHERE status = 'delivered'
            """
        ) as cursor:

            total_revenue = (
                await cursor.fetchone()
            )[0] or 0.0


        async with db.execute(
            """
            SELECT COUNT(*)
            FROM stock_items
            WHERE is_sold = 0
            """
        ) as cursor:

            total_stock = (
                await cursor.fetchone()
            )[0]


        async with db.execute(
            """
            SELECT COUNT(*)
            FROM replacement_requests
            WHERE status = 'pending'
            """
        ) as cursor:

            pending_replacements = (
                await cursor.fetchone()
            )[0]


        return {

            "total_users":
                total_users,

            "total_products":
                total_products,

            "total_orders":
                total_orders,

            "total_revenue":
                total_revenue,

            "total_stock":
                total_stock,

            "pending_replacements":
                pending_replacements
        }


# ─────────────────────────────────────────────
# VIP TIER LOYALTY SYSTEM
# ─────────────────────────────────────────────

async def get_user_vip_tier(user_id: int) -> Dict[str, Any]:
    """Calculate user VIP tier based on completed orders total spend."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute(
            "SELECT SUM(price), COUNT(*) FROM orders WHERE user_id = ? AND status = 'delivered'",
            (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            total_spent = (row[0] if row and row[0] is not None else 0.0)
            order_count = (row[1] if row and row[1] is not None else 0)

    if total_spent >= 80.0:
        tier_name = "Diamond VIP"
        tier_badge = "💎"
        discount_percent = 10.0
        next_tier = None
        next_target = 80.0
        progress = 100.0
    elif total_spent >= 30.0:
        tier_name = "Gold VIP"
        tier_badge = "🥇"
        discount_percent = 5.0
        next_tier = "Diamond VIP"
        next_target = 80.0
        progress = min(100.0, round(((total_spent - 30.0) / 50.0) * 100, 1))
    elif total_spent >= 10.0:
        tier_name = "Silver VIP"
        tier_badge = "🥈"
        discount_percent = 3.0
        next_tier = "Gold VIP"
        next_target = 30.0
        progress = min(100.0, round(((total_spent - 10.0) / 20.0) * 100, 1))
    else:
        tier_name = "Bronze Member"
        tier_badge = "🥉"
        discount_percent = 0.0
        next_tier = "Silver VIP"
        next_target = 10.0
        progress = min(100.0, round((total_spent / 10.0) * 100, 1))

    return {
        "user_id": user_id,
        "total_spent": round(total_spent, 2),
        "order_count": order_count,
        "tier_name": tier_name,
        "tier_badge": tier_badge,
        "discount_percent": discount_percent,
        "next_tier": next_tier,
        "next_target": next_target,
        "progress": progress
    }


# ─────────────────────────────────────────────
# DAILY LUCKY WHEEL / SPIN REWARDS
# ─────────────────────────────────────────────

async def get_user_spin_status(user_id: int) -> Dict[str, Any]:
    """Check if the user is eligible for a free daily spin (24h cooldown)."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute(
            """
            SELECT created_at, 
                   CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) as elapsed_sec
            FROM daily_spins 
            WHERE user_id = ? 
            ORDER BY id DESC LIMIT 1
            """,
            (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return {"can_spin": True, "remaining_seconds": 0}
            
            elapsed = row[1] if row[1] is not None else 86400
            COOLDOWN = 86400  # 24 hours in seconds
            if elapsed >= COOLDOWN:
                return {"can_spin": True, "remaining_seconds": 0}
            else:
                return {"can_spin": False, "remaining_seconds": max(0, COOLDOWN - elapsed)}


async def perform_user_spin(user_id: int) -> Dict[str, Any]:
    """Perform lucky spin, allocate reward, and add balance to user wallet."""
    import random
    
    status = await get_user_spin_status(user_id)
    if not status["can_spin"]:
        rem = status["remaining_seconds"]
        hours = rem // 3600
        mins = (rem % 3600) // 60
        return {
            "success": False,
            "message": f"សូមរង់ចាំ {hours} ម៉ោង {mins} នាទីទៀត ដើម្បីបង្វិលម្តងទៀត!",
            "remaining_seconds": rem
        }

    # Reward pool with index corresponding to the 6 slices on frontend wheel
    # 0: $0.05, 1: $0.10, 2: $0.20, 3: $0.50, 4: $1.00 Jackpot, 5: $0.05 Lucky
    rewards = [
        {"value": 0.05, "label": "💰 $0.05", "index": 0, "weight": 35},
        {"value": 0.10, "label": "💵 $0.10", "index": 1, "weight": 30},
        {"value": 0.20, "label": "💎 $0.20", "index": 2, "weight": 18},
        {"value": 0.50, "label": "🔥 $0.50", "index": 3, "weight": 10},
        {"value": 1.00, "label": "👑 $1.00 Jackpot", "index": 4, "weight": 4},
        {"value": 0.05, "label": "✨ $0.05 Bonus", "index": 5, "weight": 3},
    ]
    
    choices = []
    for r in rewards:
        choices.extend([r] * r["weight"])
    
    picked = random.choice(choices)
    reward_val = picked["value"]
    reward_label = picked["label"]
    reward_idx = picked["index"]

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # 1. Record spin
        await db.execute(
            "INSERT INTO daily_spins (user_id, reward_type, reward_value, reward_label) VALUES (?, 'balance', ?, ?)",
            (user_id, reward_val, reward_label)
        )
        # 2. Update user balance
        await db.execute(
            "UPDATE users SET balance = balance + ? WHERE user_id = ?",
            (reward_val, user_id)
        )
        # 3. Add wallet transaction
        await db.execute(
            "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?, ?, 'credit', ?)",
            (user_id, reward_val, f"🎁 Lucky Spin Reward: {reward_label}")
        )
        await db.commit()

        # Fetch new balance
        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            new_balance = row[0] if row else 0.0

    return {
        "success": True,
        "reward_index": reward_idx,
        "reward_value": reward_val,
        "reward_label": reward_label,
        "new_balance": round(new_balance, 2),
        "message": f"🎉 អបអរសាទរ! អ្នកបានឈ្នះ {reward_label} ចូល Wallet Balance របស់អ្នកភ្លាមៗ!"
    }


# ─────────────────────────────────────────────
# PROMO CODES ENGINE
# ─────────────────────────────────────────────

async def verify_promo_code(code: str, total_price: float) -> Dict[str, Any]:
    """Verify promo code validity and calculate discount amount."""
    if not code:
        return {"valid": False, "discount": 0.0, "message": "សូមបញ្ចូលកូដបញ្ចុះតម្លៃ!"}

    clean_code = code.strip().upper()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM promo_codes WHERE code = ? AND is_active = 1",
            (clean_code,)
        ) as cursor:
            promo = await cursor.fetchone()
            if not promo:
                return {"valid": False, "discount": 0.0, "message": "❌ កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ ឬផុតកំណត់!"}
            
            p_dict = dict(promo)
            if p_dict["used_count"] >= p_dict["max_uses"]:
                return {"valid": False, "discount": 0.0, "message": "❌ កូដនេះត្រូវបានប្រើប្រាស់អស់កំណត់ហើយ!"}
            
            if total_price < p_dict["min_spend"]:
                return {
                    "valid": False,
                    "discount": 0.0,
                    "message": f"❌ កូដនេះប្រើបានចាប់ពីការទិញ ${p_dict['min_spend']:.2f} ឡើងទៅ!"
                }
            
            discount = 0.0
            if p_dict["discount_percent"] > 0:
                discount = round(total_price * (p_dict["discount_percent"] / 100.0), 2)
            elif p_dict["discount_amount"] > 0:
                discount = round(min(total_price, p_dict["discount_amount"]), 2)

            return {
                "valid": True,
                "code": clean_code,
                "discount": discount,
                "final_price": max(0.0, round(total_price - discount, 2)),
                "message": f"✅ បានបញ្ចុះតម្លៃ ${discount:.2f} ដោយជោគជ័យ!"
            }


async def use_promo_code(code: str) -> bool:
    """Increment usage count of promo code."""
    if not code:
        return False
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?",
            (code.strip().upper(),)
        )
        await db.commit()
        return True


# ─────────────────────────────────────────────
# LIVE SALES & SOCIAL PROOF ACTIVITIES
# ─────────────────────────────────────────────

async def get_live_activities() -> List[Dict[str, Any]]:
    """Return recent purchase activities or realistic dynamic social proof stream."""
    activities = []
    try:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT o.id, o.product_name, o.created_at, u.full_name, u.username
                FROM orders o
                JOIN users u ON o.user_id = u.user_id
                WHERE o.status = 'delivered'
                ORDER BY o.id DESC LIMIT 10
                """
            ) as cursor:
                rows = await cursor.fetchall()
                for r in rows:
                    name = r["full_name"] or r["username"] or "Customer"
                    masked_name = name[:3] + "***" if len(name) > 3 else name + "***"
                    activities.append({
                        "buyer": masked_name,
                        "product": r["product_name"],
                        "time": "មុននេះបន្តិច"
                    })
    except Exception as e:
        logger.error(f"Error fetching live activities: {e}")

    # Fallback activities
    if not activities:
        activities = [
            {"buyer": "Dara***", "product": "CapCut Pro 1 Month", "time": "1 នាទីមុន"},
            {"buyer": "Sokha***", "product": "ChatGPT Plus (GPT-4o)", "time": "3 នាទីមុន"},
            {"buyer": "Vireak***", "product": "Netflix Premium 4K", "time": "6 នាទីមុន"},
            {"buyer": "Chann***", "product": "Canva Pro 1 Year", "time": "10 នាទីមុន"},
            {"buyer": "Kim***", "product": "Claude Pro (Sonnet 3.5)", "time": "15 នាទីមុន"}
        ]
    return activities


# ─────────────────────────────────────────────
# FREE ACCOUNT GIVEAWAYS ENGINE
# ─────────────────────────────────────────────

async def get_active_giveaways(user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retrieve all active giveaways with stock count and user claim status."""
    giveaways = []
    try:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            db.row_factory = aiosqlite.Row

            raw_giveaways = []
            async with db.execute("""
                SELECT g.*, 
                       COUNT(CASE WHEN gs.is_claimed = 0 THEN 1 END) as stock_remaining,
                       COUNT(gs.id) as total_stock
                FROM giveaways g
                LEFT JOIN giveaway_stock gs ON g.id = gs.giveaway_id
                WHERE (g.is_active = 1 OR g.is_active IS NULL)
                GROUP BY g.id
                ORDER BY g.id DESC
            """) as cursor:
                rows = await cursor.fetchall()
                raw_giveaways = [dict(r) for r in rows]

            for g_dict in raw_giveaways:
                g_dict["already_claimed"] = False
                g_dict["claimed_credentials"] = None
                g_dict["claimed_at"] = None
                g_dict["winners"] = []

                # Fetch recent winners who claimed this giveaway
                try:
                    async with db.execute("""
                        SELECT user_id, full_name, username, photo_url, claimed_at
                        FROM giveaway_claims
                        WHERE giveaway_id = ?
                        ORDER BY id DESC LIMIT 5
                    """, (g_dict["id"],)) as win_cur:
                        win_rows = await win_cur.fetchall()
                        g_dict["winners"] = [dict(w) for w in win_rows]
                except Exception:
                    pass

                if user_id:
                    try:
                        async with db.execute("""
                            SELECT credentials, claimed_at FROM giveaway_claims
                            WHERE giveaway_id = ? AND user_id = ?
                            ORDER BY id DESC LIMIT 1
                        """, (g_dict["id"], int(user_id))) as claim_cur:
                            claim_row = await claim_cur.fetchone()
                            if claim_row:
                                g_dict["already_claimed"] = True
                                g_dict["claimed_credentials"] = claim_row["credentials"]
                                g_dict["claimed_at"] = claim_row["claimed_at"]
                    except Exception as ce:
                        logger.warning(f"Error checking user claim: {ce}")

                giveaways.append(g_dict)
    except Exception as e:
        logger.error(f"Error in get_active_giveaways: {e}")

    return giveaways


async def get_giveaway(giveaway_id: int) -> Optional[Dict[str, Any]]:
    """Get single giveaway details."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT g.*, 
                   COUNT(CASE WHEN gs.is_claimed = 0 THEN 1 END) as stock_remaining,
                   COUNT(gs.id) as total_stock
            FROM giveaways g
            LEFT JOIN giveaway_stock gs ON g.id = gs.giveaway_id
            WHERE g.id = ?
            GROUP BY g.id
        """, (giveaway_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def claim_giveaway(
    giveaway_id: int,
    user_id: int,
    full_name: str,
    username: Optional[str] = None,
    photo_url: Optional[str] = None
) -> Dict[str, Any]:
    """Atomically claim a free account from the giveaway."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # 1. Check if giveaway exists and is active
        async with db.execute("SELECT * FROM giveaways WHERE id = ? AND (is_active = 1 OR is_active IS NULL)", (giveaway_id,)) as g_cur:
            giveaway = await g_cur.fetchone()
            if not giveaway:
                return {"status": "error", "message": "Giveaway នេះមិនមាន ឬត្រូវបានបិទហើយ!"}
            giveaway_dict = dict(giveaway)

        # 2. Check if user already claimed
        async with db.execute("""
            SELECT credentials, claimed_at FROM giveaway_claims 
            WHERE giveaway_id = ? AND user_id = ?
        """, (giveaway_id, user_id)) as claim_cur:
            existing_claim = await claim_cur.fetchone()
            if existing_claim:
                return {
                    "status": "already_claimed",
                    "giveaway": giveaway_dict,
                    "credentials": existing_claim["credentials"],
                    "claimed_at": existing_claim["claimed_at"],
                    "message": "អ្នកបានទទួលយក Account Free នេះរួចរាល់ហើយ!"
                }

        # 3. Find 1 available stock item atomically
        async with db.execute("""
            SELECT id, credentials FROM giveaway_stock 
            WHERE giveaway_id = ? AND is_claimed = 0 
            ORDER BY id ASC LIMIT 1
        """, (giveaway_id,)) as stock_cur:
            stock_item = await stock_cur.fetchone()
            if not stock_item:
                return {
                    "status": "out_of_stock",
                    "giveaway": giveaway_dict,
                    "message": "អាខោន Free នេះត្រូវបានចែកអស់ពីស្តុកហើយ! សូមរង់ចាំ Admin បន្ថែមថ្មី។"
                }

            stock_id = stock_item["id"]
            creds = stock_item["credentials"]

        # 4. Mark stock item as claimed
        await db.execute("""
            UPDATE giveaway_stock 
            SET is_claimed = 1, claimed_by = ?, claimed_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        """, (user_id, stock_id))

        # 5. Insert claim record
        try:
            await db.execute("""
                INSERT INTO giveaway_claims (giveaway_id, user_id, full_name, username, photo_url, stock_item_id, credentials)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (giveaway_id, user_id, full_name, username, photo_url, stock_id, creds))
        except Exception:
            await db.execute("""
                INSERT INTO giveaway_claims (giveaway_id, user_id, full_name, username, stock_item_id, credentials)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (giveaway_id, user_id, full_name, username, stock_id, creds))

        # 6. Get updated remaining stock count
        async with db.execute("""
            SELECT COUNT(*) FROM giveaway_stock 
            WHERE giveaway_id = ? AND is_claimed = 0
        """, (giveaway_id,)) as rem_cur:
            stock_left = (await rem_cur.fetchone())[0]

        return {
            "status": "success",
            "giveaway": giveaway_dict,
            "credentials": creds,
            "stock_remaining": stock_left,
            "message": "🎉 អបអរសាទរ! អ្នកបានទទួល Account Free ដោយជោគជ័យ!"
        }


async def get_user_giveaway_claims(user_id: int) -> List[Dict[str, Any]]:
    """Retrieve all giveaway accounts claimed by a user."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT gc.*, g.title as giveaway_title, g.image_url, g.duration_days
            FROM giveaway_claims gc
            JOIN giveaways g ON gc.giveaway_id = g.id
            WHERE gc.user_id = ?
            ORDER BY gc.id DESC
        """, (user_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def admin_create_giveaway(
    title: str,
    description: str,
    duration_days: int,
    image_url: str,
    badge: str,
    required_channel: str = "@smarttech_digital",
    invite_link: str = "https://t.me/smarttech_digital",
    required_group: str = "@smarttech_digitals",
    group_invite_link: str = "https://t.me/smarttech_digitals",
    credentials_list: Optional[List[str]] = None
) -> int:
    """Admin: Create new giveaway and seed stock items."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("""
            INSERT INTO giveaways (title, description, duration_days, image_url, badge, required_channel, invite_link, required_group, group_invite_link, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            title.strip(),
            description.strip() if description else "",
            duration_days,
            image_url.strip() if image_url else "https://cdn-icons-png.flaticon.com/512/3594/3594363.png",
            badge.strip() if badge else "🎁 FREE",
            required_channel.strip() if required_channel else "@smarttech_digital",
            invite_link.strip() if invite_link else "https://t.me/smarttech_digital",
            required_group.strip() if required_group else "@smarttech_digitals",
            group_invite_link.strip() if group_invite_link else "https://t.me/smarttech_digitals"
        )) as cursor:
            giveaway_id = cursor.lastrowid

        if credentials_list:
            for cred in credentials_list:
                cleaned = cred.strip()
                if cleaned:
                    await db.execute(
                        "INSERT INTO giveaway_stock (giveaway_id, credentials, is_claimed) VALUES (?, ?, 0)",
                        (giveaway_id, cleaned)
                    )

        await db.commit()
        return giveaway_id


async def admin_add_giveaway_stock(giveaway_id: int, credentials_list: List[str]) -> int:
    """Admin: Add credentials to existing giveaway."""
    added = 0
    async with aiosqlite.connect(DATABASE_PATH) as db:
        for cred in credentials_list:
            cleaned = cred.strip()
            if cleaned:
                await db.execute(
                    "INSERT INTO giveaway_stock (giveaway_id, credentials) VALUES (?, ?)",
                    (giveaway_id, cleaned)
                )
                added += 1
        await db.commit()
    return added


async def admin_delete_giveaway(giveaway_id: int) -> bool:
    """Admin: Deactivate / Delete giveaway."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE giveaways SET is_active = 0 WHERE id = ?", (giveaway_id,))
        await db.commit()
        return True


async def admin_get_all_giveaways() -> List[Dict[str, Any]]:
    """Admin: Get all giveaways with stock and claims summary."""
    giveaways = []
    try:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT g.*, 
                       COUNT(CASE WHEN gs.is_claimed = 0 THEN 1 END) as stock_remaining,
                       COUNT(CASE WHEN gs.is_claimed = 1 THEN 1 END) as claimed_count,
                       COUNT(gs.id) as total_stock
                FROM giveaways g
                LEFT JOIN giveaway_stock gs ON g.id = gs.giveaway_id
                WHERE (g.is_active = 1 OR g.is_active IS NULL)
                GROUP BY g.id
                ORDER BY g.id DESC
            """) as cursor:
                rows = await cursor.fetchall()
                giveaways = [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Error in admin_get_all_giveaways: {e}")
    return giveaways


async def admin_get_giveaway_claims(giveaway_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Admin: View claims log."""
    claims = []
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        if giveaway_id:
            query = """
                SELECT gc.*, g.title as giveaway_title
                FROM giveaway_claims gc
                JOIN giveaways g ON gc.giveaway_id = g.id
                WHERE gc.giveaway_id = ?
                ORDER BY gc.id DESC
            """
            params = (giveaway_id,)
        else:
            query = """
                SELECT gc.*, g.title as giveaway_title
                FROM giveaway_claims gc
                JOIN giveaways g ON gc.giveaway_id = g.id
                ORDER BY gc.id DESC
            """
            params = ()
        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            claims = [dict(r) for r in rows]
    return claims


# ─────────────────────────────────────────────
# 🔔 FEATURE 1: ACCOUNT EXPIRY & RENEWAL REMINDERS
# ─────────────────────────────────────────────

async def get_expiring_delivered_accounts(days_ahead: int = 2) -> List[Dict[str, Any]]:
    """Find delivered accounts expiring within days_ahead that haven't received reminder."""
    import datetime
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    target_date = (datetime.datetime.now() + datetime.timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = """
            SELECT da.*, u.username, u.full_name
            FROM delivered_accounts da
            JOIN users u ON da.user_id = u.user_id
            WHERE da.expiry_date IS NOT NULL 
              AND da.expiry_date != ''
              AND da.expiry_date <= ?
              AND da.expiry_date >= ?
              AND (da.reminder_sent IS NULL OR da.reminder_sent = 0)
        """
        async with db.execute(query, (target_date, today)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def mark_account_reminder_sent(account_id: int):
    """Mark that reminder has been sent for this delivered account."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE delivered_accounts SET reminder_sent = 1 WHERE id = ?", (account_id,))
        await db.commit()


# ─────────────────────────────────────────────
# 🎁 FEATURE 3: DAILY CHECK-IN & REWARDS ENGINE
# ─────────────────────────────────────────────

async def get_user_daily_checkin_status(user_id: int) -> Dict[str, Any]:
    """Check if user can claim today's daily reward."""
    import datetime
    today = datetime.datetime.now().strftime("%Y-%m-%d")

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM daily_checkins WHERE user_id = ? AND (checked_in_date = ? OR claimed_date = ?) LIMIT 1",
            (user_id, today, today)
        ) as cursor:
            row = await cursor.fetchone()

        # Count total check-ins
        async with db.execute("SELECT COUNT(*) FROM daily_checkins WHERE user_id = ?", (user_id,)) as c_cur:
            total_streak = (await c_cur.fetchone())[0]

        can_claim = (row is None)
        return {
            "can_checkin": can_claim,
            "today": today,
            "already_claimed": not can_claim,
            "total_checkins": total_streak,
            "today_reward": dict(row)["reward_amount"] if row else 0.0
        }


async def claim_user_daily_reward(user_id: int) -> Dict[str, Any]:
    """Claim daily reward for user, credit to wallet, and record log."""
    import datetime
    import random
    today = datetime.datetime.now().strftime("%Y-%m-%d")

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # 1. Check if already claimed today
        async with db.execute(
            "SELECT id FROM daily_checkins WHERE user_id = ? AND (checked_in_date = ? OR claimed_date = ?) LIMIT 1",
            (user_id, today, today)
        ) as cursor:
            if await cursor.fetchone():
                return {"status": "already_claimed", "message": "អ្នកបាន Check-in ទទួលរង្វាន់ថ្ងៃនេះរួចហើយ! សូមមកវិញនៅថ្ងៃស្អែក។"}

        # 2. Pick a reward amount ($0.02 to $0.10)
        rewards_pool = [0.02, 0.03, 0.05, 0.05, 0.08, 0.10]
        reward_amount = round(random.choice(rewards_pool), 2)

        # 3. Credit user wallet balance
        await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (reward_amount, user_id))

        # 4. Log in daily_checkins (both checked_in_date and claimed_date for full schema backward compatibility)
        await db.execute(
            "INSERT INTO daily_checkins (user_id, reward_amount, reward_type, checked_in_date, claimed_date) VALUES (?, ?, ?, ?, ?)",
            (user_id, reward_amount, "wallet_cash", today, today)
        )

        # 5. Log in wallet_transactions
        await db.execute(
            "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)",
            (user_id, reward_amount, "credit", f"🎁 Daily Check-in Reward ({today})")
        )

        await db.commit()

        # Get updated balance
        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as b_cur:
            new_bal_row = await b_cur.fetchone()
            new_balance = new_bal_row["balance"] if new_bal_row else reward_amount

        return {
            "status": "success",
            "reward_amount": reward_amount,
            "new_balance": round(new_balance, 2),
            "message": f"🎉 អបអរសាទរ! អ្នកទទួលបានប្រាក់សុទ្ធ ${reward_amount:.2f} USD ចូលក្នុង Wallet!"
        }


# ─────────────────────────────────────────────
# 💎 FEATURE 4: VIP TIERS & INSTANT CASHBACK
# ─────────────────────────────────────────────

def calculate_vip_tier_from_spend(total_spend: float) -> Dict[str, Any]:
    """Calculate VIP tier, cashback percentage, and progress to next tier."""
    spend = max(0.0, float(total_spend or 0.0))
    if spend >= 100.0:
        return {
            "tier": "diamond",
            "tier_name": "💎 Diamond VIP",
            "cashback_pct": 6.0,
            "next_tier": None,
            "needed_amount": 0.0,
            "progress_pct": 100.0,
            "color": "#38bdf8"
        }
    elif spend >= 50.0:
        needed = round(100.0 - spend, 2)
        prog = round(((spend - 50.0) / 50.0) * 100.0, 1)
        return {
            "tier": "gold",
            "tier_name": "🥇 Gold VIP",
            "cashback_pct": 4.0,
            "next_tier": "Diamond",
            "needed_amount": needed,
            "progress_pct": max(5.0, prog),
            "color": "#fbbf24"
        }
    elif spend >= 20.0:
        needed = round(50.0 - spend, 2)
        prog = round(((spend - 20.0) / 30.0) * 100.0, 1)
        return {
            "tier": "silver",
            "tier_name": "🥈 Silver VIP",
            "cashback_pct": 2.0,
            "next_tier": "Gold",
            "needed_amount": needed,
            "progress_pct": max(5.0, prog),
            "color": "#e2e8f0"
        }
    else:
        needed = round(20.0 - spend, 2)
        prog = round((spend / 20.0) * 100.0, 1)
        return {
            "tier": "bronze",
            "tier_name": "🥉 Bronze VIP",
            "cashback_pct": 0.0,
            "next_tier": "Silver",
            "needed_amount": needed,
            "progress_pct": max(5.0, prog),
            "color": "#cd7f32"
        }


async def get_user_vip_info(user_id: int) -> Dict[str, Any]:
    """Recalculate and return user's VIP status, perks, and next tier target."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Calculate total spend on delivered orders
        async with db.execute(
            "SELECT COALESCE(SUM(price), 0.0) as total FROM orders WHERE user_id = ? AND status = 'delivered'",
            (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            total_spent = float(row["total"]) if row else 0.0

        vip_data = calculate_vip_tier_from_spend(total_spent)

        # Update in users table
        await db.execute(
            "UPDATE users SET total_spent = ?, vip_tier = ? WHERE user_id = ?",
            (total_spent, vip_data["tier"], user_id)
        )
        await db.commit()

        vip_data["total_spent"] = round(total_spent, 2)
        return vip_data


async def apply_order_cashback(user_id: int, order_price: float) -> Optional[Dict[str, Any]]:
    """Automatically credit VIP Cashback into user wallet upon order approval."""
    vip_info = await get_user_vip_info(user_id)
    cashback_pct = vip_info.get("cashback_pct", 0.0)

    if cashback_pct <= 0 or order_price <= 0:
        return None

    cashback_amount = round(order_price * (cashback_pct / 100.0), 2)
    if cashback_amount <= 0:
        return None

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Credit wallet
        await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (cashback_amount, user_id))

        # Log transaction
        await db.execute(
            "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)",
            (user_id, cashback_amount, "credit", f"💸 {vip_info['tier_name']} Cashback ({cashback_pct}%)")
        )
        await db.commit()

        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as b_cur:
            new_bal = (await b_cur.fetchone())[0]

    return {
        "cashback_amount": cashback_amount,
        "cashback_pct": cashback_pct,
        "tier_name": vip_info["tier_name"],
        "new_balance": round(new_bal, 2)
    }


# ─────────────────────────────────────────────
# ⭐ FEATURE 3: VERIFIED CUSTOMER REVIEWS & RATINGS
# ─────────────────────────────────────────────

async def add_product_review(order_id: int, user_id: int, product_id: int, product_name: str, rating: int, comment: str, user_name: str) -> Dict[str, Any]:
    """Add a verified review for a delivered order."""
    safe_rating = max(1, min(5, int(rating or 5)))
    safe_comment = (comment or "").strip()
    safe_user_name = (user_name or "អតិថិជន").strip()

    async with aiosqlite.connect(DATABASE_PATH) as db:
        try:
            await db.execute("""
                INSERT INTO product_reviews (order_id, user_id, product_id, product_name, rating, comment, user_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (order_id, user_id, product_id, product_name, safe_rating, safe_comment, safe_user_name))
            await db.commit()
            return {"status": "success", "message": "អរគុណសម្រាប់ការផ្ដល់មតិយោបល់ និងពិន្ទុផ្កាយ! ⭐"}
        except aiosqlite.IntegrityError:
            return {"status": "already_reviewed", "message": "អ្នកបានផ្ដល់មតិយោបល់លើ Order នេះរួចរាល់ហើយ!"}


async def get_product_reviews(product_id: Optional[int] = None, limit: int = 20) -> Dict[str, Any]:
    """Get verified customer reviews list & average rating score."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        if product_id:
            query = "SELECT * FROM product_reviews WHERE product_id = ? ORDER BY id DESC LIMIT ?"
            params = (product_id, limit)
            avg_query = "SELECT AVG(rating) as avg_score, COUNT(id) as total_count FROM product_reviews WHERE product_id = ?"
            avg_params = (product_id,)
        else:
            query = "SELECT * FROM product_reviews ORDER BY id DESC LIMIT ?"
            params = (limit,)
            avg_query = "SELECT AVG(rating) as avg_score, COUNT(id) as total_count FROM product_reviews"
            avg_params = ()

        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            reviews = [dict(r) for r in rows]

        async with db.execute(avg_query, avg_params) as a_cur:
            a_row = await a_cur.fetchone()
            avg_score = round(float(a_row["avg_score"] or 4.9), 1)
            total_count = int(a_row["total_count"] or 0)

        # Fallback sample reviews if store is brand new
        if total_count == 0:
            sample_reviews = [
                {"id": 1, "product_name": "CapCut Pro (1 Month)", "rating": 5, "comment": "Account ដំណើរការស្រួលណាស់ Admin! Export 4K អត់ជាប់ Watermark ទេ បាញ់លឿនណាស់ 👍", "user_name": "Sokha T.", "created_at": "មុននេះបន្តិច"},
                {"id": 2, "product_name": "ChatGPT Plus", "rating": 5, "comment": "ប្រើ GPT-4o លឿនខ្លាំង ធានាបានល្អ Admin ឆ្លើយតបលឿន!", "user_name": "Vannak K.", "created_at": "១ ម៉ោងមុន"},
                {"id": 3, "product_name": "Canva Pro", "rating": 5, "comment": "ប្រើលើ Email ផ្ទាល់ខ្លួនស្រួលចិត្តណាស់ Template Premium ប្រើបានទាំងអស់ 🥰", "user_name": "Channat S.", "created_at": "២ ម៉ោងមុន"}
            ]
            return {"status": "success", "avg_rating": 4.9, "total_reviews": 185, "data": sample_reviews}

        return {"status": "success", "avg_rating": avg_score, "total_reviews": total_count, "data": reviews}


# ─────────────────────────────────────────────
# 📊 FEATURE 2: DAILY SALES DIGEST FOR ADMIN
# ─────────────────────────────────────────────

async def get_daily_sales_digest(date_str: Optional[str] = None) -> Dict[str, Any]:
    """Calculate daily total sales, order count, new users, and low stock products."""
    import datetime
    target_date = date_str or datetime.datetime.now().strftime("%Y-%m-%d")

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Today's delivered orders and revenue
        async with db.execute("""
            SELECT COUNT(id) as count, COALESCE(SUM(price), 0.0) as revenue
            FROM orders
            WHERE status = 'delivered' AND DATE(created_at) = ?
        """, (target_date,)) as cur:
            sales_row = await cur.fetchone()
            today_orders = int(sales_row["count"]) if sales_row else 0
            today_revenue = float(sales_row["revenue"]) if sales_row else 0.0

        # Total pending orders waiting for approval
        async with db.execute("SELECT COUNT(id) FROM orders WHERE status = 'pending'") as p_cur:
            pending_orders = (await p_cur.fetchone())[0]

        # New users registered today
        async with db.execute("SELECT COUNT(user_id) FROM users WHERE DATE(created_at) = ?", (target_date,)) as u_cur:
            new_users = (await u_cur.fetchone())[0]

        # Low stock products (products where available stock <= 3)
        async with db.execute("""
            SELECT p.id, p.name, COUNT(s.id) as stock_count
            FROM products p
            LEFT JOIN stock_items s ON p.id = s.product_id AND s.is_sold = 0
            WHERE p.is_active = 1
            GROUP BY p.id
            HAVING stock_count <= 3
            ORDER BY stock_count ASC
        """) as s_cur:
            low_stock_rows = await s_cur.fetchall()
        return {
        "date": target_date,
        "today_orders": today_orders,
        "today_revenue": round(today_revenue, 2),
        "pending_orders": pending_orders,
        "new_users": new_users,
        "low_stock_products": low_stock_list
    }


# ─────────────────────────────────────────────
# 🧧 FEATURE 2: LUCKY ANGPAO / RED PACKET ENGINE
# ─────────────────────────────────────────────

async def create_lucky_angpao(creator_id: int, creator_name: str, total_amount: float, total_slots: int, message: Optional[str] = None, is_admin_free: bool = False) -> Dict[str, Any]:
    """Create a new Lucky Angpao envelope."""
    import random
    import string

    if total_amount < 0.10:
        return {"status": "error", "message": "ទឹកប្រាក់អាំងប៉ាវអប្បបរមាគឺ $0.10 USD"}
    if total_slots < 1:
        return {"status": "error", "message": "ចំនួនអ្នកទទួលត្រូវតែចាប់ពី ១ នាក់ឡើងទៅ"}

    code = "ANG-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    msg = (message or "🧧 សូមសំណាងល្អ និងហេងហេងទាំងអស់គ្នា! ✨").strip()

    async with aiosqlite.connect(DATABASE_PATH) as db:
        if not is_admin_free:
            # Check user balance
            async with db.execute("SELECT balance FROM users WHERE user_id = ?", (creator_id,)) as cur:
                row = await cur.fetchone()
                bal = float(row[0]) if row else 0.0
                if bal < total_amount:
                    return {"status": "error", "message": f"សមតុល្យ Wallet មិនគ្រប់គ្រាន់ (អ្នកមាន ${bal:.2f} USD)"}

            # Deduct balance
            await db.execute("UPDATE users SET balance = balance - ? WHERE user_id = ?", (total_amount, creator_id))
            await db.execute(
                "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)",
                (creator_id, total_amount, "debit", f"🧧 បង្កើតកញ្ចប់អាំងប៉ាវ #{code} ({total_slots} នាក់)")
            )

        # Create Angpao record
        await db.execute("""
            INSERT INTO angpaos (code, creator_id, creator_name, total_amount, remaining_amount, total_slots, message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (code, creator_id, creator_name or "Store Sponsor", total_amount, total_amount, total_slots, msg))
        await db.commit()

    return {
        "status": "success",
        "code": code,
        "total_amount": round(total_amount, 2),
        "total_slots": total_slots,
        "message": "🧧 បង្កើតកញ្ចប់អាំងប៉ាវជោគជ័យ!"
    }


async def get_angpao_details(code: str) -> Optional[Dict[str, Any]]:
    """Retrieve Angpao info and list of claimants."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        async with db.execute("SELECT * FROM angpaos WHERE code = ?", (code,)) as cur:
            angpao = await cur.fetchone()
            if not angpao:
                return None
            angpao_dict = dict(angpao)

        async with db.execute("""
            SELECT user_name, amount, claimed_at
            FROM angpao_claims
            WHERE angpao_id = ?
            ORDER BY id DESC
        """, (angpao_dict["id"],)) as c_cur:
            claims = [dict(r) for r in await c_cur.fetchall()]

        angpao_dict["claims"] = claims
        return angpao_dict


async def claim_lucky_angpao(code: str, user_id: int, user_name: str) -> Dict[str, Any]:
    """Claim a slice of a Lucky Angpao."""
    import random

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        async with db.execute("SELECT * FROM angpaos WHERE code = ? AND is_active = 1", (code,)) as cur:
            angpao = await cur.fetchone()
            if not angpao:
                return {"status": "error", "message": "❌ កញ្ចប់អាំងប៉ាវនេះមិនត្រឹមត្រូវ ឬត្រូវបានបិទហើយ!"}

        angpao_id = angpao["id"]
        rem_amount = float(angpao["remaining_amount"])
        rem_slots = int(angpao["total_slots"]) - int(angpao["claimed_slots"])

        if rem_slots <= 0 or rem_amount <= 0.001:
            return {"status": "empty", "message": "🧧 អាំងប៉ាវនេះត្រូវបានបើកអស់ហើយ! (All Claimed)"}

        # Check if already claimed
        async with db.execute("SELECT id FROM angpao_claims WHERE angpao_id = ? AND user_id = ?", (angpao_id, user_id)) as chk:
            if await chk.fetchone():
                return {"status": "already_claimed", "message": "⚠️ អ្នកបានបើកអាំងប៉ាវនេះរួចរាល់ហើយ!"}

        # Calculate random reward
        if rem_slots == 1:
            reward = round(rem_amount, 2)
        else:
            # Random amount between 0.01 and average * 1.8
            avg = rem_amount / rem_slots
            max_r = min(rem_amount - (rem_slots - 1) * 0.01, avg * 1.8)
            reward = round(random.uniform(0.01, max(0.02, max_r)), 2)
            reward = max(0.01, min(reward, rem_amount - (rem_slots - 1) * 0.01))

        new_rem_amount = max(0.0, round(rem_amount - reward, 2))

        # Insert claim record
        safe_name = (user_name or "អតិថិជន").strip()
        await db.execute("""
            INSERT INTO angpao_claims (angpao_id, user_id, user_name, amount)
            VALUES (?, ?, ?, ?)
        """, (angpao_id, user_id, safe_name, reward))

        # Update Angpao
        await db.execute("""
            UPDATE angpaos
            SET remaining_amount = ?, claimed_slots = claimed_slots + 1
            WHERE id = ?
        """, (new_rem_amount, angpao_id))

        # Credit user wallet
        await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (reward, user_id))
        await db.execute(
            "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)",
            (user_id, reward, "credit", f"🧧 បើកអាំងប៉ាវ #{code} ({angpao['creator_name']})")
        )
        await db.commit()

        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as b_cur:
            new_bal = (await b_cur.fetchone())[0]

    return {
        "status": "success",
        "reward_amount": reward,
        "creator_name": angpao["creator_name"],
        "message": angpao["message"],
        "new_balance": round(new_bal, 2)
    }


# ─────────────────────────────────────────────
# 🔔 FEATURE 3: BACK-IN-STOCK NOTIFICATIONS
# ─────────────────────────────────────────────

async def subscribe_stock_notification(product_id: int, user_id: int) -> Dict[str, Any]:
    """Subscribe a user to back-in-stock alerts for a product."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        try:
            await db.execute("""
                INSERT INTO stock_notifications (product_id, user_id, is_notified)
                VALUES (?, ?, 0)
                ON CONFLICT(product_id, user_id) DO UPDATE SET is_notified = 0
            """, (product_id, user_id))
            await db.commit()
            return {"status": "success", "message": "🔔 បានចុះឈ្មោះទទួលដំណឹងជោគជ័យ! នៅពេលមានស្តុក Bot នឹងផ្ញើសារ Alert ភ្លាមៗ។"}
        except Exception as e:
            return {"status": "error", "message": str(e)}


async def get_and_clear_stock_subscribers(product_id: int) -> List[int]:
    """Get all user IDs waiting for this product and mark them as notified."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("""
            SELECT user_id FROM stock_notifications
            WHERE product_id = ? AND is_notified = 0
        """, (product_id,)) as cur:
            rows = await cur.fetchall()
            user_ids = [r[0] for r in rows]

        if user_ids:
            await db.execute("""
                UPDATE stock_notifications
                SET is_notified = 1
                WHERE product_id = ?
            """, (product_id,))
            await db.commit()

    return user_ids


# ─────────────────────────────────────────────
# 💳 WALLET TOP-UP & INSTANT 1-TAP PURCHASE
# ─────────────────────────────────────────────

async def create_topup_request(user_id: int, full_name: str, username: Optional[str], amount: float, proof_image: str) -> Dict[str, Any]:
    """Create a pending wallet top-up request."""
    if amount < 0.50:
        return {"status": "error", "message": "ចំនួនទឹកប្រាក់បញ្ចូលអប្បបរមាគឺ $0.50 USD"}

    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("""
            INSERT INTO wallet_topup_requests (user_id, full_name, username, amount, proof_image, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (user_id, full_name or "អតិថិជន", username, round(amount, 2), proof_image)) as cur:
            topup_id = cur.lastrowid
        await db.commit()

    return {
        "status": "success",
        "topup_id": topup_id,
        "amount": round(amount, 2),
        "message": "✅ បានផ្ញើសំណើបញ្ចូលប្រាក់ជោគជ័យ! សូមរង់ចាំ Admin ពិនិត្យ 1-3 នាទី។"
    }


async def get_topup_request(topup_id: int) -> Optional[Dict[str, Any]]:
    """Get single topup request details."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM wallet_topup_requests WHERE id = ?", (topup_id,)) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            item = dict(row)
            item["proof_image_url"] = item.get("proof_image")
            item["user_name"] = item.get("full_name") or item.get("username") or f"User #{item.get('user_id')}"
            return item


async def get_pending_topup_requests() -> List[Dict[str, Any]]:
    """Retrieve all pending top-up requests."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT * FROM wallet_topup_requests
            WHERE status = 'pending'
            ORDER BY id DESC
        """) as cur:
            rows = await cur.fetchall()
            results = []
            for r in rows:
                item = dict(r)
                item["proof_image_url"] = item.get("proof_image")
                item["user_name"] = item.get("full_name") or item.get("username") or f"User #{item.get('user_id')}"
                results.append(item)
            return results


async def approve_topup_request(topup_id: int) -> Dict[str, Any]:
    """Approve a topup request and atomically credit user balance."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM wallet_topup_requests WHERE id = ?", (topup_id,)) as cur:
            topup = await cur.fetchone()
            if not topup:
                return {"status": "error", "message": "រកមិនឃើញសំណើបញ្ចូលប្រាក់នេះទេ"}
            if topup["status"] != "pending":
                return {"status": "error", "message": f"សំណើនេះត្រូវបាន {topup['status']} រួចហើយ"}

        topup_dict = dict(topup)
        user_id = topup_dict["user_id"]
        amount = float(topup_dict["amount"])

        # 1. Update topup record
        await db.execute("""
            UPDATE wallet_topup_requests
            SET status = 'approved', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (topup_id,))

        # 2. Update user balance
        await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (amount, user_id))

        # 3. Log transaction
        await db.execute("""
            INSERT INTO wallet_transactions (user_id, amount, type, description)
            VALUES (?, ?, 'credit', ?)
        """, (user_id, amount, f"💵 បញ្ចូលលុយតាម KHQR (Top-up #{topup_id})"))

        await db.commit()

        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as b_cur:
            new_bal = (await b_cur.fetchone())[0]

        topup_dict["new_balance"] = round(new_bal, 2)
        topup_dict["proof_image_url"] = topup_dict.get("proof_image")
        topup_dict["user_name"] = topup_dict.get("full_name") or topup_dict.get("username") or f"User #{user_id}"
        return {"status": "success", "data": topup_dict}


async def reject_topup_request(topup_id: int, reason: str = "Slip មិនត្រឹមត្រូវ") -> Dict[str, Any]:
    """Reject a topup request."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM wallet_topup_requests WHERE id = ?", (topup_id,)) as cur:
            topup = await cur.fetchone()
            if not topup:
                return {"status": "error", "message": "រកមិនឃើញសំណើបញ្ចូលប្រាក់នេះទេ"}

        topup_dict = dict(topup)
        await db.execute("""
            UPDATE wallet_topup_requests
            SET status = 'rejected', admin_note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (reason, topup_id))
        await db.commit()

        topup_dict["admin_note"] = reason
        topup_dict["proof_image_url"] = topup_dict.get("proof_image")
        topup_dict["user_name"] = topup_dict.get("full_name") or topup_dict.get("username") or f"User #{topup_dict.get('user_id')}"
        return {"status": "success", "data": topup_dict}


async def instant_buy_product_wallet(
    user_id: int,
    product_id: int,
    promo_code: Optional[str] = None,
    quantity: int = 1
) -> Dict[str, Any]:
    """1-Second Instant purchase using user's wallet balance supporting bulk quantity & wholesale price."""
    quantity = max(1, int(quantity or 1))

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        # 1. Fetch user & product
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as u_cur:
            user = await u_cur.fetchone()
            if not user:
                return {"status": "error", "message": "រកមិនឃើញ User ទេ"}
            user_dict = dict(user)
            user_bal = float(user_dict.get("balance") or 0.0)
            reseller_status = user_dict.get("reseller_status") or "none"

        async with db.execute("SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)) as p_cur:
            prod = await p_cur.fetchone()
            if not prod:
                return {"status": "error", "message": "ទំនិញមិនមាន ឬត្រូវបានបិទ"}
            prod_dict = dict(prod)

        # 2. Check VIP / Reseller discount
        vip_info = await get_user_vip_info(user_id)
        unit_price = float(prod_dict["price"])

        # If approved reseller and product has reseller_price, use reseller_price directly
        if reseller_status == "approved" and prod_dict.get("reseller_price") and float(prod_dict["reseller_price"]) > 0:
            unit_price = float(prod_dict["reseller_price"])
        elif vip_info.get("discount_pct", 0) > 0:
            unit_price = round(unit_price * (1.0 - (vip_info["discount_pct"] / 100.0)), 2)

        total_price = round(unit_price * quantity, 2)

        # Promo Code discount
        if promo_code:
            promo_res = await verify_promo_code(promo_code, total_price)
            if promo_res.get("valid"):
                total_price = float(promo_res.get("final_price", total_price))
                await use_promo_code(promo_code)

        if user_bal < total_price:
            return {
                "status": "insufficient_balance",
                "message": f"សមតុល្យ Wallet មិនគ្រប់គ្រាន់ (អ្នកមាន ${user_bal:.2f} USD, ទំនិញចំនួន {quantity}x តម្លៃសរុប ${total_price:.2f} USD)"
            }

        # 3. Check and claim N stock items
        async with db.execute("""
            SELECT id, credentials FROM stock_items
            WHERE product_id = ? AND is_sold = 0
            ORDER BY id ASC LIMIT ?
        """, (product_id, quantity)) as s_cur:
            stock_items = await s_cur.fetchall()
            if len(stock_items) < quantity:
                return {
                    "status": "out_of_stock",
                    "message": f"ស្តុកមិនគ្រប់គ្រាន់ទេ! ស្តុកនៅសល់ត្រឹមតែ {len(stock_items)} អាខោនប៉ុណ្ណោះ (អ្នកស្នើទិញ {quantity}x)"
                }

        stock_ids = [s["id"] for s in stock_items]
        creds_list = [s["credentials"] for s in stock_items]
        all_credentials = "\n".join(creds_list)

        # 4. Calculate expiry date
        dur_days = int(prod_dict.get("duration_days") or 30)
        exp_date = (datetime.date.today() + datetime.timedelta(days=dur_days)).isoformat()

        # 5. Deduct wallet balance
        new_balance = round(user_bal - total_price, 2)
        await db.execute("UPDATE users SET balance = balance - ?, total_spent = total_spent + ? WHERE user_id = ?", (total_price, total_price, user_id))
        await db.execute("""
            INSERT INTO wallet_transactions (user_id, amount, type, description)
            VALUES (?, ?, 'debit', ?)
        """, (user_id, total_price, f"⚡ ទិញទំនិញភ្លាមៗ {quantity}x: {prod_dict['name']}"))

        # 6. Create delivered order
        kh_now = (datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))).strftime("%Y-%m-%d %H:%M:%S")
        async with db.execute("""
            INSERT INTO orders (user_id, product_id, product_name, price, payment_method, proof_file, status, expiry_date, quantity, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'Wallet Balance', 'instant_wallet_purchase.png', 'delivered', ?, ?, ?, ?)
        """, (user_id, product_id, prod_dict["name"], total_price, exp_date, quantity, kh_now, kh_now)) as o_cur:
            order_id = o_cur.lastrowid

        # 7. Mark stock as sold & deliver
        for sid, cred in zip(stock_ids, creds_list):
            await db.execute("""
                UPDATE stock_items
                SET is_sold = 1, order_id = ?
                WHERE id = ?
            """, (order_id, sid))
            await db.execute("""
                INSERT INTO delivered_accounts (order_id, user_id, product_name, credentials, expiry_date)
                VALUES (?, ?, ?, ?, ?)
            """, (order_id, user_id, prod_dict["name"], cred, exp_date))

        await db.commit()

    # 8. Apply VIP Cashback bonus
    cashback_res = await apply_order_cashback(user_id, total_price)

    return {
        "status": "success",
        "order_id": order_id,
        "product_name": prod_dict["name"],
        "price": total_price,
        "quantity": quantity,
        "credentials": all_credentials,
        "credentials_list": creds_list,
        "duration_days": dur_days,
        "expiry_date": exp_date,
        "new_balance": new_balance,
        "cashback": cashback_res,
        "message": f"⚡ ទិញបានជោគជ័យចំនួន {quantity}x អាខោន! Account ត្រូវបានប្រគល់ភ្លាមៗ។"
    }

# Backward compatibility alias
purchase_order_with_wallet = instant_buy_product_wallet


# ─────────────────────────────────────────────
# 👑 VIP RESELLER & WHOLESALE PRICING ENGINE
# ─────────────────────────────────────────────

async def get_user_vip_info(user_id: int) -> Dict[str, Any]:
    """Retrieve full VIP tier, wholesale discount, cashback percentage and progress."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cursor:
            user = await cursor.fetchone()
            if not user:
                return {
                    "tier_name": "Bronze Member",
                    "tier_badge": "🥉",
                    "discount_pct": 0.0,
                    "cashback_pct": 1.0,
                    "total_spent": 0.0,
                    "reseller_status": "none",
                    "progress": 0,
                    "next_tier": "Silver ($20)",
                    "is_reseller": False,
                    "order_count": 0
                }
            user_dict = dict(user)

        # Calculate actual total spent from delivered orders
        async with db.execute("SELECT COUNT(*), COALESCE(SUM(price), 0.0) FROM orders WHERE user_id = ? AND status = 'delivered'", (user_id,)) as o_cur:
            o_row = await o_cur.fetchone()
            order_count = o_row[0] or 0
            order_spent = float(o_row[1] or 0.0)

        total_spent = max(float(user_dict.get("total_spent") or 0.0), order_spent)
        reseller_status = user_dict.get("reseller_status") or "none"
        is_approved_reseller = (reseller_status == "approved")

        if is_approved_reseller:
            tier_name = "VIP Reseller (តម្លៃបោះដុំ)"
            tier_badge = "👑"
            discount_pct = 20.0
            cashback_pct = 5.0
            progress = 100
            next_tier = None
        elif total_spent >= 100.0:
            tier_name = "Diamond VIP"
            tier_badge = "💎"
            discount_pct = 15.0
            cashback_pct = 5.0
            progress = 100
            next_tier = None
        elif total_spent >= 50.0:
            tier_name = "Gold VIP"
            tier_badge = "🥇"
            discount_pct = 10.0
            cashback_pct = 3.0
            progress = int(((total_spent - 50.0) / 50.0) * 100)
            next_tier = "Diamond ($100)"
        elif total_spent >= 20.0:
            tier_name = "Silver VIP"
            tier_badge = "🥈"
            discount_pct = 5.0
            cashback_pct = 2.0
            progress = int(((total_spent - 20.0) / 30.0) * 100)
            next_tier = "Gold ($50)"
        else:
            tier_name = "Bronze Member"
            tier_badge = "🥉"
            discount_pct = 0.0
            cashback_pct = 1.0
            progress = int((total_spent / 20.0) * 100)
            next_tier = "Silver ($20)"

        progress = max(0, min(100, progress))

        return {
            "tier_name": tier_name,
            "tier_badge": tier_badge,
            "discount_pct": discount_pct,
            "cashback_pct": cashback_pct,
            "total_spent": round(total_spent, 2),
            "reseller_status": reseller_status,
            "progress": progress,
            "next_tier": next_tier,
            "is_reseller": is_approved_reseller,
            "order_count": order_count
        }

async def apply_order_cashback(user_id: int, price: float) -> Dict[str, Any]:
    """Award instant cashback into wallet according to VIP tier."""
    vip = await get_user_vip_info(user_id)
    cashback_rate = float(vip.get("cashback_pct", 1.0)) / 100.0
    cashback_amount = round(price * cashback_rate, 2)

    new_balance = 0.0
    if cashback_amount > 0.00:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            await db.execute("""
                UPDATE users
                SET balance = balance + ?, total_spent = total_spent + ?
                WHERE user_id = ?
            """, (cashback_amount, price, user_id))
            await db.execute("""
                INSERT INTO wallet_transactions (user_id, amount, type, description)
                VALUES (?, ?, 'cashback', ?)
            """, (user_id, cashback_amount, f"🎁 {vip['tier_name']} Cashback ({vip['cashback_pct']}%) ពីការទិញទំនិញ"))
            await db.commit()

            async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as cur:
                row = await cur.fetchone()
                if row:
                    new_balance = float(row[0])

    return {
        "cashback_amount": cashback_amount,
        "cashback_pct": vip.get("cashback_pct", 1.0),
        "tier_name": vip.get("tier_name", "Bronze"),
        "new_balance": new_balance
    }

async def apply_for_reseller(user_id: int, full_name: str, username: Optional[str], contact: str, reason: str) -> Dict[str, Any]:
    """Submit wholesale reseller application."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            INSERT INTO reseller_applications (user_id, full_name, username, contact, reason, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (user_id, full_name, username, contact, reason))
        await db.execute("""
            UPDATE users SET reseller_status = 'pending', reseller_reason = ?, reseller_contact = ?
            WHERE user_id = ?
        """, (reason, contact, user_id))
        await db.commit()
    return {"status": "success", "message": "ពាក្យស្នើសុំធ្វើជា Reseller ត្រូវបានផ្ញើជូន Admin រួចរាល់!"}

async def admin_get_resellers() -> List[Dict[str, Any]]:
    """Get list of reseller applicants and approved VIP resellers."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT 
                r.id as app_id, r.user_id, r.full_name, r.username, r.contact, r.reason, r.status, r.created_at,
                u.balance, u.total_spent
            FROM reseller_applications r
            JOIN users u ON r.user_id = u.user_id
            ORDER BY r.id DESC
        """) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

async def admin_update_reseller_status(app_id: int, target_user_id: int, status: str, admin_note: Optional[str] = "") -> Dict[str, Any]:
    """Approve or reject reseller."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            UPDATE reseller_applications 
            SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (status, admin_note, app_id))
        await db.execute("""
            UPDATE users SET reseller_status = ? WHERE user_id = ?
        """, (status, target_user_id))
        await db.commit()
    return {"status": "success", "message": f"បានកែប្រែស្ថានភាព Reseller ទៅជា '{status}' រួចរាល់!"}

# ─────────────────────────────────────────────
# 🔔 AUTOMATED EXPIRY & RENEWAL REMINDER ENGINE
# ─────────────────────────────────────────────

async def get_expiring_delivered_accounts_for_reminder(days_left: int = 2) -> List[Dict[str, Any]]:
    """Retrieve delivered accounts that are expiring within `days_left` days and haven't been notified yet."""
    today = datetime.date.today()
    target_date = (today + datetime.timedelta(days=days_left)).isoformat()
    today_str = today.isoformat()

    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT 
                da.id as account_id, da.order_id, da.user_id, da.product_name, da.credentials, da.duration_days, da.expiry_date,
                u.full_name, u.username
            FROM delivered_accounts da
            JOIN users u ON da.user_id = u.user_id
            WHERE da.expiry_date >= ? AND da.expiry_date <= ? AND (da.reminder_sent IS NULL OR da.reminder_sent = 0)
            ORDER BY da.id ASC LIMIT 50
        """, (today_str, target_date)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

async def mark_delivered_account_reminder_sent(account_id: int):
    """Mark a delivered account as notified so reminder is not sent repeatedly."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE delivered_accounts SET reminder_sent = 1 WHERE id = ?", (account_id,))
        await db.commit()


# ─────────────────────────────────────────────
# ⭐ CUSTOMER RATINGS & AUTOMATED REVIEW ENGINE
# ─────────────────────────────────────────────

async def save_customer_rating(
    order_id: Optional[int],
    product_id: int,
    user_id: int,
    full_name: str,
    username: Optional[str] = None,
    rating: int = 5,
    comment: Optional[str] = ""
) -> Dict[str, Any]:
    """Record customer star rating, mark order as reviewed, and grant a $0.05 bonus."""
    rating = max(1, min(5, int(rating or 5)))
    win_bonus = 0.05
    new_balance = 0.0

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Check if already reviewed this order to prevent duplicate bonus
        if order_id:
            async with db.execute("SELECT id FROM customer_reviews WHERE order_id = ?", (order_id,)) as cur:
                existing = await cur.fetchone()
                if existing:
                    # Update rating only without duplicate bonus
                    await db.execute("""
                        UPDATE customer_reviews
                        SET rating = ?, comment = ?, full_name = ?, username = ?
                        WHERE id = ?
                    """, (rating, comment or "", full_name, username, existing[0]))
                    await db.commit()
                    async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as b_cur:
                        row = await b_cur.fetchone()
                        if row:
                            new_balance = float(row[0])
                    return {"status": "success", "win_bonus": 0.0, "new_balance": new_balance, "message": "Rating updated"}

        # Insert new review
        await db.execute("""
            INSERT INTO customer_reviews (order_id, product_id, user_id, full_name, username, rating, comment, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """, (order_id, product_id, user_id, full_name, username, rating, comment or ""))

        # Mark order as reviewed
        if order_id:
            await db.execute("UPDATE orders SET is_reviewed = 1, review_requested = 1 WHERE id = ?", (order_id,))

        # Credit $0.05 review bonus into wallet
        await db.execute("""
            UPDATE users SET balance = balance + ? WHERE user_id = ?
        """, (win_bonus, user_id))

        await db.execute("""
            INSERT INTO wallet_transactions (user_id, amount, type, description)
            VALUES (?, ?, 'credit', '🎁 រង្វាន់លើកទឹកចិត្តផ្ដល់ពិន្ទុ Rating ៥ ផ្កាយ')
        """, (user_id, win_bonus))

        await db.commit()

        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as b_cur:
            row = await b_cur.fetchone()
            if row:
                new_balance = float(row[0])

    return {
        "status": "success",
        "win_bonus": win_bonus,
        "new_balance": new_balance,
        "message": f"បានផ្ដល់ពិន្ទុ {rating} ផ្កាយ & ទទួលបាន +${win_bonus:.2f} USD!"
    }

async def get_recent_customer_reviews(limit: int = 15) -> List[Dict[str, Any]]:
    """Get list of authentic customer reviews."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT 
                r.*, p.name as product_name, p.image_url as product_image
            FROM customer_reviews r
            LEFT JOIN products p ON r.product_id = p.id
            ORDER BY r.id DESC LIMIT ?
        """, (limit,)) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

async def get_product_rating_summary(product_id: int) -> Dict[str, Any]:
    """Calculate average rating and total reviews for a product."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("""
            SELECT COUNT(*), AVG(rating) FROM customer_reviews WHERE product_id = ?
        """, (product_id,)) as cur:
            row = await cur.fetchone()
            count = row[0] or 0
            avg_rating = round(float(row[1] or 5.0), 1) if count > 0 else 5.0
            return {"count": count, "avg_rating": avg_rating}


async def get_product_reviews_list(product_id: int) -> Dict[str, Any]:
    """Get comprehensive customer reviews and star distribution for a product."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # Summary
        async with db.execute("""
            SELECT COUNT(*) as count, AVG(rating) as avg_rating
            FROM customer_reviews
            WHERE product_id = ?
        """, (product_id,)) as cur:
            row = await cur.fetchone()
            count = row["count"] if row else 0
            avg_rating = round(float(row["avg_rating"] or 5.0), 1) if count > 0 else 5.0

        # Star breakdown
        star_counts = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
        async with db.execute("""
            SELECT rating, COUNT(*) as cnt
            FROM customer_reviews
            WHERE product_id = ?
            GROUP BY rating
        """, (product_id,)) as cur:
            rows = await cur.fetchall()
            for r in rows:
                star_counts[int(r["rating"])] = int(r["cnt"])

        # Fetch reviews list
        async with db.execute("""
            SELECT r.*, p.name as product_name, p.image_url as product_image
            FROM customer_reviews r
            LEFT JOIN products p ON r.product_id = p.id
            WHERE r.product_id = ?
            ORDER BY r.id DESC LIMIT 30
        """, (product_id,)) as cur:
            rows = await cur.fetchall()
            reviews = [dict(r) for r in rows]

        return {
            "status": "success",
            "count": count,
            "avg_rating": avg_rating,
            "star_counts": star_counts,
            "reviews": reviews
        }



# ─────────────────────────────────────────────
# ⚡ FLASH SALE ENGINE
# ─────────────────────────────────────────────

async def get_active_flash_sale() -> Optional[Dict[str, Any]]:
    """Get current active flash sale with remaining seconds."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT * FROM flash_sales
            WHERE is_active = 1
            ORDER BY id DESC LIMIT 1
        """) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            fs = dict(row)

            # Check expiry
            try:
                end_dt = dt.fromisoformat(fs["end_time"])
                now = dt.now()
                remaining = int((end_dt - now).total_seconds())
                if remaining <= 0:
                    await db.execute("UPDATE flash_sales SET is_active = 0 WHERE id = ?", (fs["id"],))
                    await db.commit()
                    return None
                fs["remaining_seconds"] = remaining
                return fs
            except Exception:
                return None

async def set_flash_sale(title: str, discount_pct: float, duration_hours: float, is_active: int = 1) -> Dict[str, Any]:
    """Activate or create a new Flash Sale."""
    end_time = (dt.now() + timedelta(hours=float(duration_hours))).isoformat()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE flash_sales SET is_active = 0")
        await db.execute("""
            INSERT INTO flash_sales (title, discount_pct, end_time, is_active)
            VALUES (?, ?, ?, ?)
        """, (title or "⚡ MEGA FLASH SALE ⚡", float(discount_pct), end_time, is_active))
        await db.commit()
    return {"status": "success", "message": f"បានបើកដំណើរការ Flash Sale {discount_pct}% រយៈពេល {duration_hours} ម៉ោង!"}

async def toggle_flash_sale(is_active: int) -> Dict[str, Any]:
    """Turn Flash Sale on or off."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE flash_sales SET is_active = ?", (is_active,))
        await db.commit()
    return {"status": "success", "message": "បានកែប្រែស្ថានភាព Flash Sale រួចរាល់!"}

# ─────────────────────────────────────────────
# 🔔 AUTO RESTOCK NOTIFICATION ENGINE
# ─────────────────────────────────────────────

async def subscribe_stock_notification(user_id: int, product_id: int) -> Dict[str, Any]:
    """Subscribe user to be alerted via Telegram when a product gets restocked."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            INSERT INTO stock_notifications (product_id, user_id, is_notified)
            VALUES (?, ?, 0)
            ON CONFLICT(product_id, user_id) DO UPDATE SET is_notified = 0
        """, (product_id, user_id))
        await db.commit()
    return {"status": "success", "message": "🔔 បានចុះឈ្មោះទទួលដំណឹងជោគជ័យ! Bot នឹងផ្ញើសារប្រាប់ភ្លាមៗពេលមានស្តុក។"}

async def get_and_clear_stock_subscribers(product_id: int) -> List[int]:
    """Retrieve all pending subscribers for a product and mark as notified."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT user_id FROM stock_notifications
            WHERE product_id = ? AND is_notified = 0
        """, (product_id,)) as cur:
            rows = await cur.fetchall()
            user_ids = [r["user_id"] for r in rows]

        if user_ids:
            await db.execute("""
                UPDATE stock_notifications
                SET is_notified = 1
                WHERE product_id = ?
            """, (product_id,))
            await db.commit()

    return user_ids


# ─────────────────────────────────────────────
# 🎟️ PROMO CODES ENGINE
# ─────────────────────────────────────────────

async def get_all_promo_codes() -> List[Dict[str, Any]]:
    """Retrieve all promo codes for Admin panel."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM promo_codes ORDER BY id DESC") as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

async def create_promo_code(
    code: str,
    discount_percent: float = 0.0,
    discount_amount: float = 0.0,
    min_spend: float = 0.0,
    max_uses: int = 100
) -> Dict[str, Any]:
    """Create a new Promo Code."""
    code_clean = code.strip().upper()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        try:
            await db.execute("""
                INSERT INTO promo_codes (code, discount_percent, discount_amount, min_spend, max_uses, used_count, is_active)
                VALUES (?, ?, ?, ?, ?, 0, 1)
            """, (code_clean, float(discount_percent or 0.0), float(discount_amount or 0.0), float(min_spend or 0.0), int(max_uses or 100)))
            await db.commit()
            return {"status": "success", "message": f"បានបង្កើត Promo Code '{code_clean}' ជោគជ័យ!"}
        except Exception as e:
            return {"status": "error", "message": f"Promo Code '{code_clean}' មានរួចហើយ ឬមានបញ្ហា: {str(e)}"}

async def toggle_promo_code(promo_id: int, is_active: int) -> Dict[str, Any]:
    """Enable or disable a promo code."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE promo_codes SET is_active = ? WHERE id = ?", (is_active, promo_id))
        await db.commit()
    return {"status": "success", "message": "បានកែប្រែស្ថានភាព Promo Code រួចរាល់!"}

async def delete_promo_code(promo_id: int) -> Dict[str, Any]:
    """Delete a promo code."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("DELETE FROM promo_codes WHERE id = ?", (promo_id,))
        await db.commit()
    return {"status": "success", "message": "បានលុប Promo Code រួចរាល់!"}

async def verify_promo_code(code: str, total_price: float) -> Dict[str, Any]:
    """Verify promo code validity and calculate discount."""
    if not code:
        return {"valid": False, "discount": 0.0, "final_price": total_price, "message": "គ្មានកូដ"}
    code_clean = code.strip().upper()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM promo_codes WHERE code = ? AND is_active = 1", (code_clean,)) as cur:
            promo = await cur.fetchone()
            if not promo:
                return {"valid": False, "discount": 0.0, "final_price": total_price, "message": "កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ ឬផុតកំណត់"}
            p_dict = dict(promo)
            if p_dict["used_count"] >= p_dict["max_uses"]:
                return {"valid": False, "discount": 0.0, "final_price": total_price, "message": "កូដនេះត្រូវបានប្រើប្រាស់អស់ចំនួនកំណត់ហើយ"}
            if total_price < float(p_dict["min_spend"]):
                return {"valid": False, "discount": 0.0, "final_price": total_price, "message": f"កូដនេះអាចប្រើបានសម្រាប់ការទិញចាប់ពី ${p_dict['min_spend']:.2f} ឡើងទៅ"}

            discount = 0.0
            if float(p_dict["discount_percent"]) > 0:
                discount = round(total_price * (float(p_dict["discount_percent"]) / 100.0), 2)
            elif float(p_dict["discount_amount"]) > 0:
                discount = min(total_price, float(p_dict["discount_amount"]))

            final_price = max(0.01, round(total_price - discount, 2))
            return {
                "valid": True,
                "code": code_clean,
                "discount": discount,
                "final_price": final_price,
                "message": f"ទទួលបានការបញ្ចុះតម្លៃ ${discount:.2f} USD!"
            }

async def use_promo_code(code: str):
    """Increment the redemption count of a promo code."""
    if not code:
        return
    code_clean = code.strip().upper()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?", (code_clean,))
        await db.commit()

async def get_admin_analytics_data():
    """Retrieve comprehensive analytics data for admin dashboard.
    Includes: orders revenue, topup revenue, daily sales breakdown,
    today's best sellers, and 7-day product performance.
    """
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        today_str = datetime.date.today().isoformat()

        # ── 1. Order Revenue (delivered orders only) ──
        async with db.execute(
            "SELECT COUNT(*) as total_orders, COALESCE(SUM(price), 0.0) as total_revenue "
            "FROM orders WHERE status = 'delivered'"
        ) as cur:
            row = await cur.fetchone()
            total_orders = row["total_orders"] if row else 0
            order_revenue_total = float(row["total_revenue"]) if row else 0.0

        # ── 2. Today's order revenue ──
        async with db.execute(
            "SELECT COUNT(*) as today_orders, COALESCE(SUM(price), 0.0) as today_revenue "
            "FROM orders WHERE status = 'delivered' AND DATE(created_at) = ?",
            (today_str,)
        ) as cur:
            row = await cur.fetchone()
            today_orders = row["today_orders"] if row else 0
            today_order_revenue = float(row["today_revenue"]) if row else 0.0

        # ── 3. Topup Revenue (approved slips = wallet top-ups) ──
        async with db.execute(
            "SELECT COALESCE(SUM(amount), 0.0) as total_topup FROM wallet_topup_requests WHERE status = 'approved'"
        ) as cur:
            row = await cur.fetchone()
            topup_revenue_total = float(row["total_topup"]) if row else 0.0

        async with db.execute(
            "SELECT COALESCE(SUM(amount), 0.0) as today_topup FROM wallet_topup_requests "
            "WHERE status = 'approved' AND DATE(created_at) = ?",
            (today_str,)
        ) as cur:
            row = await cur.fetchone()
            today_topup_revenue = float(row["today_topup"]) if row else 0.0

        # Combined totals
        total_revenue      = order_revenue_total + topup_revenue_total
        today_revenue      = today_order_revenue + today_topup_revenue

        # ── 4. Total Users ──
        async with db.execute("""
            SELECT COUNT(DISTINCT uid) as user_count FROM (
                SELECT user_id as uid FROM users WHERE user_id IS NOT NULL
                UNION
                SELECT user_id as uid FROM orders WHERE user_id IS NOT NULL
                UNION
                SELECT user_id as uid FROM wallet_topup_requests WHERE user_id IS NOT NULL
            )
        """) as cur:
            row = await cur.fetchone()
            total_users = row["user_count"] if row and row["user_count"] else 0
            if total_users <= 0:
                total_users = 1

        # ── 5. AOV (based on delivered orders only) ──
        aov = round(order_revenue_total / total_orders, 2) if total_orders > 0 else 0.0

        # ── 6. Last 7 Days Daily Sales (orders + topups combined) ──
        daily_sales = []
        for i in range(6, -1, -1):
            d = datetime.date.today() - datetime.timedelta(days=i)
            d_str = d.isoformat()
            d_label = d.strftime("%a %d/%m")

            async with db.execute(
                "SELECT COUNT(*) as count, COALESCE(SUM(price), 0.0) as revenue "
                "FROM orders WHERE status = 'delivered' AND DATE(created_at) = ?",
                (d_str,)
            ) as cur:
                r = await cur.fetchone()
                day_orders  = r["count"]   if r else 0
                day_revenue = float(r["revenue"]) if r else 0.0

            async with db.execute(
                "SELECT COALESCE(SUM(amount), 0.0) as topup_rev "
                "FROM wallet_topup_requests WHERE status = 'approved' AND DATE(created_at) = ?",
                (d_str,)
            ) as cur:
                rt = await cur.fetchone()
                day_topup = float(rt["topup_rev"]) if rt else 0.0

            daily_sales.append({
                "date":    d_str,
                "label":   d_label,
                "count":   day_orders,
                "revenue": round(day_revenue + day_topup, 2),
                "order_revenue": round(day_revenue, 2),
                "topup_revenue": round(day_topup, 2),
            })

        # ── 7. Top 5 Best-Selling Products (all time) ──
        top_products = []
        async with db.execute("""
            SELECT product_name,
                   COUNT(*) as units_sold,
                   COALESCE(SUM(price), 0.0) as total_revenue
            FROM orders
            WHERE status = 'delivered'
            GROUP BY product_name
            ORDER BY units_sold DESC, total_revenue DESC
            LIMIT 5
        """) as cur:
            rows = await cur.fetchall()
            for r in rows:
                top_products.append({
                    "name":       r["product_name"],
                    "units_sold": r["units_sold"],
                    "revenue":    float(r["total_revenue"])
                })

        # ── 8. Today's Best-Selling Products ──
        today_products = []
        async with db.execute("""
            SELECT product_name,
                   COUNT(*) as units_sold,
                   COALESCE(SUM(price), 0.0) as total_revenue
            FROM orders
            WHERE status = 'delivered' AND DATE(created_at) = ?
            GROUP BY product_name
            ORDER BY units_sold DESC, total_revenue DESC
            LIMIT 5
        """, (today_str,)) as cur:
            rows = await cur.fetchall()
            for r in rows:
                today_products.append({
                    "name":       r["product_name"],
                    "units_sold": r["units_sold"],
                    "revenue":    float(r["total_revenue"])
                })

        # ── 9. Payment Method Distribution ──
        async with db.execute(
            "SELECT payment_method, COUNT(*) as count FROM orders "
            "WHERE status = 'delivered' GROUP BY payment_method"
        ) as cur:
            rows = await cur.fetchall()
            payments = [{"method": r["payment_method"] or "Other", "count": r["count"]} for r in rows]

        return {
            "status":              "success",
            # Revenue
            "total_revenue":       round(total_revenue, 2),
            "order_revenue_total": round(order_revenue_total, 2),
            "topup_revenue_total": round(topup_revenue_total, 2),
            "today_revenue":       round(today_revenue, 2),
            "today_order_revenue": round(today_order_revenue, 2),
            "today_topup_revenue": round(today_topup_revenue, 2),
            # Orders
            "today_orders":        today_orders,
            "total_orders":        total_orders,
            # Users & AOV
            "total_users":         total_users,
            "aov":                 aov,
            # Charts
            "daily_sales":         daily_sales,
            "top_products":        top_products,
            "today_products":      today_products,
            "payments":            payments,
        }



# ═══════════════════════════════════════════════════════════════════
# 👥 FEATURE: ADVANCED USER & ROLE ADMIN MANAGEMENT SUITE
# ═══════════════════════════════════════════════════════════════════

async def admin_get_users(
    search: Optional[str] = None,
    role_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """Retrieve users list with rich statistics and filters for Admin Panel."""
    from config import get_admin_ids

    admin_ids = get_admin_ids()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        query = """
            SELECT 
                u.user_id,
                u.username,
                u.full_name,
                u.photo_url,
                COALESCE(u.role, 'user') as role,
                u.is_admin,
                COALESCE(u.balance, 0.0) as balance,
                COALESCE(u.total_spent, 0.0) as total_spent,
                COALESCE(u.vip_tier, 'bronze') as vip_tier,
                COALESCE(u.reseller_status, 'none') as reseller_status,
                COALESCE(u.is_banned, 0) as is_banned,
                u.ban_reason,
                u.created_at,
                COALESCE(u.last_active_at, u.created_at) as last_active_at,
                (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id) as total_orders,
                (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id AND o.status = 'delivered') as completed_orders
            FROM users u
            WHERE 1=1
        """
        params = []

        if search:
            s = f"%{search.strip().lower()}%"
            query += " AND (CAST(u.user_id AS TEXT) LIKE ? OR LOWER(COALESCE(u.username, '')) LIKE ? OR LOWER(COALESCE(u.full_name, '')) LIKE ?)"
            params.extend([s, s, s])

        if role_filter and role_filter != "all":
            if role_filter == "admin":
                query += " AND (u.is_admin = 1 OR u.role IN ('admin', 'super_admin', 'moderator', 'staff'))"
            elif role_filter == "banned":
                query += " AND u.is_banned = 1"
            elif role_filter == "reseller":
                query += " AND (u.role = 'reseller' OR u.reseller_status = 'approved')"
            elif role_filter in ("bronze", "silver", "gold", "platinum", "diamond"):
                query += " AND LOWER(COALESCE(u.vip_tier, 'bronze')) = ?"
                params.append(role_filter)
            else:
                query += " AND LOWER(COALESCE(u.role, 'user')) = ?"
                params.append(role_filter.lower())

        query += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        async with db.execute(query, tuple(params)) as cur:
            rows = await cur.fetchall()

        users_list = []
        for r in rows:
            u_dict = dict(r)
            uid = u_dict["user_id"]
            # Resolve display role
            effective_role = u_dict.get("role") or "user"
            if uid in admin_ids:
                effective_role = "super_admin"
            elif u_dict.get("is_admin") == 1 and effective_role == "user":
                effective_role = "admin"
            elif u_dict.get("reseller_status") == "approved" and effective_role == "user":
                effective_role = "reseller"
            
            u_dict["role"] = effective_role
            users_list.append(u_dict)

        # Total counts summary for KPI badges
        summary = {"total_users": 0, "total_admins": 0, "total_vip": 0, "total_resellers": 0, "total_banned": 0}
        try:
            async with db.execute("SELECT COUNT(*) FROM users") as cur:
                summary["total_users"] = (await cur.fetchone())[0]
            async with db.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1 OR role IN ('admin', 'super_admin', 'moderator', 'staff')") as cur:
                summary["total_admins"] = (await cur.fetchone())[0]
            async with db.execute("SELECT COUNT(*) FROM users WHERE vip_tier IN ('silver', 'gold', 'platinum', 'diamond')") as cur:
                summary["total_vip"] = (await cur.fetchone())[0]
            async with db.execute("SELECT COUNT(*) FROM users WHERE reseller_status = 'approved' OR role = 'reseller'") as cur:
                summary["total_resellers"] = (await cur.fetchone())[0]
            async with db.execute("SELECT COUNT(*) FROM users WHERE is_banned = 1") as cur:
                summary["total_banned"] = (await cur.fetchone())[0]
        except Exception as e:
            logger.error(f"Error computing user summary: {e}")

        return {
            "status": "success",
            "users": users_list,
            "summary": summary,
            "count": len(users_list)
        }


async def admin_get_user_details(user_id: int) -> Dict[str, Any]:
    """Retrieve full user profile, order history, and wallet ledger for Admin."""
    from config import get_admin_ids

    admin_ids = get_admin_ids()
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row

        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cur:
            user_row = await cur.fetchone()
            if not user_row:
                return {"status": "error", "message": "User not found"}

        user_data = dict(user_row)
        if user_id in admin_ids:
            user_data["role"] = "super_admin"
        elif user_data.get("is_admin") == 1 and (not user_data.get("role") or user_data.get("role") == "user"):
            user_data["role"] = "admin"

        # Recent orders
        async with db.execute("""
            SELECT id, product_name, price, status, payment_method, created_at
            FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 15
        """, (user_id,)) as cur:
            orders = [dict(r) for r in await cur.fetchall()]

        # Recent wallet transactions
        async with db.execute("""
            SELECT id, amount, type, description, created_at
            FROM wallet_transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 15
        """, (user_id,)) as cur:
            transactions = [dict(r) for r in await cur.fetchall()]

        vip_info = await get_user_vip_info(user_id)

        return {
            "status": "success",
            "user": user_data,
            "orders": orders,
            "transactions": transactions,
            "vip_info": vip_info
        }


async def admin_update_user_role(user_id: int, new_role: str, admin_user_id: Optional[int] = None) -> Dict[str, Any]:
    """Update user role and sync is_admin flag."""
    valid_roles = ["super_admin", "admin", "moderator", "staff", "reseller", "user"]
    new_role = new_role.lower().strip()
    if new_role not in valid_roles:
        return {"status": "error", "message": f"Invalid role: {new_role}"}

    is_admin_flag = 1 if new_role in ("super_admin", "admin", "moderator", "staff") else 0
    reseller_status = "approved" if new_role == "reseller" else None

    async with aiosqlite.connect(DATABASE_PATH) as db:
        if reseller_status:
            await db.execute("""
                UPDATE users 
                SET role = ?, is_admin = ?, reseller_status = 'approved'
                WHERE user_id = ?
            """, (new_role, is_admin_flag, user_id))
        else:
            await db.execute("""
                UPDATE users 
                SET role = ?, is_admin = ?
                WHERE user_id = ?
            """, (new_role, is_admin_flag, user_id))
        await db.commit()

    return {"status": "success", "message": f"User {user_id} role updated to {new_role}", "role": new_role}


async def admin_adjust_user_balance(
    user_id: int,
    amount: float,
    reason: str,
    admin_user_id: Optional[int] = None
) -> Dict[str, Any]:
    """Manually add or deduct balance with automatic ledger log."""
    if amount == 0:
        return {"status": "error", "message": "Amount must not be zero"}

    tx_type = "admin_deposit" if amount > 0 else "admin_deduct"
    desc = f"Admin Manual ({'+' if amount > 0 else ''}${amount:.2f}): {reason.strip() if reason else 'No reason'}"

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            UPDATE users 
            SET balance = MAX(0.0, COALESCE(balance, 0.0) + ?)
            WHERE user_id = ?
        """, (amount, user_id))

        await db.execute("""
            INSERT INTO wallet_transactions (user_id, amount, type, description)
            VALUES (?, ?, ?, ?)
        """, (user_id, abs(amount), tx_type, desc))

        await db.commit()

        async with db.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
            new_balance = row[0] if row else 0.0

    return {
        "status": "success",
        "message": f"Updated balance by {'+' if amount > 0 else ''}${amount:.2f}",
        "new_balance": round(new_balance, 2)
    }


async def admin_toggle_user_ban(
    user_id: int,
    is_banned: bool,
    reason: Optional[str] = None
) -> Dict[str, Any]:
    """Ban or unban a user."""
    ban_flag = 1 if is_banned else 0
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute("""
            UPDATE users 
            SET is_banned = ?, ban_reason = ?
            WHERE user_id = ?
        """, (ban_flag, reason if is_banned else None, user_id))
        await db.commit()

    action = "banned" if is_banned else "unbanned"
    return {"status": "success", "message": f"User {user_id} has been {action}", "is_banned": ban_flag}


async def get_user_role_info(user_id: int) -> Dict[str, Any]:
    """Retrieve comprehensive role, permissions, and status for client UI."""
    from config import get_admin_ids

    user = await get_user(user_id)
    if not user:
        return {"role": "user", "role_title": "Member", "badge_icon": "🌟", "is_admin": False, "permissions": []}

    admin_ids = get_admin_ids()
    db_role = (user.get("role") or "user").lower()
    
    if user_id in admin_ids:
        role = "super_admin"
        title = "Super Admin"
        icon = "👑"
        perms = ["all", "manage_users", "manage_roles", "manage_products", "manage_orders", "manage_finances", "system_backup"]
    elif db_role in ("admin", "super_admin") or user.get("is_admin") == 1:
        role = "admin"
        title = "Store Admin"
        icon = "⚡"
        perms = ["manage_users", "manage_products", "manage_orders", "manage_finances", "broadcast", "analytics"]
    elif db_role in ("moderator", "staff"):
        role = "moderator"
        title = "Store Staff"
        icon = "🛡️"
        perms = ["manage_orders", "manage_topups", "view_users", "customer_support"]
    elif db_role == "reseller" or user.get("reseller_status") == "approved":
        role = "reseller"
        title = "VIP Reseller"
        icon = "💼"
        perms = ["wholesale_pricing", "priority_support"]
    else:
        role = "user"
        title = "Store Member"
        icon = "🌟"
        perms = ["standard_shopping"]

    return {
        "user_id": user_id,
        "role": role,
        "role_title": title,
        "badge_icon": icon,
        "is_admin": role in ("super_admin", "admin", "moderator"),
        "permissions": perms,
        "is_banned": bool(user.get("is_banned", 0)),
        "ban_reason": user.get("ban_reason")
    }


# ─────────────────────────────────────────────────────────────
# 🎧 CUSTOMER SUPPORT TICKETS & ADMIN REPLIES
# ─────────────────────────────────────────────────────────────

async def create_support_ticket(user_id: int, user_name: str, message: str, subject: str = "General Support") -> dict:
    """Create a new support ticket submitted by a customer."""
    try:
        async with get_db() as db:
            cursor = await db.execute(
                """
                INSERT INTO support_tickets (user_id, user_name, subject, message, status)
                VALUES (?, ?, ?, ?, 'pending')
                """,
                (user_id, user_name, subject, message)
            )
            await db.commit()
            ticket_id = cursor.lastrowid
            return {
                "status": "success",
                "message": "បានផ្ញើសំបុត្រជំនួយជោគជ័យ!",
                "ticket_id": ticket_id
            }
    except Exception as e:
        logger.error(f"Error creating support ticket: {e}")
        return {"status": "error", "message": str(e)}


async def get_support_tickets(status: str = None, limit: int = 100) -> list:
    """Retrieve support tickets for admin dashboard."""
    try:
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            if status and status != "all":
                cursor = await db.execute(
                    """
                    SELECT * FROM support_tickets
                    WHERE status = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (status, limit)
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT * FROM support_tickets
                    ORDER BY 
                        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
                        created_at DESC
                    LIMIT ?
                    """,
                    (limit,)
                )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error getting support tickets: {e}")
        return []


async def get_user_support_tickets(user_id: int) -> list:
    """Retrieve support tickets submitted by a specific user."""
    try:
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT * FROM support_tickets
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT 50
                """,
                (user_id,)
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error getting user support tickets: {e}")
        return []


async def get_support_ticket_by_id(ticket_id: int) -> dict:
    """Get a single support ticket by ID."""
    try:
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM support_tickets WHERE id = ?", (ticket_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting support ticket {ticket_id}: {e}")
        return None


async def reply_support_ticket(ticket_id: int, admin_reply: str, replied_by: str = "Admin") -> dict:
    """Admin replies to a customer support ticket."""
    try:
        async with get_db() as db:
            await db.execute(
                """
                UPDATE support_tickets
                SET status = 'answered',
                    admin_reply = ?,
                    replied_by = ?,
                    replied_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (admin_reply, replied_by, ticket_id)
            )
            await db.commit()
            return {
                "status": "success",
                "message": "បានឆ្លើយតបសំបុត្រជំនួយជោគជ័យ!"
            }
    except Exception as e:
        logger.error(f"Error replying to support ticket {ticket_id}: {e}")
        return {"status": "error", "message": str(e)}












