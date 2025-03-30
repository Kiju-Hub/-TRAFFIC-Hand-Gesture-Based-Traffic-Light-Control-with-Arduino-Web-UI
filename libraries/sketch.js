// ✅ sketch.js (Web UI + HandPose + Serial Communication with Arduino)



class LineBreakTransformer {
    constructor() { this.container = ''; }
    transform(chunk, controller) {
      this.container += chunk;
      const lines = this.container.split('\n');
      this.container = lines.pop();
      lines.forEach(line => controller.enqueue(line));
    }
    flush(controller) {
      controller.enqueue(this.container);
    }
  }
  

  let port, reader, writer; // 시리얼 포트 연결 객체, 시리얼 데이터 읽기 객체 , 시리얼 데이터 전송 객체
  let inputDone, outputDone, inputStream, outputStream; // // 입력 스트림 처리 완료, 출력 스트림 처리 완료 여부, 입력 스트림, 출력 스트림
  let handPose, video, hands = [];// HandPose 모델, 비디오, 손 정보
  let mode = "Normal", currentLight = "Off", potBrightness = 0; // LED 모드 및 상태
  let redPotSlider, yellowPotSlider, bluePotSlider; // LED 밝기용 슬라이더 객체
  
  // 제스처 및 통신 관련 상태
  let lastGesture = "", gestureStartTime = 0;
  let lastSentMode = "", lastSentTime = 0;
  let gestureControlLock = false, gestureLockTime = 0;
  
  const GESTURE_HOLD_TIME = 2000; // 제스처 유지 시간 기준 (2초)
  const SEND_INTERVAL = 1000; // 모드 전송 주기
  const LOCK_DURATION = 3000; // 제스처 락 해제 시간 (3초)

  // 인터벌 슬라이더 및 값 초기화
  let redIntervalSlider, yellowIntervalSlider, blueIntervalSlider; // 가변저항 값을 표시할 슬라이더 (각 LED별)
  let redInterval = 2000;
  let yellowInterval = 500;
  let blueInterval = 3000;
  let blueBlinkState = false;
  
  // 손 인식 사라짐 감지용
  let lastHandSeenTime = 0;
  const HAND_MISSING_DURATION = 3000;


// 검지 설정모드 관련 상태
  let indexConfigMode = false;
  let indexConfigStart = 0;
  let configSentTime = 0;  
  const CONFIG_FEEDBACK_DURATION = 2000; // 설정 반영 피드백 지속 시간
  

// 사용자 설정을 아두이노로 전송하는 함수 (Red/Yellow/Blue LED의 인터벌 값)
async function sendConfig() {
    if (!port || !port.writable) return;
    redInterval = redIntervalSlider.value(); // 슬라이더에서 Red LED의 주기(ms) 값을 읽어오기
    yellowInterval = yellowIntervalSlider.value(); // 슬라이더에서 Yellow LED의 주기(ms) 값을 읽어오기
    blueInterval = blueIntervalSlider.value(); // 슬라이더에서 Blue LED의 주기(ms) 값을 읽어오기

    // 세 가지 주기 값을 CSV 문자열 형식으로 조합
    const configString = `CONFIG,Red,${redInterval},Yellow,${yellowInterval},Blue,${blueInterval}\n`;

    //아두이노로 설정 문자열 전송
    await writer.write(configString);
    
    configSentTime = millis();  //피드백 시각 저장  
    console.log("🛠️ Sent config:", configString); //전송된 내용 콘솔에 출력 (디버깅용)

}

// HandPose 모델 로딩
function preload() {
  handPose = ml5.handPose();
}

