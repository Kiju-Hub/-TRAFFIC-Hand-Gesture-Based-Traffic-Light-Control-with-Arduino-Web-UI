#include <Arduino.h>
#include <TaskScheduler.h>
#include <PinChangeInterrupt.h>

// 핀 정의
const int redLedPin = 9;
const int yellowLedPin = 10;
const int blueLedPin = 11;
const int button1Pin = 5;
const int button2Pin = 6;
const int button3Pin = 7;
const int potPin = A0;

// 상태 변수
volatile bool blinkMode = false;
volatile bool redOnlyMode = false;
volatile bool allLedOff = false;
bool redState = false, yellowState = false, blueState = false;
bool blueBlinkStarted = false;
bool blinkState = true;
int brightness = 255;
String mode = "Normal";

// 시간 정의
unsigned long redDuration = 2000;
unsigned long yellowDuration = 500;
unsigned long blueDuration = 3000;
unsigned long extraYellowDuration = 500;
unsigned long previousMillis = 0;     
unsigned long blueBlinkTime = 1000;  //추가 된 부분✅ // blueBlinkTime = 1000;
                                    //깜빡이는 주기를 blueBlinkTime / 6으로 나눠서 blueBlinkTask가 정확히 6번 깜빡이게 설정.
                                    //주기 설정은 setInterval() / 반복 횟수는 setIterations()으로 정확히 제어



// Task Scheduler
Scheduler runner;
void trafficLightTaskCallback();
void blueBlinkTaskCallback();
void blinkTaskCallback();
void adjustBrightnessTaskCallback();
void sendSerialData();

Task trafficLightTask(100, TASK_FOREVER, &trafficLightTaskCallback, &runner, false);
Task blueBlinkTask(167, 6, &blueBlinkTaskCallback, &runner, false);
Task blinkTask(500, TASK_FOREVER, &blinkTaskCallback, &runner, false);
Task adjustBrightnessTask(10, TASK_FOREVER, &adjustBrightnessTaskCallback, &runner, true);
Task serialTask(100, TASK_FOREVER, &sendSerialData, &runner, true);


void sendSerialDataIfChanged(String currentState);  //✅ 추가된 함수 선언 중복 출력 방지용

// 초기화 함수
void resetAllLeds() {
  analogWrite(redLedPin, 0);
  analogWrite(yellowLedPin, 0);
  analogWrite(blueLedPin, 0);
  blinkTask.disable();
  trafficLightTask.disable();
  blueBlinkTask.disable();
  blinkMode = false;
  redOnlyMode = false;
  allLedOff = false;
}

void setMode(String newMode) {
  resetAllLeds();
  mode = newMode;

  if (newMode == "Red Only") {
    redOnlyMode = true;
    analogWrite(redLedPin, brightness);
  } else if (newMode == "All Blink") {
    blinkMode = true;
    blinkTask.enable();
  } else if (newMode == "All Off") {
    allLedOff = true;
  } else if (newMode == "Normal") {
    previousMillis = millis();
    trafficLightTask.enable();
  }

  sendSerialData();
}

// 인터럽트 핸들러
void toggleBlinkMode() { setMode(blinkMode ? "Normal" : "All Blink"); }
void toggleRedOnlyMode() { setMode(redOnlyMode ? "Normal" : "Red Only"); }
void toggleAllLedOff() { setMode(allLedOff ? "Normal" : "All Off"); }

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(10);

  pinMode(redLedPin, OUTPUT);
  pinMode(yellowLedPin, OUTPUT);
  pinMode(blueLedPin, OUTPUT);
  pinMode(potPin, INPUT);

  pinMode(button1Pin, INPUT_PULLUP);
  pinMode(button2Pin, INPUT_PULLUP);
  pinMode(button3Pin, INPUT_PULLUP);

  attachPCINT(digitalPinToPCINT(button1Pin), toggleBlinkMode, FALLING);
  attachPCINT(digitalPinToPCINT(button2Pin), toggleRedOnlyMode, FALLING);
  attachPCINT(digitalPinToPCINT(button3Pin), toggleAllLedOff, FALLING);

  previousMillis = millis();
  trafficLightTask.enable();
}

