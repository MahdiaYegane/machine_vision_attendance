# -*- coding: utf-8 -*-
"""
موتور پردازش تصویر و تشخیص چهره — کاملاً با پایتون و OpenCV.

این ماژول هیچ کار تشخیصی را به مرورگر واگذار نمی‌کند؛ مرورگر فقط فریم خام
وب‌کم را می‌فرستد و تمام مراحل زیر اینجا (سمت سرور، با پایتون) انجام می‌شود:
  ۱) دیکود کردن تصویر JPEG/Base64 با OpenCV
  ۲) تشخیص محل صورت‌ها با شبکهٔ YuNet (cv2.FaceDetectorYN)
  ۳) تراز و برش صورت و استخراج بردار ویژگی ۱۲۸‌بُعدی با SFace (cv2.FaceRecognizerSF)
  ۴) مقایسهٔ بردارها با فاصلهٔ کسینوسی برای شناسایی فرد
"""

import os
import base64
import threading
import time

import cv2
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

DETECTOR_PATH = os.path.join(MODELS_DIR, "face_detection_yunet_2023mar.onnx")
RECOGNIZER_PATH = os.path.join(MODELS_DIR, "face_recognition_sface_2021dec.onnx")

# آستانهٔ پیشنهادی SFace برای فاصلهٔ کسینوسی: اگر شباهت >= آستانه باشد، یک نفر است.
# هرچه عدد بزرگ‌تر باشد سخت‌گیرانه‌تر (احتمال خطای پذیرش کمتر) می‌شود.
DEFAULT_COSINE_THRESHOLD = 0.363

# گزارش تشخیصی در ترمینال (حداکثر هر ۱٫۵ ثانیه یک خط تا ترمینال شلوغ نشود).
_LAST_DBG = [0.0]


def _debug_detection(img, faces):
    now = time.time()
    if now - _LAST_DBG[0] < 1.5:
        return
    _LAST_DBG[0] = now
    h, w = img.shape[:2]
    if faces is None or len(faces) == 0:
        print(f"[تشخیص چهره] تصویر {w}x{h} → هیچ چهره‌ای پیدا نشد", flush=True)
    else:
        scores = "، ".join(f"{float(f[-1]):.2f}" for f in faces)
        print(f"[تشخیص چهره] تصویر {w}x{h} → {len(faces)} چهره (اطمینان: {scores})", flush=True)


class FaceEngineError(Exception):
    """خطای قابل‌نمایش موتور تشخیص چهره (مثلاً نبودن فایل مدل‌ها)."""


