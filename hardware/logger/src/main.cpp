// Sailing datalogger firmware (sail-log v1, docs/LOG_FORMAT.md).
// ESP32-S3 + BNO085/086 IMU + u-blox M10 GNSS + microSD + passive servo taps.
#include <Arduino.h>

#include <atomic>

#include "app.h"
#include "saillog_csv.h"
#include "saillog_pulse.h"
#include "saillog_util.h"

namespace app {

saillog::Config g_cfg;

static portMUX_TYPE s_tel_mux = portMUX_INITIALIZER_UNLOCKED;
static Telemetry s_tel{};
static saillog::VbatFilter s_vbat;
static portMUX_TYPE s_vbat_mux = portMUX_INITIALIZER_UNLOCKED;
static std::atomic<int32_t> s_pending_event{0};
static std::atomic<int32_t> s_event_counter{0};
static std::atomic<bool> s_level_req{false};
static std::atomic<uint32_t> s_ack_until_ms{0};
static bool s_imu_present = false;
static std::atomic<bool> s_level_done{false};
static bool s_booting = true;

void telemetryGet(Telemetry& t) {
  portENTER_CRITICAL(&s_tel_mux);
  t = s_tel;
  portEXIT_CRITICAL(&s_tel_mux);
}

void telemetrySet(const Telemetry& t) {
  portENTER_CRITICAL(&s_tel_mux);
  s_tel = t;
  portEXIT_CRITICAL(&s_tel_mux);
}

float vbatVolts() {
  portENTER_CRITICAL(&s_vbat_mux);
  float v = s_vbat.valid() ? s_vbat.volts() : NAN;
  portEXIT_CRITICAL(&s_vbat_mux);
  return v;
}

void requestLevelCapture() { s_level_req = true; }

static void markEvent() {
  int32_t n = ++s_event_counter;
  s_pending_event = n;
  s_ack_until_ms = millis() + 300;
}

// ------------------------------------------------------------ sampler --
static void samplerTask(void*) {
  saillog::AttitudeSolver solver;
  double R[3][3];
  if (saillog::parseMount(g_cfg.imu_mount, R)) solver.setMount(R);
  solver.setYawTrim(g_cfg.yaw_trim_deg);
  solver.setDeclination(g_cfg.has_declination, g_cfg.declination_deg);
  double r0, p0;
  if (sdLoadedLevel(r0, p0)) solver.setLevel(r0, p0);

  saillog::SwitchEvent sw(g_cfg.event_threshold_us);
  const bool want_yaw = g_cfg.imu_fusion == saillog::ImuFusion::RotationVector;
  const uint32_t period_ms = 1000 / g_cfg.rate_hz;
  const double kDeg = 180.0 / PI;

  uint32_t last_seq = 0;
  int level_n = 0;
  double level_r = 0, level_p = 0;
  static char row[saillog::kMaxRowLen];

  TickType_t wake = xTaskGetTickCount();
  uint32_t prev_t = millis();
  for (;;) {
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(period_ms));
    const uint32_t t = millis();
    // A late wake-up (should not happen: this is the highest-priority task
    // on its core) means rows were skipped: count them as dropped.
    uint32_t gap = t - prev_t;
    for (uint32_t k = 2 * period_ms; k <= gap; k += period_ms) sdNoteDropped();
    prev_t = t;

    ImuState imu;
    const bool imu_ok = imuGet(imu);
    GnssState g;
    gnssGet(g);

    saillog::LogRow r;
    saillog::clearRow(r);
    r.t_ms = t;
    r.has_utc = utcNow(t, r.utc_ms);

    if (g.seq != last_seq) {
      r.gnss_new = true;
      last_seq = g.seq;
    }
    const bool gnss_fresh = g.seq && (t - g.rx_ms) < 2000;
    if (gnss_fresh) {
      r.has_fix = true;
      r.fix = g.pvt.fix;
      r.sats = g.pvt.num_sv;
      if (g.pvt.fix >= 2) {
        r.lat = g.pvt.lat_deg;
        r.lon = g.pvt.lon_deg;
        r.sog = g.pvt.sog_mps;
        r.cog = g.pvt.cog_deg;
        r.sacc = g.pvt.sacc_mps;
        r.hacc = g.pvt.hacc_m;
      }
    }

    Telemetry tel{};
    if (imu_ok) {
      // Level capture: average the raw tilt over 25 rows.
      if (s_level_req.exchange(false)) {
        level_n = 25;
        level_r = level_p = 0;
      }
      if (level_n > 0) {
        double rr, pp;
        solver.rawTilt(imu.q, rr, pp);
        level_r += rr;
        level_p += pp;
        if (--level_n == 0) {
          solver.setLevel(level_r / 25.0, level_p / 25.0);
          sdNoteLevelCapture(level_r / 25.0, level_p / 25.0);
          s_ack_until_ms = millis() + 1500;
          s_level_done = true;  // reported by loop(): no printing in this task
        }
      }
      saillog::Euler e = solver.solve(imu.q);
      r.roll = e.roll;
      r.pitch = e.pitch;
      if (want_yaw) r.yaw = e.yaw;
      if (imu.has_gyro) {
        saillog::Vec3 w = solver.toBody(imu.gyro);
        r.gx = w.x * kDeg;
        r.gy = w.y * kDeg;
        r.gz = w.z * kDeg;
      }
      if (imu.has_accel) {
        saillog::Vec3 a = solver.toBody(imu.accel);
        r.ax = a.x;
        r.ay = a.y;
        r.az = a.z;
      }
      tel.has_att = true;
      tel.roll = e.roll;
      tel.pitch = e.pitch;
      tel.has_yaw = want_yaw;
      tel.yaw = e.yaw;
    }

    servoPoll(static_cast<uint32_t>(esp_timer_get_time()), r.servo_us);
    if (g_cfg.event_channel >= 0) {
      int32_t w = r.servo_us[g_cfg.event_channel];
      if (sw.update(w > 0, static_cast<uint16_t>(w > 0 ? w : 0))) markEvent();
    }
    r.event = s_pending_event.exchange(0);

    float vb = vbatVolts();
    if (!isnan(vb)) r.vbat = vb;

    size_t n = saillog::formatRow(r, row, sizeof(row));
    if (n) sdPushRow(row, n);

    tel.has_fix = gnss_fresh && g.pvt.fix >= 2;
    tel.lat = g.pvt.lat_deg;
    tel.lon = g.pvt.lon_deg;
    tel.sog = g.pvt.sog_mps;
    tel.cog = g.pvt.cog_deg;
    tel.vbat = isnan(vb) ? 0 : vb;
    telemetrySet(tel);
  }
}