void loop() {
    runner.execute();// TaskScheduler 실행
  
    if (Serial.available()) {
        delay(50);  // ✅ 추가됨: Serial 버퍼 수신 안정화용
        String command = Serial.readStringUntil('\n');// 줄바꿈('\n')까지 문자열로 읽기
        command.trim();//문자열 앞뒤의 공백, '\r', '\n' 등을 제거

        //디버깅용: 수신한 원본 명령 출력
        Serial.print("📩 Raw command received: [");
        Serial.print(command);
        Serial.println("]");

        // 단일 문자로 모드 전환 (버튼 대신 Serial 명령으로도 가능)
        if(command == "R") setMode("Red Only");
        else if (command == "A") setMode("All Blink");
        else if (command == "O") setMode("All Off");
        else if (command == "N") setMode("Normal");

        //CONFIG 명령어 처리.
        else if (command.startsWith("CONFIG")) {
          Serial.print("📩 Received config: ");
          Serial.println(command);
      
          command.remove(0, 7);  // CONFIG, 제거
          command.trim();        //혹시 있을 공백 제거
      
          char buffer[100];
          command.toCharArray(buffer, sizeof(buffer));
            
          //CSV 형식으로 label-value 쌍 추출한다
          char* token = strtok(buffer, ",");
          while (token != NULL) {
              String label = String(token); // 예: "Red"
              token = strtok(NULL, ","); // 예: "2000"
              if (token == NULL) break;
              int value = atoi(token);   // 문자열 → 정수

                // 🔴 빨간불 시간 설정 (최소 1000ms) 
              if (label == "Red") {
                  redDuration = max((unsigned long)value, 1000UL);
                // 🟡 노란불 시간 설정 (최소 100ms)
              } 
              else if (label == "Yellow") {
                  yellowDuration = max((unsigned long)value, 100UL);
                  extraYellowDuration = yellowDuration;  
              }
                // 🔵 파란불 시간 및 깜빡이 설정 (최소 1500ms)
              else if (label == "Blue") {
                  blueDuration = max((unsigned long)value, 1500UL);
                  // 마지막 1초(=1000ms)는 깜빡이기로 사용
                  blueBlinkTime = 1000;
                  unsigned long blinkInterval = blueBlinkTime / 6; // 6번 깜빡이게
                  blueBlinkTask.setInterval(blinkInterval);
                  blueBlinkTask.setIterations(6);   // 6번 반복
                  blueBlinkTask.disable();   //blueblinkTask를 꺼줘야 나중에 재시작 가능하므로 disable
              }

              token = strtok(NULL, ",");  // 다음 토큰을 다시 받아야 함, 다음 label로 넘어간다.
          }  

          //혹시 버퍼에 남은 Serial 데이터가 있으면 모두 제거 (충돌 방지)
          while (Serial.available()) Serial.read();
         // 새로운 설정을 기준으로 신호등 타이밍 재시작
          previousMillis = millis();
        }
    }
}

void adjustBrightnessTaskCallback() {
  int potValue = analogRead(potPin);
  brightness = map(potValue, 0, 1023, 5, 255);
}


String lastSentState = "";

void sendSerialDataIfChanged(String currentState) {
  if (currentState != lastSentState) {
    sendSerialData();             // 상태가 바뀔 때만 시리얼 전송
    lastSentState = currentState; // 마지막 보낸 상태 업데이트
  }
}


