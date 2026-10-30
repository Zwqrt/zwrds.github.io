import sys, cv2, numpy as np
sys.path.insert(0, sys.path[0])
from geom import sky_poly

day = cv2.imread(sys.argv[1]).astype(np.float32) / 255.0
H, W = day.shape[:2]
k = W / 1600
rng = np.random.default_rng(7)

# --- маска неба (с мягким краем) ---
sky = np.zeros((H, W), np.float32)
cv2.fillPoly(sky, [sky_poly(k)], 1.0)
sky = cv2.GaussianBlur(sky, (0, 0), 2 * k)[..., None]

# --- ночное небо: градиент + облака из дневных + звёзды + луна ---
y = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
top = np.array([0.10, 0.04, 0.02], np.float32)       # BGR тёмно-синий
hor = np.array([0.36, 0.20, 0.13], np.float32)       # у горизонта светлее
grad = top + (hor - top) * np.clip(y / 0.62, 0, 1) ** 1.6
gray = cv2.cvtColor((day * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
hsv = cv2.cvtColor((day * 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
cloud = np.clip((gray - 0.62) / 0.3, 0, 1) * np.clip(1 - hsv[..., 1] / 120, 0, 1)
cloud = cv2.GaussianBlur(cloud, (0, 0), 1.5 * k)[..., None]
night_sky = grad * (1 - cloud * 0.55) + cloud * 0.55 * np.array([0.30, 0.24, 0.22], np.float32)

stars = np.zeros((H, W), np.float32)
n = int(900 * k)
xs, ys = rng.integers(0, W, n), (rng.random(n) ** 1.4 * 0.58 * H).astype(int)
for x, yy, b in zip(xs, ys, rng.random(n)):
    cv2.circle(stars, (int(x), int(yy)), 1 if b < 0.85 else 2, float(0.35 + 0.65 * b), -1, cv2.LINE_AA)
stars = cv2.GaussianBlur(stars, (0, 0), 0.6)[..., None] * (1 - cloud * 0.95)
night_sky += stars * np.array([1.0, 0.97, 0.92], np.float32)

moon = np.zeros((H, W), np.float32)
mc, mr = (int(1290 * k), int(120 * k)), int(34 * k)
cv2.circle(moon, mc, mr, 1.0, -1, cv2.LINE_AA)
cv2.circle(moon, (mc[0] + int(14 * k), mc[1] - int(6 * k)), mr, 0.0, -1, cv2.LINE_AA)   # серп
moon_glow = cv2.GaussianBlur(moon, (0, 0), 30 * k) * 1.2
moon = cv2.GaussianBlur(moon, (0, 0), 0.8 * k)
night_sky += moon[..., None] * np.array([0.80, 0.93, 1.0], np.float32) + moon_glow[..., None] * np.array([0.35, 0.28, 0.22], np.float32)

# --- земля и здание: темнее и синее (лунный свет) ---
lum = gray[..., None]
ground = day * 0.24 * np.array([1.25, 0.95, 0.75], np.float32) + lum * 0.03
ground = np.clip(ground, 0, 1)

# --- светящиеся объекты ---
glow_src = np.zeros_like(day)

# окна: тёмные стёкла в фасаде — часть «включаем», жёлтые окна дня горят точно
b, g, r = day[..., 0], day[..., 1], day[..., 2]
building = np.zeros((H, W), np.uint8)
cv2.rectangle(building, (int(168 * k), int(355 * k)), (int(1433 * k), int(640 * k)), 1, -1)
yellow = ((r > 0.75) & (g > 0.55) & (b < 0.55) & (r - b > 0.25) & (building > 0)).astype(np.uint8)
glass = ((gray < 0.42) & (hsv[..., 1] < 95) & (building > 0)).astype(np.uint8)   # без красных стен
# окно = стёкла + блики между ними: склеиваем части в один прямоугольник
cand = cv2.morphologyEx(np.maximum(glass, yellow), cv2.MORPH_CLOSE, np.ones((int(9 * k), int(9 * k)), np.uint8))
nlab, lab, stats, _ = cv2.connectedComponentsWithStats(cand)
lit = np.zeros((H, W), np.float32)
pad = int(1.5 * k)
for i in range(1, nlab):
    x, yy, w, h, area = stats[i]
    if not (300 * k * k < w * h < 4200 * k * k and w < 58 * k and h < 62 * k and 0.4 < w / max(h, 1) < 1.8 and area / (w * h) > 0.55):
        continue  # не окно (дерево, тень, край)
    win = (slice(yy + pad, yy + h - pad), slice(x + pad, x + w - pad))
    is_yellow = yellow[win].mean() > 0.25
    if is_yellow or rng.random() < 0.34:
        lit[win] = np.where(gray[win] < 0.82, rng.uniform(0.75, 1.0), 0)   # белые рамки не светятся

# центральный корпус: парные узкие окна между красными простенками — по одному стеклу
center = np.zeros((H, W), np.uint8)
cv2.rectangle(center, (int(605 * k), int(350 * k)), (int(1000 * k), int(560 * k)), 1, -1)
lit[center > 0] = 0
cglass = cv2.morphologyEx(glass * center, cv2.MORPH_CLOSE, np.ones((int(3 * k), int(5 * k)), np.uint8))
nlab, lab, stats, _ = cv2.connectedComponentsWithStats(cglass)
for i in range(1, nlab):
    x, yy, w, h, area = stats[i]
    if 8 * k < w < 30 * k and 20 * k < h < 60 * k and rng.random() < 0.4:
        win = (slice(yy, yy + h), slice(x, x + w))
        lit[win] = np.where(gray[win] < 0.82, rng.uniform(0.75, 1.0), 0)
lit = cv2.GaussianBlur(lit, (0, 0), 0.7 * k)[..., None]
warm = np.array([0.42, 0.80, 1.0], np.float32)          # тёплый свет (BGR)
win_color = warm * (0.75 + 0.25 * lum)
glow_src += lit * warm * 0.9

# фонари (белые шары) и фонтан — самые светлые малые пятна внизу
cand = ((gray > 0.72) & (hsv[..., 1] < 60)).astype(np.uint8)
cand[: int(645 * k), :] = 0          # только ниже фасада: фонари и фонтан
nlab, lab, stats, _ = cv2.connectedComponentsWithStats(cand)
bright = np.zeros((H, W), np.float32)
for i in range(1, nlab):
    x, yy, w, h, area = stats[i]
    fountain = 740 * k < x + w / 2 < 860 * k and w < 200 * k
    if (fountain and area > 6 * k * k) or (25 * k * k < area < 1000 * k * k and 0.6 < w / max(h, 1) < 1.6 and area / (w * h) > 0.55):
        bright[lab == i] = 1.0
glow_src += bright[..., None] * np.array([0.85, 0.95, 1.0], np.float32)

# неон: насыщенный розовый/пурпурный (вывески)
neon = ((hsv[..., 0] > 140) & (hsv[..., 0] < 172) & (hsv[..., 1] > 120) & (hsv[..., 2] > 120)).astype(np.float32)[..., None]
glow_src += neon * day * 0.9

# --- сборка ---
scene = ground * (1 - lit) + win_color * lit
scene = scene * (1 - neon) + day * 0.85 * neon
scene = scene * (1 - bright[..., None]) + np.clip(day * 1.05, 0, 1) * bright[..., None]
out = night_sky * sky + scene * (1 - sky)

halo = cv2.GaussianBlur(glow_src, (0, 0), 7 * k) * 0.9 + cv2.GaussianBlur(glow_src, (0, 0), 22 * k) * 0.6
out = 1 - (1 - out) * (1 - np.clip(halo, 0, 1))      # screen

# лёгкая виньетка
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vig = 1 - 0.25 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
out = np.clip(out * vig[..., None], 0, 1)
cv2.imwrite(sys.argv[2], (out * 255).astype(np.uint8))
