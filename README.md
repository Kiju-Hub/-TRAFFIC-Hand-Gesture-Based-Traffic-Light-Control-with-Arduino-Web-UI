# -🚦TRAFFIC-Hand-Gesture-Based-Traffic-Light-Control-with-Arduino-Web-UI
-🚦아두이노 활용 신호등 제어시스템 + 손 제스처를 활용하여 모드 및 LED 주기 변경



---

## 🔴 시연 동영상  
> https://youtu.be/AaC6BXiR3fo 시연 동영상입니다. 

---
---

## 📌 프로젝트 개요

**TRAFFIC** 프로젝트는 비디오 기반 손 제스처 인식을 통해 별도의 버튼이나 물리적 조작 없이 아두이노에 연결된 LED 신호등을 제어할 수 있는 시스템입니다. 웹캠으로 손 모양을 인식하고, 특정 제스처(예: 엄지척, 검지만 펼침 등)를 통해 모드를 쉽게 변경하거나, 손가락의 위치를 통해 각 LED의 점등 주기를 직관적으로 조정할 수 있도록 설계되었습니다. 이를 통해 손쉽게, 빠르게, 그리고 직관적으로 인터랙티브한 신호등 시뮬레이션이 가능합니다.

---
---
## 🧠 주요 기능

| 기능명 | 설명 |
|--------|------|
| **Normal Mode** | 신호등처럼 Red → Yellow → Blue → Yellow 순환 진행 |
| **Red Only Mode** | 빨간불만 점등 상태 유지 |
| **All Blink Mode** | 모든 LED가 동시에 깜빡이는 상태로 변경 |
| **All Off Mode** | 모든 LED 소등 |
| **제스처 제어 모드** | 웹캠으로 손 제스처를 인식하여 모드 변경 및 주기 조절 |
| **밝기 조절** | Potentiometer(가변저항)로 LED 밝기 실시간 제어 |
| **Serial CONFIG 명령** | 웹 UI 또는 다른 디바이스로부터 Serial 명령어로 주기 조정 가능 |

---
---

## 🗂️ 시스템 흐름도

```
[웹캠 + HandPose]
        ↓
[웹 UI 제스처 인식 (p5.js)]
        ↓
[Serial 명령 전송 (Web Serial API)]
        ↓
        [Arduino Uno]
        ↓
  [LED 모드 전환 및 주기 반영]
```

---
---

## 🧰 기술 스택 요약

| 구성 요소 | 사용 기술 |
|-----------|-----------|
| 웹캠 제스처 인식 | ml5.js (HandPose) |
| UI 구현 | p5.js, HTML/CSS |
| 하드웨어 제어 | Arduino + TaskScheduler + PinChangeInterrupt |
| 통신 | Web Serial API |
| LED 제어 | analogWrite (PWM) |

---
---

## 🔌 설치 방법

1. **하드웨어 준비물**
   - Arduino Uno (또는 호환 보드)
   - 빨강/노랑/파랑 LED 3개 + 저항
   - 가변저항(Potentiometer) 1개
   - 버튼 3개 (테스트용)
   - 브레드보드, 점퍼 케이블
   - USB 케이블 (PC와 아두이노 연결용)

2. **라이브러리 설치 (Arduino IDE)**
   - `TaskScheduler`
   - `PinChangeInterrupt`