class FaceEngine:
    """پوشش‌دهندهٔ مدل‌های تشخیص و بازشناسی چهرهٔ OpenCV.

    این کلاس thread-safe است؛ چون detector وضعیت داخلی (اندازهٔ ورودی) دارد،
    فراخوانی‌ها با یک قفل سریال می‌شوند تا در حالت چند-درخواستی Flask مشکلی پیش نیاید.
    """

    def __init__(self, cosine_threshold=DEFAULT_COSINE_THRESHOLD):
        self.cosine_threshold = float(cosine_threshold)
        self._lock = threading.Lock()
        self._detector = None
        self._recognizer = None
        self._load_models()

    # ---------- بارگذاری مدل‌ها ----------
    def _load_models(self):
        missing = [p for p in (DETECTOR_PATH, RECOGNIZER_PATH) if not os.path.exists(p)]
        if missing:
            names = "، ".join(os.path.basename(p) for p in missing)
            raise FaceEngineError(
                "فایل مدل‌های زیر پیدا نشد: " + names +
                " — لطفاً اسکریپت download_models.py را اجرا کنید."
            )
        # ورودی اولیه بعداً برای هر فریم با setInputSize به‌روزرسانی می‌شود.
        # آستانهٔ تشخیص پایین‌تر (۰٫۶) برای حساسیت بهتر در نور معمولی/کم.
        # از آرگومان‌های ترتیبی استفاده می‌کنیم تا در همهٔ نسخه‌های OpenCV یکسان عمل کند.
        self._detector = cv2.FaceDetectorYN.create(
            DETECTOR_PATH,   # model
            "",              # config
            (320, 320),      # input_size (هر فریم با setInputSize تنظیم می‌شود)
            0.6,             # score_threshold
            0.3,             # nms_threshold
            5000,            # top_k
        )
        # تضمین اعمال آستانه‌ها فارغ از نسخهٔ کتابخانه (برخی نسخه‌ها آرگومان سازنده را
        # نادیده می‌گیرند و آستانهٔ پیش‌فرض ۰٫۹ را نگه می‌دارند که چهره‌های عادی را رد می‌کند).
        for setter, val in (("setScoreThreshold", 0.6), ("setNMSThreshold", 0.3), ("setTopK", 5000)):
            fn = getattr(self._detector, setter, None)
            if callable(fn):
                try:
                    fn(val)
                except Exception:
                    pass
        self._recognizer = cv2.FaceRecognizerSF.create(
            RECOGNIZER_PATH,  # model
            "",               # config
        )

    @property
    def ready(self):
        return self._detector is not None and self._recognizer is not None

    # ---------- پردازش تصویر ----------
    @staticmethod
    def decode_data_url(data_url):
        """تبدیل رشتهٔ dataURL مرورگر (data:image/jpeg;base64,...) به تصویر BGR نام‌پای."""
        if not data_url:
            raise FaceEngineError("تصویری دریافت نشد.")
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        try:
            raw = base64.b64decode(data_url)
        except Exception:
            raise FaceEngineError("دادهٔ تصویر نامعتبر است.")
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise FaceEngineError("رمزگشایی تصویر ناموفق بود.")
        return img

    def detect_faces(self, img):
        """تشخیص همهٔ صورت‌ها. خروجی آرایهٔ Nx15 یا None.

        هر سطر: [x, y, w, h, 5 نقطهٔ کلیدی(۱۰ مقدار), امتیاز اطمینان]
        """
        h, w = img.shape[:2]
        with self._lock:
            self._detector.setInputSize((w, h))
            _, faces = self._detector.detect(img)
        _debug_detection(img, faces)
        return faces

    @staticmethod
    def largest_face(faces):
        """انتخاب بزرگ‌ترین صورت (نزدیک‌ترین فرد به دوربین)."""
        if faces is None or len(faces) == 0:
            return None
        areas = faces[:, 2] * faces[:, 3]
        return faces[int(np.argmax(areas))]

    def encode(self, img, face_row):
        """تراز/برش صورت و استخراج بردار ویژگی ۱۲۸‌بُعدی (به‌صورت لیست پایتون)."""
        with self._lock:
            # نکته: alignCrop قبل از استخراج ویژگی مهم است؛ صورت را بر اساس نقاط کلیدی
            # (چشم‌ها/بینی/دهان) صاف و هم‌اندازه می‌کند تا چرخش سر یا کجی روی نتیجه اثر نگذارد.
            # اگر این تراز را حذف کنیم، دقت تشخیص به‌شدت افت می‌کند.
            aligned = self._recognizer.alignCrop(img, face_row)
            feature = self._recognizer.feature(aligned)
        # بردار را به لیست ساده تبدیل می‌کنیم تا بتوان آن را در دیتابیس (JSON) ذخیره کرد.
        return np.asarray(feature, dtype=np.float32).flatten().tolist()

    def cosine_similarity(self, feat_a, feat_b):
        """شباهت کسینوسی بین دو بردار ویژگی (با تابع رسمی OpenCV)."""
        a = np.asarray(feat_a, dtype=np.float32).reshape(1, -1)
        b = np.asarray(feat_b, dtype=np.float32).reshape(1, -1)
        with self._lock:
            score = self._recognizer.match(a, b, cv2.FaceRecognizerSF_FR_COSINE)
        return float(score)

    def best_match(self, feature, known):
        """بهترین تطبیق را بین بردارهای ثبت‌شده پیدا می‌کند.

        known: لیستی از تاپل‌های (employee_id, feature_list).
        خروجی: (employee_id یا None, بهترین امتیاز شباهت).
        برای هر کارمندِ چندنمونه‌ای، بیشترین شباهت در نظر گرفته می‌شود.
        """
        best_id, best_score = None, -1.0
        for emp_id, kfeat in known:
            score = self.cosine_similarity(feature, kfeat)
            # هر کارمند ممکن است چند نمونهٔ چهره داشته باشد؛ بهترین (بیشترین) شباهت را نگه می‌داریم
            # تا اگر یکی از نمونه‌ها به زاویهٔ فعلی نزدیک‌تر بود، همان ملاک شناسایی شود.
            if score > best_score:
                best_score, best_id = score, emp_id
        # دروازهٔ نهایی: فقط وقتی فرد را «شناسایی‌شده» اعلام می‌کنیم که شباهت از آستانه بیشتر باشد.
        # در غیر این صورت None برمی‌گردانیم (یعنی چهره هست ولی به کسی به‌اندازهٔ کافی شبیه نیست).
        if best_id is not None and best_score >= self.cosine_threshold:
            return best_id, best_score
        return None, best_score

    # ---------- توابع سطح‌بالا برای مسیرهای وب ----------
    def encode_single(self, data_url):
        """یک تصویر می‌گیرد و بردار تنها صورتِ داخل آن را برمی‌گرداند.

        اگر صورتی نباشد یا بیش از یک صورت باشد، خطای قابل‌نمایش می‌دهد.
        خروجی: (feature_list, box) که box = [x, y, w, h] صحیح است.
        """
        img = self.decode_data_url(data_url)
        faces = self.detect_faces(img)
        if faces is None or len(faces) == 0:
            raise FaceEngineError("چهره‌ای در تصویر دیده نشد. صورت را کامل مقابل دوربین بگیرید.")
        # هنگام «ثبت» عمداً سخت‌گیری می‌کنیم: اگر بیش از یک نفر در کادر باشد رد می‌کنیم،
        # چون در غیر این صورت ممکن است چهرهٔ فرد اشتباهی به نام این کارمند ذخیره شود.
        if len(faces) > 1:
            raise FaceEngineError("بیش از یک چهره دیده شد. هنگام ثبت، فقط یک نفر مقابل دوربین باشد.")
        face = faces[0]
        feature = self.encode(img, face)
        # box = [x, y, w, h] برای کشیدن کادر روی تصویر در سمت مرورگر.
        box = [int(round(v)) for v in face[:4]]
        return feature, box

    def recognize(self, data_url, known):
        """یک فریم می‌گیرد، صورت اصلی را شناسایی و با لیست known تطبیق می‌دهد.

        خروجی دیکشنری:
          face_found: bool
          box: [x, y, w, h] یا None
          employee_id: str یا None
          score: float (شباهت کسینوسی بهترین تطبیق)
        """
        img = self.decode_data_url(data_url)
        faces = self.detect_faces(img)
        # برخلاف «ثبت»، در کیوسک ممکن است چند نفر در کادر باشند؛ نزدیک‌ترین فرد (بزرگ‌ترین صورت)
        # را به‌عنوان کسی که جلوی دستگاه ایستاده در نظر می‌گیریم.
        face = self.largest_face(faces)
        if face is None:
            return {"face_found": False, "box": None, "employee_id": None, "score": 0.0}

        box = [int(round(v)) for v in face[:4]]
        # حتی اگر هنوز هیچ چهره‌ای ثبت نشده باشد، box را برمی‌گردانیم تا مرورگر کادر را
        # دور صورت بکشد؛ این بازخورد بصری به کاربر کمک می‌کند بداند دوربین او را می‌بیند.
        if not known:
            return {"face_found": True, "box": box, "employee_id": None, "score": 0.0}

        feature = self.encode(img, face)
        emp_id, score = self.best_match(feature, known)
        return {"face_found": True, "box": box, "employee_id": emp_id, "score": round(score, 4)}
