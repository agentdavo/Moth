// FrSky S.Port (SmartPort) sensor emulation on one GPIO.
//
// The S.Port line is inverted UART at 57600 8N1, half duplex. UART2 is
// mapped to the same pin for RX and TX with both signals inverted in the
// UART; the pin's output driver is enabled only while we answer a poll, so
// the line is otherwise left to the receiver. Our own reply echoes back into
// RX and is ignored (a stuffed frame never contains 0x7E).
//
// Enable with sport_enable = 1 in /config.txt; compile out with
// -DSAILLOG_SPORT=0. A 1 kOhm series resistor between the pin and the
// receiver's S.Port signal is recommended.
#include "app.h"

#if SAILLOG_SPORT

#include <driver/gpio.h>

#include "saillog_sport.h"

namespace app {

static HardwareSerial& s_port = Serial2;
static bool s_enabled = false;

void sportBegin() {
  if (!g_cfg.sport_enable || PIN_SPORT < 0) return;
  s_port.begin(57600, SERIAL_8N1, PIN_SPORT, PIN_SPORT, true, 20000, 1);
  gpio_set_pull_mode(static_cast<gpio_num_t>(PIN_SPORT), GPIO_FLOATING);
  gpio_set_direction(static_cast<gpio_num_t>(PIN_SPORT), GPIO_MODE_INPUT);
  s_enabled = true;
}

static void transmit(const uint8_t* b, size_t n) {
  gpio_set_direction(static_cast<gpio_num_t>(PIN_SPORT), GPIO_MODE_INPUT_OUTPUT);
  s_port.write(b, n);
  s_port.flush();  // wait until the last stop bit has left
  gpio_set_direction(static_cast<gpio_num_t>(PIN_SPORT), GPIO_MODE_INPUT);
}

void sportTask(void*) {
  if (!s_enabled) vTaskDelete(nullptr);
  saillog::SportPollDetector det(g_cfg.sport_id);
  saillog::SportScheduler sched;
  for (;;) {
    while (s_port.available()) {
      if (!det.feed(static_cast<uint8_t>(s_port.read()))) continue;
      Telemetry t;
      telemetryGet(t);
      saillog::SportValues v;
      v.has_fix = t.has_fix;
      v.lat = t.lat;
      v.lon = t.lon;
      v.sog_mps = t.sog;
      v.cog_deg = t.cog;
      v.has_att = t.has_att;
      v.roll = t.roll;
      v.pitch = t.pitch;
      v.has_yaw = t.has_yaw;
      v.yaw = t.yaw;
      v.has_vmg = t.has_fix && g_cfg.has_vmg_bearing;
      v.vmg_mps = saillog::vmgToward(t.sog, t.cog, g_cfg.vmg_bearing_deg);
      v.has_vbat = t.vbat > 0.5f;
      v.vbat = t.vbat;
      uint16_t id;
      uint32_t value;
      if (sched.next(v, id, value)) {
        uint8_t frame[16];
        size_t n = saillog::sportBuildFrame(id, value, frame);
        transmit(frame, n);
      }
    }
    vTaskDelay(1);
  }
}

}  // namespace app

#else

namespace app {
void sportBegin() {}
void sportTask(void*) { vTaskDelete(nullptr); }
}  // namespace app

#endif
