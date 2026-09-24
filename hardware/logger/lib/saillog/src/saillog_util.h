// Small state machines: event button, status LED patterns, the GNSS-disciplined
// UTC clock used for the utc_ms column, and a supply-voltage filter.
#pragma once

#include <stdint.h>

namespace saillog {

// ---------------------------------------------------------------- button --
enum class Press : uint8_t {
  None,
  Short,     // < 1 s: event marker
  Long,      // 2..6 s: capture the level offset
  VeryLong,  // >= 6 s: close the file (stop) / start a new one
};

class Button {
 public:
  explicit Button(uint16_t debounce_ms = 30, uint16_t short_max_ms = 1000,
                  uint16_t long_min_ms = 2000, uint16_t very_long_min_ms = 6000)
      : deb_(debounce_ms), short_max_(short_max_ms), long_min_(long_min_ms),
        vlong_min_(very_long_min_ms) {}

  // Call every few ms with the raw (active = true) input. Presses are
  // classified on release.
  Press update(bool raw, uint32_t now_ms);
  bool pressed() const { return stable_; }
  uint32_t heldMs(uint32_t now_ms) const { return stable_ ? now_ms - press_ms_ : 0; }

 private:
  uint16_t deb_, short_max_, long_min_, vlong_min_;
  bool raw_ = false;
  bool stable_ = false;
  bool init_ = false;
  bool ignore_ = false;
  uint32_t raw_change_ms_ = 0;
  uint32_t press_ms_ = 0;
};

// ------------------------------------------------------------------- LED --
enum class LedMode : uint8_t {
  Boot,      // solid on while starting
  SdError,   // fast blink 5 Hz: no card / cannot write, nothing is logged
  ImuError,  // triple flash every 2 s: logging, but the IMU is not answering
  Stopped,   // slow blink 0.5 Hz: file closed by a very long press / low battery
  NoFix,     // double flash every 2 s: logging, waiting for GNSS fix
  Logging,   // single short flash every 2 s: logging with a 3-D fix
};

LedMode selectLedMode(bool booting, bool sd_ok, bool logging, bool imu_ok, bool gnss_fix);
bool ledOn(LedMode m, uint32_t t_ms);

// ------------------------------------------------------------- UTC clock --
// Maps the monotonic t_ms onto UTC. The first GNSS time sets the offset;
// later solutions slew it by at most 2 ms per update so utc_ms stays
// monotonic, unless the error exceeds 500 ms (then it steps).
class UtcClock {
 public:
  explicit UtcClock(uint16_t latency_ms = 40) : latency_(latency_ms) {}
  // utc_ms: time of the GNSS epoch; rx_t_ms: t_ms when the message arrived.
  void onGnssTime(int64_t utc_ms, uint32_t rx_t_ms);
  bool valid() const { return valid_; }
  int64_t utcAt(uint32_t t_ms) const { return offset_ + static_cast<int64_t>(t_ms); }
  uint32_t steps() const { return steps_; }

 private:
  uint16_t latency_;
  bool valid_ = false;
  int64_t offset_ = 0;
  uint32_t steps_ = 0;
};

// -------------------------------------------------------------- battery --
// ADC millivolts -> supply volts through the divider, with a light IIR.
class VbatFilter {
 public:
  explicit VbatFilter(float scale = 3.128f, float alpha = 0.1f) : scale_(scale), alpha_(alpha) {}
  void setScale(float s) { scale_ = s; }
  float update(uint32_t adc_mv);
  float volts() const { return v_; }
  bool valid() const { return init_; }

 private:
  float scale_, alpha_;
  float v_ = 0;
  bool init_ = false;
};

}  // namespace saillog