3. **웹캠 인식용 UI 코드 구성**
   - [p5.js](https://p5js.org/), [ml5.js](https://ml5js.org/) 기반
   - HandPose 모델을 활용해 손 제스처 실시간 추적 및 모드 전송

---
---

## 🪛 회로 구성
![image](https://github.com/user-attachments/assets/1ba16ffb-8499-4b6b-901f-c8a51bb6eb83)
```
--- 

[Button1] --- Pin 5       (All Blink Mode)
[Button2] --- Pin 6       (Red Only Mode)
[Button3] --- Pin 7       (All Off Mode)
[POT] ----- A0            (밝기 조절)
[Red LED] - Pin 9
[Yellow LED] - Pin 10
[Blue LED] - Pin 11
```
### ✅ LED (PWM 핀 제어)

| 색상     | 핀 번호 | 구성                         |
|----------|---------|------------------------------|
| 🔴 빨간색 | D9      | 220Ω 저항을 거쳐 GND로 연결 |
| 🟡 노란색 | D10     | 220Ω 저항을 거쳐 GND로 연결 |
| 🔵 파란색 | D11     | 220Ω 저항을 거쳐 GND로 연결 |

---

### 🎚️ 가변저항 (밝기 조절용)

- 가운데 핀 → **A0**
- 양쪽 핀 중 하나 → **GND**
- 나머지 핀 → **5V**

---

### 🔘 버튼 3개 (인터럽트용)

| 버튼 역할     | 핀 번호 | 구성                                 |
|---------------|---------|--------------------------------------|
| All Blink     | D5      | GND 연결, `INPUT_PULLUP` 사용        |
| Red Only      | D6      | GND 연결, `INPUT_PULLUP` 사용        |
| All Off       | D7      | GND 연결, `INPUT_PULLUP` 사용        |

---
---


## 🧩 아두이노 주요 코드 설명

### 🧱 모드 설정 및 상태 관리
- `setMode(String mode)`: 입력된 모드에 따라 각 Task를 활성/비활성화하고 초기화
- `resetAllLeds()`: 모든 LED OFF, 모든 Task 비활성화
- `toggleXMode()` 함수들: 버튼 또는 제스처 입력에 따라 모드 전환

### 🧠 TaskScheduler 기반 LED 제어
- `trafficLightTask`: 신호등 순환 제어 (Red → Yellow → Blue → Yellow)
- `blueBlinkTask`: 파란불 마지막 1초 깜빡임 (6회 반복)
- `blinkTask`: All Blink 모드에서 모든 LED를 주기적으로 ON/OFF
- `adjustBrightnessTask`: 가변저항 값을 통해 brightness 조절
- `serialTask`: 현재 상태를 시리얼 통신으로 웹에 전송

### 📡 시리얼 명령어 처리
- 단일 문자 모드 변경: `R`, `A`, `O`, `N`
- CONFIG 명령 처리 예:
```
CONFIG,Red,2500,Yellow,500,Blue,4000
```
→ 각 색상의 점등 시간을 변경하며, Blue의 경우 마지막 1000ms는 깜빡임 전용 시간으로 분리되어 작동

----------

## 💡 웹 인터페이스 핵심 코드 설명 (`sketch.js`)

이 파일은 웹캠으로 손 모양을 인식하고, 그에 따라 Arduino로 시리얼 명령을 전송하는 모든 UI 로직을 담고 있습니다. 핵심 동작을 아래와 같이 정리할 수 있습니다.

### 🎥 HandPose 모델 및 비디오 처리
- `ml5.handPose()`로 손 관절 위치 추적
- `createCapture()`로 웹캠 영상 스트리밍
- `gotHands()` 콜백에서 손 모양 분석 및 모드 전송 수행

### 🖱️ LED 제어 슬라이더 (주기 조정)
- 빨강, 노랑, 파랑 LED의 점등 시간(Interval)을 슬라이더로 설정
- 설정값은 `sendConfig()`에서 CSV 형식으로 아두이노에 전송
- 예: `CONFIG,Red,2500,Yellow,300,Blue,4000`

### 🔌 Web Serial 통신
- `navigator.serial`을 통해 아두이노와 연결
- `writer.write()`로 명령 전송, `reader.read()`로 상태 수신
- 수신한 상태는 `serialEvent()`에서 파싱하여 UI에 반영

### ✋ 제스처 인식 기반 모드 변경
- `detectGesture()` 함수에서 손가락 관절의 y 좌표 비교로 펴짐/굽힘 판별
- 인식되는 제스처:
  - 주먹 → `Red Only`
  - 엄지+검지 모음 → `All Blink`
  - 검지, 중지 펴짐 → `All Off`
  - 모두 펼침 → `Normal`
- 제스처가 1초 이상 유지되면 `sendModeToArduino()`를 통해 명령 전송

### 🧤 검지만 펴진 설정 모드 (슬라이더 제어)
- 검지만 펴고 다른 손가락은 접은 상태 → 설정 모드 진입
- `handleIndexControlMode()`에서 손가락 위치를 기준으로 슬라이더를 실시간 제어
- 일정 시간 손이 사라지면 자동으로 `sendConfig()` 호출
 
---
---


## ✋ 제스처 인식 기능 (HandPose + p5.js + Web Serial)

### 🟢 진입 제스처: Index Only (검지만 펼친 손)
- 설정 모드 진입
- 이후 슬라이더 UI로 주기 직접 조정 가능

### 🔴 모드 변경 제스처 예시
| 제스처 | 설명 |
|--------|------|
| 오케이(OK) | All Blink 모드 진입 |
| 브이(V) | All Off 모드 진입 |
| 주먹 | Red Only 모드 진입 |
| 손바닥 | Normal 모드 진입 |

> ✨ **Tip:** 손 제스처가 인식되면 `Serial.write()`를 통해 해당 명령어(`A`, `O`, `R` 등)가 Arduino로 전송됩니다.

### ⚙️ CONFIG 명령 전송
- 슬라이더를 조작해 Red/Yellow/Blue의 점등 시간을 설정하면
  ```
  CONFIG,Red,2500,Yellow,500,Blue,4000
  ```
  과 같은 명령이 Serial로 전송되어 Arduino가 주기를 즉시 반영합니다.

---
---

## 🎯 추가된 기능 요약

기존에는 **물리 버튼(인터럽트)**을 통해서만 LED 모드 전환이 가능했지만,  
이번 프로젝트에서는 **웹캠 기반 손 제스처 인식**을 추가하여 다음 기능이 확장

| 기능 | 설명 |
|------|------|
| 🧤 제스처 기반 모드 변경 | 주먹(👊), 오케이(👌), 브이✌️, 손바닥(🖐️) 등을 인식하여 `"Red Only"`, `"All Blink"`, `"All Off"`, `"Normal"` 모드 전환 |
| 👉 제스처 기반 슬라이더 조절 | **검지만 펴기**로 설정 모드 진입 후, 손가락을 좌우로 움직여 Red/Yellow/Blue 지속 시간 조절 |
| ⏳ 자동 설정 종료 | 손이 사라지고 3초 이상 제스처 없음 → 설정 모드 자동 종료 및 변경값 전송(2초 동안 피드백 메시지 전송) | 


---
---


## 📎 결론 및 향후 발전 방향

이번 Hand-Gesture-Based-Traffic 프로젝트는 기존의 Arduino-Based-Traffic-Light-Control-System을 활용하여, 하드웨어 조작 없이도도
누구나 직관적으로 손만으로 LED 모드를 전환하고 제어할 수 있는 인터페이스를 제공하도록 하였으며 기존 버튼 중심의 입력 장치보다 더 유연하고 자연스러운 상호작용 방식을 제시합니다.


---


