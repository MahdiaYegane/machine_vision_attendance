# -*- coding: utf-8 -*-
"""لایهٔ ذخیره‌سازی مبتنی بر دیتابیس SQLite.

«SQLite» داخل خودِ پایتون است (ماژول استاندارد sqlite3) و نیازی به نصب یا
راه‌اندازی هیچ سروری ندارد؛ کل دیتابیس فقط یک فایل است: data/attendance.db

این ماژول دقیقاً همان توابع نسخهٔ قبلی (load/save/get_settings/...) را ارائه
می‌دهد تا بقیهٔ برنامه (app.py و reports.py) بدون هیچ تغییری کار کند.
نوشتن‌ها با قفل سریال می‌شوند و در یک تراکنش انجام می‌گیرند.

اولین بار که برنامه با این نسخه اجرا شود، اگر فایل‌های JSON قدیمی در پوشهٔ
data/ باشند، اطلاعاتشان (شامل چهره‌های ثبت‌شده) به‌صورت خودکار به دیتابیس
منتقل می‌شود تا داده‌ای از دست نرود.
"""

import os
import json
import uuid
import sqlite3
import threading
from datetime import datetime

import jdatetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "attendance.db")

_LOCK = threading.RLock()
_CONN = None

# فایل‌های JSON نسخهٔ قبلی (فقط برای انتقال یک‌بارهٔ داده‌ها).
FILES = {
    "employees": "employees.json",
    "attendance": "attendance.json",
    "leaves": "leaves.json",
    "approvals": "approvals.json",
    "settings": "settings.json",
}