// 초기 UI 설정 및 웹캠 활성화
function setup() {
  createCanvas(1000, 500);
  video = createCapture({ video: { facingMode: "user" } });
  video.size(500, 500);
  video.hide();
  handPose.detectStart(video, gotHands);

 // LED 밝기 슬라이더 (비활성화된 상태)
  createP("Red LED").position(60, 310);
  redPotSlider = createSlider(0, 255, 0).position(50, 350).attribute("disabled", "");

  createP("Yellow LED").position(60, 380);
  yellowPotSlider = createSlider(0, 255, 0).position(50, 420).attribute("disabled", "");

  createP("Blue LED").position(60, 450);
  bluePotSlider = createSlider(0, 255, 0).position(50, 490).attribute("disabled", "");


   // 🔴 새 주기 슬라이더 추가
   createP("<strong style='color:black;'>Red <span style='border:2px solid black;padding:2px;'>INTERVAL</span> (1000 - 5000 ms)</strong>")
   .position(520, 100);
 redIntervalSlider = createSlider(1000, 5000, 2000, 100).position(520, 150);
 redIntervalText = createSpan(redIntervalSlider.value() + ' ms')
   .position(520, 180)
   .style('color', 'blue')
   .style('font-weight', 'bold');
 
 // 🟡 Yellow Interval 슬라이더
 createP("<strong style='color:black;'>Yellow <span style='border:2px solid black;padding:2px;'>INTERVAL</span> (100 - 3000 ms)</strong>")
   .position(520, 270);
 yellowIntervalSlider = createSlider(100, 3000, 500, 50).position(520, 320);
 yellowIntervalText = createSpan(yellowIntervalSlider.value() + ' ms')
   .position(520, 350)
   .style('color', 'blue')
   .style('font-weight', 'bold');
 
 // 🔵 Blue Interval 슬라이더
 createP("<strong style='color:black;'>Blue <span style='border:2px solid black;padding:2px;'>INTERVAL</span> (1500 - 5000 ms)</strong>")
   .position(520, 440);
 blueIntervalSlider = createSlider(1500, 5000, 3000, 100).position(520, 490);
 blueIntervalText = createSpan(blueIntervalSlider.value() + ' ms')
   .position(520, 520)
   .style('color', 'blue')
   .style('font-weight', 'bold');

  document.getElementById("connectButton").addEventListener("click", connectToArduino);
  document.getElementById("sendConfigButton").addEventListener("click", sendConfig);
}


// 매 프레임마다 실행되는 draw 함수
function draw() {
  background(220);
  push(); translate(width, 0); scale(-1, 1); image(video, 0, 0, 500, 500); pop();
  drawHandLines();

  fill(0); textSize(20); text("Mode: " + mode, 20, 40);

 // 각 색상에 맞는 LED 시각화
  let redColor = color(100), yellowColor = color(100), blueColor = color(100);
  if (mode === "Red Only") redColor = color(255, 0, 0, potBrightness);
  else if (mode === "Blink" || mode === "All Blink") {
    let isOn = frameCount % 30 < 15;
    redColor = isOn ? color(255, 0, 0, potBrightness) : color(100);
    yellowColor = isOn ? color(255, 255, 0, potBrightness) : color(100);
    blueColor = isOn ? color(0, 0, 255, potBrightness) : color(100);
  } else if (mode === "Normal") {
    if (currentLight === "Red") redColor = color(255, 0, 0, potBrightness);
    else if (currentLight === "Yellow") yellowColor = color(255, 255, 0, potBrightness);
    else if (currentLight === "Blue") blueColor = color(0, 0, 255, potBrightness);
    else if (currentLight === "BlueBlink") blueColor = blueBlinkState ? color(0, 0, 255, potBrightness) : color(100);
      
  }

  // 원형 LED 표시
  fill(redColor); ellipse(100, 150, 80, 80);
  fill(yellowColor); ellipse(250, 150, 80, 80);
  fill(blueColor); ellipse(400, 150, 80, 80);

  // 📤 슬라이더 값에 따라 주기 업데이트
  redInterval = redIntervalSlider.value();
  redIntervalText.html(redInterval + ' ms');

  yellowInterval = yellowIntervalSlider.value();
  yellowIntervalText.html(yellowInterval + ' ms');

  blueInterval = blueIntervalSlider.value();
  blueIntervalText.html(blueInterval + ' ms');


  handleIndexControlMode();

  // 설정 반영 시 피드백 표시
  if (millis() - configSentTime < CONFIG_FEEDBACK_DURATION) {
    fill(0, 180, 0);
    textSize(18);
    text("✅ 설정값이 반영되었습니다!", 100, 70);
  }

}

// 아두이노에서 받은 모드 및 현재 점등 중인 LED 상태를 UI에 반영하는 함수
function updateUIMode(dataMode, dataLight) {
    mode = dataMode; // 전체 LED 모드를 저장 (예: "Normal", "Red Only", "All Blink", ...)
    currentLight = dataLight; // 현재 점등 중인 LED 종류 저장 (예: "Red", "Yellow", "Blue", "BlueBlink")

    // UI 상단 상태 표시 영역에 현재 모드와 점등 상태를 출력
    document.getElementById("status").innerText = `Mode: ${mode} | Light: ${currentLight}`;
}
//아두이노에서 받은 LED 밝기 값을 슬라이더에 반영하는 함수
function updateLEDStates(red, yellow, blue) {
    redPotSlider.value(red); // Red LED의 밝기 슬라이더 값 설정
    yellowPotSlider.value(yellow); // Yellow LED의 밝기 슬라이더 값 설정
    bluePotSlider.value(blue); // Blue LED의 밝기 슬라이더 값 설정
}