// ---------------------------------------------------------------- LED --
static void ledWrite(bool on, saillog::LedMode m) {
#if LED_IS_RGB
  uint8_t r = 0, g = 0, b = 0;
  if (on) {
    switch (m) {
      case saillog::LedMode::SdError: r = 40; break;
      case saillog::LedMode::ImuError: r = 30; b = 30; break;
      case saillog::LedMode::NoFix: r = 30; g = 20; break;
      case saillog::LedMode::Logging: g = 40; break;
      default: r = g = b = 20; break;
    }
  }
  neopixelWrite(PIN_LED, r, g, b);
#else
  digitalWrite(PIN_LED, (on ^ (LED_ACTIVE_LOW != 0)) ? HIGH : LOW);
#endif
}

static void ledUpdate(uint32_t now, const saillog::Button& btn) {
  GnssState g;
  gnssGet(g);
  bool fix = g.seq && (now - g.rx_ms) < 2000 && g.pvt.fix >= 2;
  ImuState imu;
  bool imu_ok = imuGet(imu);
  saillog::LedMode m = saillog::selectLedMode(s_booting, sdCardOk(), sdLogging(), imu_ok, fix);
  bool on = saillog::ledOn(m, now);
  // Feedback overlays: acknowledgement flash, and while the button is held
  // solid = "release now to level", dark = "release now to stop/start".
  uint32_t held = btn.heldMs(now);
  if (held >= 6000) on = false;
  else if (held >= 2000) on = true;
  if (static_cast<int32_t>(s_ack_until_ms.load() - now) > 0) on = true;
  ledWrite(on, m);
}

// ------------------------------------------------------------ console --
static void printStatus() {
  ImuState imu;
  bool imu_ok = imuGet(imu);
  GnssState g;
  gnssGet(g);
  Telemetry t;
  telemetryGet(t);
  int32_t servo[4];
  servoPoll(static_cast<uint32_t>(esp_timer_get_time()), servo);
  Serial.printf("%s %s | file %s logging %d rows %u dropped %u buf %u B\n", LOGGER_ID, BOARD_NAME,
                sdFileName(), (int)sdLogging(), (unsigned)sdRows(), (unsigned)sdDropped(),
                (unsigned)sdBufferUsed());
  Serial.printf("imu %s mag_status %u hdg_acc %.1f deg resets %u | roll %.1f pitch %.1f yaw %.1f\n",
                imu_ok ? "ok" : "MISSING", imu.mag_status,
                imu.q_accuracy_rad >= 0 ? imu.q_accuracy_rad * 180.0 / PI : -1.0,
                (unsigned)imu.resets, t.roll, t.pitch, t.yaw);
  Serial.printf("gnss %s cfg %d fix %u sats %u sog %.2f cog %.1f hacc %.1f frames %u err %u\n",
                g.alive ? "ok" : "SILENT", (int)g.configured, g.pvt.fix, g.pvt.num_sv,
                g.pvt.sog_mps, g.pvt.cog_deg, g.pvt.hacc_m, (unsigned)g.frames, (unsigned)g.errors);
  Serial.printf("servo us rudder %d sheet %d aux1 %d aux2 %d | vbat %.2f V\n", (int)servo[0],
                (int)servo[1], (int)servo[2], (int)servo[3], vbatVolts());
}

static void printRaw() {
  ImuState imu;
  imuGet(imu);
  Serial.printf("sensor-frame accel x %.2f y %.2f z %.2f m/s2 (the axis reading about +9.8 points UP)\n",
                imu.accel.x, imu.accel.y, imu.accel.z);
}