void trafficLightTaskCallback() {
    if (blinkMode || redOnlyMode || allLedOff) return; // 모드가 Normal이 아닌 경우 (버튼 또는 시리얼로 변경된 경우) 작업 중단
    // 현재 경과 시간 계산
    unsigned long elapsedTime = millis() - previousMillis;


    // ✅ 수정된 부분 !!!!!!!!!!!
    //[구간을 명확하게 계산] 
    // 기존에는 각 조건문마다 red+yellow+blue-1000 이런 수식을 반복
    //    → 주기 조절 시 충돌이나 해석 오류가 생김
    //    → 그래서 미리 시간 경계(t_end)들을 계산해두고 그 구간을 비교하는 방식으로 변경하여 오류를 해결함,
    unsigned long t_red_end = redDuration;// 🔴 빨간불 끝나는 시점
    unsigned long t_yellow_end = t_red_end + yellowDuration;// 🟡 노란불 끝나는 시점
    unsigned long t_blue_steady_end = t_yellow_end + (blueDuration - blueBlinkTime);// 🔵 파란불(깜빡이기 전) 끝 시점
    unsigned long t_blue_blink_end = t_blue_steady_end + blueBlinkTime; // 🔵 파란불 깜빡이기 끝나는 시점
    unsigned long t_extra_yellow_end = t_blue_blink_end + extraYellowDuration; // 🟡 추가 노란불까지의 전체 시점
     // 🔴 [1단계] 빨간불 유지
    if (elapsedTime < t_red_end) {  
        analogWrite(redLedPin, brightness);
        analogWrite(yellowLedPin, 0);
        analogWrite(blueLedPin, 0);

        redState = true;
        yellowState = false;
        blueState = false;
        blueBlinkStarted = false;

        sendSerialDataIfChanged("Red");
    }  // 🟡 [2단계] 노란불 유지
    else if (elapsedTime < t_yellow_end) {  
        analogWrite(redLedPin, 0);
        analogWrite(yellowLedPin, brightness);
        analogWrite(blueLedPin, 0);

        redState = false;
        yellowState = true;
        blueState = false;
        blueBlinkStarted = false;

        sendSerialDataIfChanged("Yellow");
    } // 🔵 [3단계] 파란불 (깜빡이기 전 steady phase)
    else if (elapsedTime < t_blue_steady_end) {  
        analogWrite(blueLedPin, brightness);
        analogWrite(redLedPin, 0);
        analogWrite(yellowLedPin, 0);

        redState = false;
        yellowState = false;
        blueState = true;
        blueBlinkStarted = false;

        sendSerialDataIfChanged("Blue");
    } // 🔵 [4단계] 파란불 깜빡이기 phase
    else if (elapsedTime < t_blue_blink_end) {  
        if (!blueBlinkStarted) {
            blueBlinkStarted = true;
            blueBlinkTask.restart();
            sendSerialDataIfChanged("BlueBlink");
        }
        // 블링크 동안 상태는 blueBlinkTaskCallback에서 처리
    }// 🟡 [5단계] 추가 노란불 (파란불 깜빡이기 후)
    else if (elapsedTime < t_extra_yellow_end) {  
        analogWrite(redLedPin, 0);
        analogWrite(yellowLedPin, brightness);
        analogWrite(blueLedPin, 0);

        redState = false;
        yellowState = true;
        blueState = false;
        blueBlinkStarted = false;

        sendSerialDataIfChanged("ExtraYellow");
    }  //[6단계] 모든 구간 종료 → 다음 사이클로 재시작
    else {
        previousMillis = millis();// 다음 사이클 타이머 리셋
    }
}


  
  
void blueBlinkTaskCallback() {
    blinkState = !blinkState;  // 깜빡이기 상태 토글
    analogWrite(blueLedPin, blinkState ? brightness : 0);  // 파란 LED 깜빡이기
      //현재 깜빡이는 순간을 웹에 알려줌
    Serial.print("BlueBlinkState,");
    Serial.println(blinkState ? "On" : "Off");
    if (blueBlinkTask.isLastIteration()) {
        analogWrite(blueLedPin, brightness);  // 파란 LED 켜기
    }
}


void blinkTaskCallback() {
  static bool ledState = false;
  if (blinkMode) {
    ledState = !ledState;
    analogWrite(redLedPin, ledState ? brightness : 0);
    analogWrite(yellowLedPin, ledState ? brightness : 0);
    analogWrite(blueLedPin, ledState ? brightness : 0);
  }
}

void sendSerialData() {
    // ✅ 코드 수정된 부분 !!!!!
    //모드 우선순위에 따라 현재 신호등 상태 문자열 결정
  String light = "Off";
  if (mode == "All Blink") light = "All Blinking";
  else if (mode == "All Off") light = "Off";
  else if (mode == "Red Only") light = "Red";
  else if (blueBlinkTask.isEnabled()) light = "BlueBlink";  // ✅ 깜빡이기 Task가 실행 중이면 BlueBlink 상태로 판단 (더 정확!)
  else if (redState) light = "Red";
  else if (yellowState) light = "Yellow";
  else if (blueState) light = "Blue";
    
    // ✅ CSV 형식으로 전송하는 이유:
    // 1️. JSON 방식은 쌍따옴표와 중괄호가 포함되어 있어 parsing 시 JS에서 추가 가공이 필요하다. 그래서 오류가 생겼었음.
    //    - 예: JSON.parse() 또는 복잡한 정규식

    // 2️. CSV는 웹에서 .split(',') 만으로 손쉽게 key-value 분리 가능
    //    - 예: "Light,Red,Red,1,Yellow,0,Blue,0" → [key1, value1, key2, value2, ...]
    // 3️. 데이터 길이가 짧고 가볍기 때문에 시리얼 통신 지연도 줄어듦 (경량화)
    // 4️. JSON에 비해 Serial 디버깅 로그도 보기 편하고 가독성이 높음기 때문에 JSON > CSV형식으로 전송하였다.

  Serial.print("Light,"); Serial.print(light);
  Serial.print(",Red,"); Serial.print(redState ? 1 : 0);
  Serial.print(",Yellow,"); Serial.print(yellowState ? 1 : 0);
  Serial.print(",Blue,"); Serial.print(blueState ? 1 : 0);
  Serial.print(",Mode,"); Serial.print(mode);
  Serial.print(",Brightness,"); Serial.println(brightness);
}