// 아두이노에서 받은 전체 밝기(potentiometer 값)를 그래픽 표시용 변수에 반영하는 함수
function updateBrightness(brightness) {
    potBrightness = Number(brightness);// 숫자로 변환하여 전역 변수에 저장 (LED 색상 투명도에 사용됨)
      // ✅ 슬라이더에도 반영되도록 추가
    redPotSlider.value(potBrightness);
    yellowPotSlider.value(potBrightness);
    bluePotSlider.value(potBrightness);
}
  
// ✅ 시리얼 연결 및 처리
async function connectToArduino() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    const decoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(decoder.writable);
    inputStream = decoder.readable.pipeThrough(new TransformStream(new LineBreakTransformer()));
    reader = inputStream.getReader();

    const encoder = new TextEncoderStream();
    outputDone = encoder.readable.pipeTo(port.writable);
    outputStream = encoder.writable;
    writer = outputStream.getWriter();

    readLoop();
    document.getElementById("status").innerText = "Status: Connected";
  } catch (err) {
    console.error("Serial connection failed:", err);
  }
}

async function readLoop() {
  while (true) {
    try {
      const { value, done } = await reader.read();
      if (done) break;
      serialEvent(value);
    } catch (e) {
      console.error("Serial read error:", e);
      break;
    }
  }
}

function serialEvent(data) {
    const parts = data.trim().split(',');
    const parsed = {};
    for (let i = 0; i < parts.length; i += 2) {
      parsed[parts[i]] = parts[i + 1];
    }
  
    console.log("🟢 Parsed CSV:", parsed);
    // 깜빡임 상태가 따로 온 경우 (다른 키 없이 이것만 온 경우도 있음)
    if ('BlueBlinkState' in parsed) {
        blueBlinkState = (parsed.BlueBlinkState === 'On');
        return;  // 여기서 끝! 아래 코드 실행 안 함 (깜빡임만 처리)
    }
    // 예시: UI에 반영
    updateLEDStates(parsed.Red, parsed.Yellow, parsed.Blue);
    updateUIMode(parsed.Mode, parsed.Light);
    updateBrightness(parsed.Brightness);
  }
  
  

async function sendModeToArduino(modeToSend) {
  if (!port || !port.writable) return;
  try {
    const modeCharMap = { "Red Only": "R", "All Blink": "A", "Normal": "N", "On/Off": "O" };
    const dataToSend = `${modeCharMap[modeToSend]}\n`;
    await writer.write(dataToSend);  //그냥 문자열만 쓰기!
    console.log(`🔴 Sending to Arduino: ${modeToSend} → ${modeCharMap[modeToSend]}`);

  } catch (err) {
    console.error("Send Error:", err);
  }
}

// 손이 인식될 때마다 호출되는 콜백 함수 (HandPose 모델이 호출)
function gotHands(results) {
    hands = results;
  
    //잠금 해제 타이머
    if (gestureControlLock && millis() - gestureLockTime > 3000) {
      gestureControlLock = false;
      console.log("🔓 Gesture lock released");
    }
    //손이 하나라도 인식되었을 때
    if (hands.length > 0) {
      let hand = hands[0];
      let detectedGesture = detectGesture(hand); // 현재 손 모양으로부터 제스처 판단
      const timeHeld = millis() - gestureStartTime; // 제스처 유지 시간 계산
  
      //로그 너무 많이 뜨는 것 방지 (변화 있을 때만)
      //동일한 제스처가 일정 시간 이상 유지되었고, 이전에 전송한 모드와 다를 때만 전송
      if (detectedGesture === lastGesture) {
        if (!gestureControlLock &&
            timeHeld > GESTURE_HOLD_TIME &&
            detectedGesture !== mode &&
            detectedGesture !== lastSentMode) {
  
          // 제스처 기반으로 모드 전송
          sendModeToArduino(detectedGesture);
          lastSentMode = detectedGesture;
          lastSentTime = millis();
  
          gestureControlLock = true; // 다시 전송되지 않도록 잠금
          gestureLockTime = millis();
  
          console.log("🔴 Sending to Arduino:", detectedGesture);
        }
      } else {
        // 새로운 제스처 인식 시, 시작 시간 갱신
        lastGesture = detectedGesture;
        gestureStartTime = millis();
      }
    }
  }

