# -*- coding: utf-8 -*-
"""محاسبهٔ گزارش‌های حضور و غیاب بر اساس بازهٔ تاریخ شمسی.

ورودی: لاگ ترددها (هر رکورد type=in/out با زمان و تاریخ شمسی) و تنظیمات.
خروجی: برای هر کارمند تعداد روزهای کاری، حاضر، غایب، تأخیر و مجموع اضافه‌کاری
به‌علاوهٔ ریز روزانه برای نمایش در جزئیات.
"""

from datetime import date, timedelta

import jdatetime


def _to_minutes(hhmm):
    # رشتهٔ ساعت "HH:MM" را به «دقیقه از نیمه‌شب» تبدیل می‌کند تا مقایسهٔ ساعت‌ها آسان شود.
    # اگر ورودی خراب بود، به‌جای crash مقدار ۰ برمی‌گردانیم.
    try:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return 0


def parse_jalali(s):
    """رشتهٔ 'YYYY-MM-DD' شمسی را به jdatetime.date تبدیل می‌کند."""
    y, m, d = (int(x) for x in s.split("-"))
    return jdatetime.date(y, m, d)


def current_month_range():
    """بازهٔ ماه جاری شمسی: (اول ماه، امروز) به‌صورت رشتهٔ شمسی."""
    today = jdatetime.date.today()
    start = jdatetime.date(today.year, today.month, 1)
    fmt = lambda j: "%04d-%02d-%02d" % (j.year, j.month, j.day)
    return fmt(start), fmt(today)


def working_days_in_range(from_j, to_j):
    """فهرست روزهای کاری (غیرجمعه) در بازه؛ خروجی لیستی از رشته‌های تاریخ شمسی.

    جمعه = weekday()==6 در jdatetime (شنبه=۰ ... جمعه=۶).
    """
    # تاریخ شمسی را به میلادی تبدیل می‌کنیم چون پیمایش روزبه‌روز با timedelta روی تاریخ
    # میلادی ساده و بی‌دردسر است؛ بعد دوباره هر روز را به شمسی برمی‌گردانیم.
    g_from = parse_jalali(from_j).togregorian()
    g_to = parse_jalali(to_j).togregorian()
    if g_to < g_from:                       # اگر کاربر بازه را برعکس داد، جا‌به‌جا می‌کنیم
        g_from, g_to = g_to, g_from
    days = []
    cur = g_from
    while cur <= g_to:
        jd = jdatetime.date.fromgregorian(date=cur)
        if jd.weekday() != 6:  # جمعه (۶) را به‌عنوان تعطیلی کنار می‌گذاریم
            days.append("%04d-%02d-%02d" % (jd.year, jd.month, jd.day))
        cur += timedelta(days=1)
    return days


def _day_logs(att, emp_id, jdate):
    rows = [a for a in att if a["employee_id"] == emp_id and a.get("jdate") == jdate]
    rows.sort(key=lambda a: a["ts"])
    return rows


def compute_employee(att, emp_id, work_days, settings):
    """آمار یک کارمند را در بازهٔ روزهای کاری داده‌شده می‌سازد."""
    start_min = _to_minutes(settings.get("start_time", "08:30"))
    std_hours = float(settings.get("work_hours", 8))

    present = late = 0
    overtime_minutes = 0
    daily = []

    for jdate in work_days:
        rows = _day_logs(att, emp_id, jdate)
        if not rows:
            # هیچ ترددی در این روز کاری نبود → غایب.
            daily.append({"date": jdate, "status": "absent",
                          "first_in": None, "last_out": None, "worked": 0, "late": False})
            continue

        ins = [r for r in rows if r["type"] == "in"]
        outs = [r for r in rows if r["type"] == "out"]
        # مبنای محاسبه: «اولین ورود» و «آخرین خروج» روز. اگر کسی چند بار رفت‌وآمد کرده باشد،
        # کل بازهٔ حضورش از اولین ورود تا آخرین خروج در نظر گرفته می‌شود.
        first_in = ins[0] if ins else rows[0]
        last_out = outs[-1] if outs else None

        present += 1
        in_minutes = (first_in["ts"] // 60000) % (24 * 60)
        is_late = bool(ins) and in_minutes > start_min   # ورود بعد از ساعت شروع = تأخیر
        if is_late:
            late += 1

        # ساعت کارکرد = فاصلهٔ آخرین خروج تا اولین ورود (به دقیقه). اگر خروج ثبت نشده باشد ۰.
        worked_min = 0
        if last_out and first_in:
            worked_min = max(0, (last_out["ts"] - first_in["ts"]) // 60000)
        # اضافه‌کاری = هر چه بیشتر از ساعت کاری استاندارد کار شده باشد (منفی نمی‌شود).
        ot = max(0, worked_min - int(std_hours * 60))
        overtime_minutes += ot

        from_t = (lambda t: "%02d:%02d" % ((t // 60000 // 60) % 24, (t // 60000) % 60))
        daily.append({
            "date": jdate,
            "status": "present",
            "first_in": from_t(first_in["ts"]) if ins else None,
            "last_out": from_t(last_out["ts"]) if last_out else None,
            "worked": round(worked_min / 60, 1),
            "late": is_late,
        })

    total_working = len(work_days)
    # غیبت = روزهای کاری منهای روزهای حاضر. (مرخصی در این نسخه جداگانه ثبت می‌شود.)
    absent = max(0, total_working - present)
    return {
        "working_days": total_working,
        "present": present,
        "absent": absent,
        "late": late,
        "overtime": round(overtime_minutes / 60, 1),
        "daily": daily,
    }


def build_report(employees, attendance, settings, from_j, to_j, unit=None, emp_id=None):
    """گزارش کامل برای همهٔ کارمندانِ مطابق فیلتر."""
    work_days = working_days_in_range(from_j, to_j)
    rows = []
    for e in employees:
        if unit and e.get("unit") != unit:
            continue
        if emp_id and e["id"] != emp_id:
            continue
        stats = compute_employee(attendance, e["id"], work_days, settings)
        rows.append({
            "id": e["id"],
            "code": e.get("code", ""),
            "name": e.get("name", ""),
            "unit": e.get("unit", ""),
            "position": e.get("position", ""),
            **stats,
        })
    return {"from": from_j, "to": to_j, "working_days": len(work_days), "rows": rows}
