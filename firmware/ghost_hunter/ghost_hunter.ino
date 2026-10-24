// Campus Energy Ghost Hunter - ESP32 firmware (PIR + ACS712 -> Wi-Fi -> dashboard)
#include <WiFi.h>
#include <HTTPClient.h>
#include "secrets.h"

const int PIR_PIN = 27;
const int CURRENT_PIN = 34;            // ADC1 pin (safe with Wi-Fi)
const int SAMPLES = 500;
const float SENSITIVITY_MV_A = 185.0;  // ACS712-5A
const float DIVIDER_FACTOR = 2.0;      // 10k + 10k divider
const float ALERT_A = 0.05;
float baselineADC = 0;

float readAverage() {
  long total = 0;
  for (int i = 0; i < SAMPLES; i++) { total += analogRead(CURRENT_PIN); delayMicroseconds(500); }
  return total / (float)SAMPLES;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to Wi-Fi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  if (WiFi.status() == WL_CONNECTED) Serial.println("\nConnected: " + WiFi.localIP().toString());
  else Serial.println("\nWi-Fi failed (will retry)");
}

void sendReading(int motion, float currentA) {
  if (WiFi.status() != WL_CONNECTED) { connectWiFi(); return; }
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  String body = String("{\"roomId\":\"") + ROOM_ID + "\",\"motion\":" + motion +
                ",\"current\":" + String(currentA, 3) + "}";
  int code = http.POST(body);
  Serial.printf("POST %s -> %d\n", body.c_str(), code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  analogReadResolution(12);
  Serial.println("\nCampus Energy Ghost Hunter\nKeep fan OFF for calibration...");
  delay(2000);
  baselineADC = readAverage();
  Serial.printf("Baseline ADC: %.2f\n", baselineADC);
  connectWiFi();
}

void loop() {
  int motion = digitalRead(PIR_PIN);
  float deltaMv = (readAverage() - baselineADC) * 3300.0 / 4095.0 * DIVIDER_FACTOR;
  float currentA = fabs(deltaMv) / SENSITIVITY_MV_A;
  if (motion == LOW && currentA > ALERT_A) Serial.println("ALERT: Possible Energy Wastage!");
  Serial.printf("Motion=%d  Current=%.3f A\n", motion, currentA);
  sendReading(motion, currentA);
  delay(1000);
}