// ✋ 손가락 관절 위치를 기반으로 제스처를 분석하여 문자열로 반환 
function detectGesture(hand) {
    
  if (!hand.keypoints || hand.keypoints.length < 21) return "Unknown";
  // 손가락 끝과 관절의 좌표 추출
  const [wrist, thumbTip, indexTip, middleTip, ringTip, pinkyTip] = [0, 4, 8, 12, 16, 20].map(i => hand.keypoints[i]);
  const [indexPIP, middlePIP, ringPIP, pinkyPIP] = [6, 10, 14, 18].map(i => hand.keypoints[i]);
  const isBent = (tip, pip) => tip.y > pip.y;// 굽었는지 판단 함수

  const allBent = [indexTip, middleTip, ringTip, pinkyTip].every((tip, i) => isBent(tip, [indexPIP, middlePIP, ringPIP, pinkyPIP][i]));
  if (allBent) return "Red Only";// 모두 굽었으면 "Red Only" 모드로 해석

  if (dist(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y) < dist(wrist.x, wrist.y, indexTip.x, indexTip.y) * 0.3) return "All Blink";  // 엄지와 검지의 거리 짧으면 "All Blink"로 판단

  if (!isBent(indexTip, indexPIP) && !isBent(middleTip, middlePIP) && isBent(ringTip, ringPIP) && isBent(pinkyTip, pinkyPIP)) return "On/Off"; // 검지, 중지는 펴고 나머지는 굽은 상태면 "On/Off"
  if ([indexTip, middleTip, ringTip, pinkyTip].every((tip, i) => !isBent(tip, [indexPIP, middlePIP, ringPIP, pinkyPIP][i]))) return "Normal"; // 전부 펼친 경우 "Normal"
  return "Unknown";
}


//손의 윤곽선과 뼈 구조를 화면에 시각화하는 함수
function drawHandLines() {
  if (hands.length === 0) return;
  const hand = hands[0];
  const fingers = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];

  stroke(0,255,0); strokeWeight(2);
  fingers.forEach(f => {
    for (let i = 0; i < f.length - 1; i++) {
      let a = hand.keypoints[f[i]], b = hand.keypoints[f[i+1]];
      let ax = map(a.x, 0, video.width, 1000, 500), ay = map(a.y, 0, video.height, 0, 500);
      let bx = map(b.x, 0, video.width, 1000, 500), by = map(b.y, 0, video.height, 0, 500);
      line(ax, ay, bx, by);
    }
  });
}


//검지 손가락만 올라가 있는지 판별하는 함수 (엄지 펴져있으면 false)
function isOnlyIndexFingerUp(hand) {
  if (!hand || !hand.keypoints || hand.keypoints.length < 21) return false;

  const tipIndices = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
  const pipIndices = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };

  const tip = (name) => hand.keypoints[tipIndices[name]];
  const pip = (name) => hand.keypoints[pipIndices[name]];

  const isUp = (name) => tip(name).y < pip(name).y;
  const isBent = (name) => tip(name).y > pip(name).y;

  const indexUp = isUp("index");

  // 손바닥 전체 펴짐 방지: 엄지까지 bent인지 체크 (엄지 편 경우 무조건 false)
  const thumbBent = isBent("thumb");
  const middleBent = isBent("middle");
  const ringBent = isBent("ring");
  const pinkyBent = isBent("pinky");

  // 손이 앞에 있는 상태에서도 거리 차이를 고려
  const wrist = hand.keypoints[0];
  const indexTip = tip("index");
  const indexDist = dist(indexTip.x, indexTip.y, wrist.x, wrist.y);

  // 손을 너무 가까이 가져다 댄 경우(오작동 가능) 무시
  if (indexDist < 50) return false;

  return indexUp && thumbBent && middleBent && ringBent && pinkyBent;
}


