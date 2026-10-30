import cv2, numpy as np, sys
src, out = sys.argv[1], sys.argv[2]
img = cv2.imread(src)                                  # 1600x900, BGR
# 1) убрать блочные артефакты/шум сжатия, сохраняя края
den = cv2.fastNlMeansDenoisingColored(img, None, 4, 4, 7, 21)
# 2) увеличение ×2 (Lanczos)
up = cv2.resize(den, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)
# 3) сгладить «лесенки» после увеличения, сохраняя границы (иллюстрация — плоские заливки)
up = cv2.bilateralFilter(up, 7, 22, 7)
# 4) резкость: unsharp mask
blur = cv2.GaussianBlur(up, (0, 0), 2.2)
sharp = cv2.addWeighted(up, 1.55, blur, -0.55, 0)
# 5) лёгкий контраст и насыщенность
hsv = cv2.cvtColor(sharp, cv2.COLOR_BGR2HSV).astype(np.float32)
hsv[..., 1] = np.clip(hsv[..., 1] * 1.08, 0, 255)
sharp = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
lab = cv2.cvtColor(sharp, cv2.COLOR_BGR2LAB)
l, a, b = cv2.split(lab)
l = cv2.createCLAHE(clipLimit=1.4, tileGridSize=(8, 8)).apply(l)
res = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
cv2.imwrite(out, res)
print(res.shape)