DEFAULT_SETTINGS = {
    "start_time": "08:30",      # ساعت شروع رسمی کار (مبنای محاسبهٔ تأخیر)
    "work_hours": 8,            # ساعت کاری استاندارد روزانه (مبنای اضافه‌کاری)
    "threshold": 0.363,         # آستانهٔ شباهت کسینوسی برای تشخیص چهره
    "company": "شرکت نمونه",
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS employees (
    id        TEXT PRIMARY KEY,
    code      TEXT,
    name      TEXT,
    position  TEXT,
    unit      TEXT,
    status    TEXT,
    created   INTEGER,
    encodings TEXT          -- لیست بردارهای چهره به‌صورت JSON
);
CREATE TABLE IF NOT EXISTS attendance (
    id          TEXT PRIMARY KEY,
    employee_id TEXT,
    type        TEXT,       -- 'in' یا 'out'
    ts          INTEGER,
    jdate       TEXT
);
CREATE TABLE IF NOT EXISTS leaves (
    id          TEXT PRIMARY KEY,
    employee_id TEXT,
    dfrom       TEXT,       -- معادل کلید 'from'
    dto         TEXT,       -- معادل کلید 'to'
    type        TEXT,
    days        TEXT,
    note        TEXT,
    status      TEXT
);
CREATE TABLE IF NOT EXISTS approvals (
    id          TEXT PRIMARY KEY,
    employee_id TEXT,
    dfrom       TEXT,
    dto         TEXT,
    status      TEXT,
    ts          INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT               -- مقدار به‌صورت JSON
);
CREATE INDEX IF NOT EXISTS idx_att_emp  ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(jdate);
"""


# =====================================================================
#  اتصال و راه‌اندازی دیتابیس
# =====================================================================
def _connect():
    global _CONN
    if _CONN is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        _CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
        _CONN.row_factory = sqlite3.Row
        _CONN.execute("PRAGMA journal_mode=WAL;")
        _CONN.executescript(_SCHEMA)
        _CONN.commit()
        _migrate_from_json()
    return _CONN


def _migrate_from_json():
    """انتقال یک‌بارهٔ داده‌های JSON قدیمی به دیتابیس (در صورت وجود)."""
    marker = os.path.join(DATA_DIR, ".migrated")
    if os.path.exists(marker):
        return
    try:
        cur = _CONN.execute("SELECT COUNT(*) AS c FROM employees")
        if cur.fetchone()["c"] == 0:
            for name in ("employees", "attendance", "leaves", "approvals"):
                p = os.path.join(DATA_DIR, FILES[name])
                if os.path.exists(p):
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, list) and data:
                        _save(name, data)
            sp = os.path.join(DATA_DIR, FILES["settings"])
            if os.path.exists(sp):
                with open(sp, "r", encoding="utf-8") as f:
                    s = json.load(f)
                if isinstance(s, dict):
                    _save("settings", s)
    except Exception as e:
        print("[storage] انتقال داده‌های قدیمی ناموفق بود:", e)
    # نشانه‌گذاری تا انتقال دوباره انجام نشود.
    try:
        with open(marker, "w", encoding="utf-8") as f:
            f.write(datetime.now().isoformat())
    except Exception:
        pass


# =====================================================================
#  تبدیل سطر دیتابیس ⇄ دیکشنری برنامه
# =====================================================================
def _emp_from_row(r):
    try:
        enc = json.loads(r["encodings"]) if r["encodings"] else []
    except Exception:
        enc = []
    return {
        "id": r["id"], "code": r["code"] or "", "name": r["name"] or "",
        "position": r["position"] or "", "unit": r["unit"] or "",
        "status": r["status"] or "فعال", "created": r["created"] or 0,
        "encodings": enc,
    }


def _row_loaders():
    return {
        "employees": lambda r: _emp_from_row(r),
        "attendance": lambda r: {
            "id": r["id"], "employee_id": r["employee_id"],
            "type": r["type"], "ts": r["ts"], "jdate": r["jdate"],
        },
        "leaves": lambda r: {
            "id": r["id"], "employee_id": r["employee_id"],
            "from": r["dfrom"], "to": r["dto"], "type": r["type"],
            "days": r["days"] or "", "note": r["note"] or "", "status": r["status"] or "",
        },
        "approvals": lambda r: {
            "id": r["id"], "employee_id": r["employee_id"],
            "from": r["dfrom"], "to": r["dto"],
            "status": r["status"], "ts": r["ts"],
        },
    }


def _insert_sql():
    return {
        "employees": (
            "INSERT INTO employees (id,code,name,position,unit,status,created,encodings)"
            " VALUES (?,?,?,?,?,?,?,?)",
            lambda e: (
                e.get("id") or new_id(), e.get("code", ""), e.get("name", ""),
                e.get("position", ""), e.get("unit", ""), e.get("status", "فعال"),
                e.get("created", now_ms()),
                json.dumps(e.get("encodings", []), ensure_ascii=False),
            ),
        ),
        "attendance": (
            "INSERT INTO attendance (id,employee_id,type,ts,jdate) VALUES (?,?,?,?,?)",
            lambda a: (a.get("id") or new_id(), a.get("employee_id"),
                       a.get("type"), a.get("ts"), a.get("jdate")),
        ),
        "leaves": (
            "INSERT INTO leaves (id,employee_id,dfrom,dto,type,days,note,status)"
            " VALUES (?,?,?,?,?,?,?,?)",
            lambda l: (l.get("id") or new_id(), l.get("employee_id"),
                       l.get("from"), l.get("to"), l.get("type", ""),
                       str(l.get("days", "")), l.get("note", ""), l.get("status", "")),
        ),
        "approvals": (
            "INSERT INTO approvals (id,employee_id,dfrom,dto,status,ts) VALUES (?,?,?,?,?,?)",
            lambda a: (a.get("id") or new_id(), a.get("employee_id"),
                       a.get("from"), a.get("to"), a.get("status"), a.get("ts")),
        ),
    }


# =====================================================================
#  API عمومی (هم‌نام و هم‌رفتار با نسخهٔ JSON قبلی)
# =====================================================================
def load(name):
    with _LOCK:
        conn = _connect()
        if name == "settings":
            rows = conn.execute("SELECT key,value FROM settings").fetchall()
            out = {}
            for r in rows:
                try:
                    out[r["key"]] = json.loads(r["value"])
                except Exception:
                    out[r["key"]] = r["value"]
            return out
        loader = _row_loaders()[name]
        order = " ORDER BY created" if name == "employees" else (
            " ORDER BY ts" if name in ("attendance", "approvals") else "")
        rows = conn.execute("SELECT * FROM %s%s" % (name, order)).fetchall()
        return [loader(r) for r in rows]


def _save(name, data):
    """نسخهٔ بدون‌قفلِ save برای استفادهٔ داخلی (هنگام انتقال)."""
    conn = _connect()
    if name == "settings":
        for k, v in (data or {}).items():
            conn.execute(
                "INSERT INTO settings(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (k, json.dumps(v, ensure_ascii=False)),
            )
        conn.commit()
        return
    sql, to_params = _insert_sql()[name]
    conn.execute("DELETE FROM %s" % name)          # جایگزینی کامل (مثل نوشتن کل فایل قبلی)
    for item in (data or []):
        conn.execute(sql, to_params(item))
    conn.commit()


def save(name, data):
    with _LOCK:
        _save(name, data)


def get_settings():
    s = DEFAULT_SETTINGS.copy()
    try:
        s.update(load("settings") or {})
    except Exception:
        pass
    return s


def new_id():
    return uuid.uuid4().hex[:12]


# ---------- کمک‌توابع تاریخ/زمان (بدون تغییر) ----------
def now_ms():
    return int(datetime.now().timestamp() * 1000)


def jalali_date_str(ts_ms):
    """تبدیل زمان میلی‌ثانیه‌ای به رشتهٔ تاریخ شمسی YYYY-MM-DD (برای گروه‌بندی روزها)."""
    dt = datetime.fromtimestamp(ts_ms / 1000)
    jd = jdatetime.date.fromgregorian(date=dt.date())
    return "%04d-%02d-%02d" % (jd.year, jd.month, jd.day)


def time_str(ts_ms):
    """ساعت HH:MM از زمان میلی‌ثانیه‌ای."""
    return datetime.fromtimestamp(ts_ms / 1000).strftime("%H:%M")
