# -*- coding: utf-8 -*-
"""دانلود مدل‌های ONNX لازم برای تشخیص چهره (YuNet + SFace) از مخزن OpenCV Zoo.

اجرا:  python download_models.py
"""

import os
import sys
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# دو مدل موردنیاز و نشانیِ دانلودشان از مخزن رسمی «OpenCV Zoo».
# YuNet → پیدا کردن محل صورت در تصویر، SFace → ساختن بردار ویژگی برای مقایسهٔ چهره‌ها.
MODELS = {
    "face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/"
        "face_recognition_sface/face_recognition_sface_2021dec.onnx",
}


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    for name, url in MODELS.items():
        dest = os.path.join(MODELS_DIR, name)
        # اگر فایل از قبل دانلود شده و خالی نیست، دوباره دانلود نمی‌کنیم (اجرای چندبارهٔ بی‌خطر).
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print("از قبل موجود است:", name)
            continue
        print("در حال دانلود:", name)
        try:
            urllib.request.urlretrieve(url, dest)
            print("  ذخیره شد در:", dest)
        except Exception as e:
            # اگر اینترنت نبود یا دانلود شکست خورد، آدرس را چاپ می‌کنیم تا کاربر دستی دانلود کند.
            print("  خطا در دانلود:", e, file=sys.stderr)
            print("  می‌توانید فایل را دستی از این آدرس دانلود و در پوشهٔ models/ قرار دهید:",
                  file=sys.stderr)
            print("  " + url, file=sys.stderr)
            sys.exit(1)
    print("همهٔ مدل‌ها آماده‌اند.")


if __name__ == "__main__":
    main()