//검지 제스처 기반 설정 모드 활성화 및 슬라이더 조정 처리
function handleIndexControlMode() {
    const handDetected = hands.length > 0;// 손이 보이는지 확인


    //조건 만족 시 설정모드 진입하기기 (검지만 펴져 있을 때)
    if (!indexConfigMode && handDetected && isOnlyIndexFingerUp(hands[0])) {
      indexConfigMode = true;
      indexConfigStart = millis();
      redIntervalSlider.removeAttribute("disabled");
      yellowIntervalSlider.removeAttribute("disabled");
      blueIntervalSlider.removeAttribute("disabled");
      console.log("🟢 [검지 설정모드] 진입");
    }
    // 설정 모드일 경우 슬라이더 제어 시작
    if (indexConfigMode) {
      if (handDetected) {
        const hand = hands[0];
        controlRedIntervalSliderWithIndex(hand);
        controlYellowIntervalSliderWithIndex(hand);
        controlBlueIntervalSliderWithIndex(hand);
        lastHandSeenTime = millis();
  
        fill(255, 150, 0);
        text("🛠️ 검지 설정모드 (슬라이더 조정 중)", 520, 60);
  
      } else {
        // 손이 사라졌고, 일정 시간 지났다면 자동 전송하기기 , 그후 모드 종료 
        if (millis() - lastHandSeenTime > HAND_MISSING_DURATION) {
          sendConfig();
          console.log("📤 [자동 전송] 설정값 전송됨 (손 사라짐)");
          indexConfigMode = false;
        }
      }
    }
}
  
//손가락 위치 기반으로 빨간 슬라이더 제어
function controlRedIntervalSliderWithIndex(hand) {
    if (!hand || !hand.keypoints || hand.keypoints.length < 9) return;
  
    const indexTip = hand.keypoints[8];
    const x = indexTip.x;
    const y = indexTip.y;
  
    const mirroredX = map(x, 0, video.width, width, 0);
    const canvasY = map(y, 0, video.height, 0, height);
  
    const sliderBox = redIntervalSlider.elt.getBoundingClientRect();
    const canvasBox = document.querySelector("canvas").getBoundingClientRect();
  
    // 왼쪽으로 500px조정 ( 슬라이더위치 맞추기 )
    const sliderX = sliderBox.left - canvasBox.left - 500;
    const sliderY = sliderBox.top - canvasBox.top;
    const sliderW = sliderBox.width;
  
    if (
      abs(canvasY - sliderY) < 30 &&
      mirroredX >= sliderX &&
      mirroredX <= sliderX + sliderW
    ) {
      const val = map(mirroredX, sliderX, sliderX + sliderW, 1000, 5000);
      redIntervalSlider.value(constrain(val, 1000, 5000));
      console.log("🟢 redIntervalSlider 제어됨:", Math.round(val));
    }
  
}
  
// 손가락 위치 기반으로 노란 슬라이더 제어
function controlYellowIntervalSliderWithIndex(hand) {
    if (!hand || !hand.keypoints || hand.keypoints.length < 9) return;

    const indexTip = hand.keypoints[8];
    const x = indexTip.x;
    const y = indexTip.y;
  
    const mirroredX = map(x, 0, video.width, width, 0);
    const canvasY = map(y, 0, video.height, 0, height);
  
    const sliderBox = yellowIntervalSlider.elt.getBoundingClientRect();
    const canvasBox = document.querySelector("canvas").getBoundingClientRect();
  
    const sliderX = sliderBox.left - canvasBox.left - 500;
    const sliderY = sliderBox.top - canvasBox.top;
    const sliderW = sliderBox.width;
  
    if (
      abs(canvasY - sliderY) < 30 &&
      mirroredX >= sliderX &&
      mirroredX <= sliderX + sliderW
    ) {
      const val = map(mirroredX, sliderX, sliderX + sliderW, 100, 3000);
      yellowIntervalSlider.value(constrain(val, 100, 3000));
      console.log("🟡 yellowIntervalSlider 제어됨:", Math.round(val));
    }
}
//손가락 위치 기반으로 파란 슬라이더 제어
function controlBlueIntervalSliderWithIndex(hand) {
    if (!hand || !hand.keypoints || hand.keypoints.length < 9) return;
  
    const indexTip = hand.keypoints[8];
    const x = indexTip.x;
    const y = indexTip.y;
  
    const mirroredX = map(x, 0, video.width, width, 0);
    const canvasY = map(y, 0, video.height, 0, height);
  
    const sliderBox = blueIntervalSlider.elt.getBoundingClientRect();
    const canvasBox = document.querySelector("canvas").getBoundingClientRect();
  
    const sliderX = sliderBox.left - canvasBox.left - 500;
    const sliderY = sliderBox.top - canvasBox.top;
    const sliderW = sliderBox.width;
  
    if (
      abs(canvasY - sliderY) < 30 &&
      mirroredX >= sliderX &&
      mirroredX <= sliderX + sliderW
    ) {
      const val = map(mirroredX, sliderX, sliderX + sliderW, 1500, 5000);
      blueIntervalSlider.value(constrain(val, 1500, 5000));
      console.log("🔵 blueIntervalSlider 제어됨:", Math.round(val));
    }
}