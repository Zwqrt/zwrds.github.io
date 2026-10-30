import numpy as np
# координаты в исходном масштабе 1600x900; небо = выше этой линии
SKY_LINE = [(0, 528), (163, 528), (166, 352), (590, 330), (600, 302), (1008, 302), (1018, 330), (1436, 352), (1440, 528), (1600, 528)]
def sky_poly(scale):
    pts = [(x * scale, y * scale) for x, y in SKY_LINE]
    return np.array([(0, 0)] + pts + [(1600 * scale, 0)], dtype=np.int32)