static void handleConsole() {
  static char line[64];
  static size_t n = 0;
  while (Serial.available()) {
    char c = static_cast<char>(Serial.read());
    if (c != '\n' && c != '\r') {
      if (n < sizeof(line) - 1) line[n++] = c;
      continue;
    }
    if (!n) continue;
    line[n] = '\0';
    n = 0;
    if (!strcmp(line, "status")) printStatus();
    else if (!strcmp(line, "raw")) printRaw();
    else if (!strcmp(line, "level")) requestLevelCapture();
    else if (!strcmp(line, "event")) markEvent();
    else if (!strcmp(line, "stop")) sdRequestStop();
    else if (!strcmp(line, "start")) sdRequestStart();
    else if (!strcmp(line, "magcal")) {
      imuStartMagCal();
      Serial.println("magcal: dynamic calibration on; rotate the boat slowly through all axes");
    } else if (!strcmp(line, "savecal")) {
      imuSaveCal();
      Serial.println("savecal: calibration saved in the BNO08x");
    } else {
      Serial.println("commands: status raw level event stop start magcal savecal");
    }
  }
}

}  // namespace app

using namespace app;

static saillog::Button s_button;
static uint32_t s_low_since = 0;
static bool s_low_stopped = false;

void setup() {
  setCpuFrequencyMhz(80);  // plenty for 50-100 Hz rows; saves ~20 mA over 240 MHz
  Serial.begin(115200);
#if !LED_IS_RGB
  pinMode(PIN_LED, OUTPUT);
#endif
  ledWrite(true, saillog::LedMode::Boot);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  analogSetPinAttenuation(PIN_VBAT, ADC_11db);
  delay(300);
  Serial.printf("\n%s (%s)\n", LOGGER_ID, BOARD_NAME);

  saillog::setDefaults(g_cfg);
  sdBegin();  // reads /config.txt into g_cfg when a card is present
  s_vbat.setScale(g_cfg.vbat_scale);

  s_imu_present = imuBegin();
  Serial.println(s_imu_present ? "imu: BNO08x ok" : "imu: BNO08x NOT FOUND (logging without IMU)");
  gnssBegin();
  servoBegin();
  sportBegin();

  if (sdCardOk()) sdStartFile();

  if (s_imu_present) xTaskCreatePinnedToCore(imuTask, "imu", 4096, nullptr, 5, nullptr, 1);
  xTaskCreatePinnedToCore(gnssTask, "gnss", 4096, nullptr, 4, nullptr, 1);
  xTaskCreatePinnedToCore(samplerTask, "sampler", 6144, nullptr, 6, nullptr, 1);
  xTaskCreatePinnedToCore(sdTask, "sd", 6144, nullptr, 3, nullptr, 0);
  if (g_cfg.sport_enable) xTaskCreatePinnedToCore(sportTask, "sport", 3072, nullptr, 4, nullptr, 0);
  s_booting = false;
}

void loop() {
  static uint32_t last_adc = 0, last_led = 0;
  static bool boot_level_done = false;
  const uint32_t now = millis();

  switch (s_button.update(digitalRead(PIN_BUTTON) == LOW, now)) {
    case saillog::Press::Short:
      markEvent();
      break;
    case saillog::Press::Long:
      Serial.println("button: level capture (hold the hull level and still)");
      requestLevelCapture();
      break;
    case saillog::Press::VeryLong:
      if (sdLogging()) sdRequestStop();
      else sdRequestStart();
      break;
    default:
      break;
  }

  if (now - last_adc >= 100) {
    last_adc = now;
    uint32_t mv = analogReadMilliVolts(PIN_VBAT);
    portENTER_CRITICAL(&s_vbat_mux);
    float v = s_vbat.update(mv);
    portEXIT_CRITICAL(&s_vbat_mux);
    // Close the file cleanly before the supply collapses.
    if (g_cfg.vbat_stop > 0 && v < g_cfg.vbat_stop && sdLogging() && !s_low_stopped) {
      if (!s_low_since) s_low_since = now;
      if (now - s_low_since > 2000) {
        Serial.println("vbat low: closing log");
        sdRequestStop();
        s_low_stopped = true;
      }
    } else {
      s_low_since = 0;
    }
  }

  if (g_cfg.level_at_boot && !boot_level_done && now > 3000) {
    boot_level_done = true;
    requestLevelCapture();
  }

  if (now - last_led >= 10) {
    last_led = now;
    ledUpdate(now, s_button);
  }
  handleConsole();
  // Messages from the sampler task are printed here, never from the sampler.
  static int32_t printed_event = 0;
  int32_t ev = s_event_counter.load();
  if (ev != printed_event) {
    printed_event = ev;
    Serial.printf("event %d\n", (int)ev);
  }
  if (s_level_done.exchange(false)) {
    double r0, p0;
    sdLoadedLevel(r0, p0);
    Serial.printf("level captured: roll0 %.2f pitch0 %.2f\n", r0, p0);
  }
  delay(5);
}
