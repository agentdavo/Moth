// u-blox M10 over UART1: switch baud, UBX only, NAV-PVT at gnss_rate, "sea"
// dynamic model. The configuration is RAM-only and is re-sent on every boot
// (and again if NAV-PVT stops arriving), so a factory-default module works.
#include "app.h"
#include "saillog_util.h"

namespace app {

static HardwareSerial& s_uart = Serial1;
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static GnssState s_state;
static saillog::UtcClock s_clock;
static bool s_have_first_fix = false;
static int64_t s_first_fix_utc = 0;
static saillog::UbxParser s_parser;

static const uint32_t kProbeBauds[] = {9600, 38400, 115200, 57600, 230400};

static void sendBytes(const uint8_t* b, size_t n) {
  s_uart.write(b, n);
  s_uart.flush();
}

// Sends the NAV configuration and waits for its ACK.
static bool sendNavConfigAndWaitAck(uint32_t timeout_ms) {
  uint8_t buf[160];
  size_t n = saillog::buildNavConfig(g_cfg.gnss_rate_hz, buf, sizeof(buf));
  sendBytes(buf, n);
  uint32_t t0 = millis();
  saillog::UbxParser p;
  while (millis() - t0 < timeout_ms) {
    while (s_uart.available()) {
      if (p.feed(static_cast<uint8_t>(s_uart.read()))) {
        bool acked = false;
        if (saillog::isAckFor(p.cls(), p.id(), p.payload(), p.len(), saillog::ubx::kClsCfg,
                              saillog::ubx::kIdValset, acked))
          return acked;
      }
    }
    delay(2);
  }
  return false;
}

static bool configure() {
  uint8_t buf[32];
  size_t n = saillog::buildBaudConfig(g_cfg.gnss_baud, buf, sizeof(buf));
  // The module may be at any common speed: tell it the new speed at each.
  for (uint32_t b : kProbeBauds) {
    if (b == g_cfg.gnss_baud) continue;
    s_uart.updateBaudRate(b);
    delay(5);
    sendBytes(buf, n);
    delay(20);
  }
  s_uart.updateBaudRate(g_cfg.gnss_baud);
  delay(50);
  while (s_uart.available()) s_uart.read();
  for (int attempt = 0; attempt < 3; ++attempt) {
    if (sendNavConfigAndWaitAck(400)) return true;
  }
  return false;
}

void gnssBegin() {
  s_clock = saillog::UtcClock(g_cfg.gnss_latency_ms);
  s_uart.setRxBufferSize(2048);
  s_uart.begin(g_cfg.gnss_baud, SERIAL_8N1, PIN_GNSS_RX, PIN_GNSS_TX);
  bool ok = configure();
  portENTER_CRITICAL(&s_mux);
  s_state.configured = ok;
  portEXIT_CRITICAL(&s_mux);
}

void gnssTask(void*) {
  uint32_t last_pvt_ms = millis();
  uint32_t last_frame_ms = 0;
  for (;;) {
    while (s_uart.available()) {
      if (!s_parser.feed(static_cast<uint8_t>(s_uart.read()))) continue;
      uint32_t now = millis();
      last_frame_ms = now;
      if (s_parser.cls() == saillog::ubx::kClsNav && s_parser.id() == saillog::ubx::kIdNavPvt) {
        saillog::NavPvt pvt;
        if (!saillog::parseNavPvt(s_parser.payload(), s_parser.len(), pvt)) continue;
        last_pvt_ms = now;
        portENTER_CRITICAL(&s_mux);
        s_state.pvt = pvt;
        s_state.rx_ms = now;
        s_state.seq++;
        if (pvt.time_valid) s_clock.onGnssTime(pvt.utc_ms, now);
        if (!s_have_first_fix && pvt.fix >= 2 && pvt.time_valid) {
          s_have_first_fix = true;
          s_first_fix_utc = pvt.utc_ms;
        }
        portEXIT_CRITICAL(&s_mux);
      }
    }
    uint32_t now = millis();
    portENTER_CRITICAL(&s_mux);
    s_state.alive = last_frame_ms && (now - last_frame_ms) < 2000;
    s_state.frames = s_parser.frames();
    s_state.errors = s_parser.errors();
    portEXIT_CRITICAL(&s_mux);
    // No NAV-PVT for 5 s (module power-cycled or never configured): redo it.
    if (now - last_pvt_ms > 5000) {
      bool ok = configure();
      portENTER_CRITICAL(&s_mux);
      s_state.configured = ok;
      portEXIT_CRITICAL(&s_mux);
      last_pvt_ms = millis();
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void gnssGet(GnssState& out) {
  portENTER_CRITICAL(&s_mux);
  out = s_state;
  portEXIT_CRITICAL(&s_mux);
}

bool utcNow(uint32_t t_ms, int64_t& utc_ms) {
  portENTER_CRITICAL(&s_mux);
  bool ok = s_clock.valid();
  if (ok) utc_ms = s_clock.utcAt(t_ms);
  portEXIT_CRITICAL(&s_mux);
  return ok;
}

bool firstFixUtc(int64_t& utc_ms) {
  portENTER_CRITICAL(&s_mux);
  bool ok = s_have_first_fix;
  utc_ms = s_first_fix_utc;
  portEXIT_CRITICAL(&s_mux);
  return ok;
}

}  // namespace app
